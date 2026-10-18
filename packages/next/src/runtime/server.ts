import { Buffer } from "node:buffer";
import process from "node:process";
import { clearImmediate, setImmediate } from "node:timers";
import routing, { type ResolveRoutesParams } from "@next/routing";
import { builtins } from "./builtins.ts";
import { createModules, type FileContent } from "./modules.ts";
import { NodeResponse, nodeRequest } from "./node-http.ts";
import { onOrigin } from "./urls.ts";

/** An entry Next.js built: a Node.js module exporting `handler`, or an edge entry registered under `entryKey`. */
export type Entry =
  | { runtime: "nodejs"; id: string; file: string }
  | { runtime: "edge"; id: string; files: string[]; entryKey: string; env: Record<string, string> };

/** What the build hands the server: the routing Next.js resolved and where each output's code is. */
export type ServerConfig = {
  buildId: string;
  basePath: string;
  i18n?: ResolveRoutesParams["i18n"];
  /** The project's directory in the virtual file system: the working directory of the entries. */
  projectDir: string;
  links: Record<string, string>;
  builtAt: string;
  routing: ResolveRoutesParams["routes"];
  /** Every pathname routing can resolve to, and the entry or static file behind it. */
  pathnames: Record<string, { entry: string } | { file: true }>;
  entries: Record<string, Entry>;
  middleware?: string;
  notFound?: string;
  /** The parts each entry's files are in. */
  partsOf: Record<string, number[]>;
};

// @next/routing is CommonJS whose exports Node cannot name statically.
const { resolveRoutes, responseToMiddlewareResult } = routing;

export type Part = () => Promise<{ default: Record<string, FileContent> }>;
type Env = { ASSETS: { fetch(input: string | Request): Promise<Response> } };
type Context = { waitUntil(promise: Promise<unknown>): void; oester: { clientAddress?: string } };
type NodeHandler = (req: unknown, res: NodeResponse, ctx: object) => Promise<unknown>;
type WebHandler = (request: Request, ctx: object) => Promise<Response>;

// Next answers these to tell the router what middleware decided; they are not for the visitor.
const internalHeaders = [
  "x-middleware-next",
  "x-middleware-set-cookie",
  "x-middleware-override-headers",
];

export function createServer(config: ServerConfig, parts: Part[]) {
  (process.env as Record<string, string | undefined>).NODE_ENV ??= "production";
  const moduleProcess = Object.create(process, { cwd: { value: () => config.projectDir } });
  const modules = createModules({
    links: config.links,
    builtins: { ...builtins, "node:process": moduleProcess },
    process: moduleProcess,
    globals: { Buffer, setImmediate, clearImmediate },
    mtime: new Date(config.builtAt),
  });
  const loadedParts = new Map<number, Promise<void>>();

  function loadPart(index: number): Promise<void> {
    let loading = loadedParts.get(index);
    if (!loading) {
      loading = parts[index]!().then((part) => modules.add(part.default));
      loadedParts.set(index, loading);
      loading.catch(() => loadedParts.delete(index));
    }
    return loading;
  }

  let environment = false;
  async function entryModule(id: string): Promise<Record<string, unknown>> {
    const entry = config.entries[id]!;
    await Promise.all((config.partsOf[id] ?? []).map(loadPart));
    if (entry.runtime === "nodejs") {
      // What `next start` sets up before any entry loads: AsyncLocalStorage on globalThis, among others.
      if (!environment) {
        modules.require("next/dist/build/adapter/setup-node-env.external");
        environment = true;
      }
      return modules.require(entry.file) as Record<string, unknown>;
    }
    throw new Error(`the edge runtime entry ${id} is not supported yet`);
  }

  async function runNode(
    id: string,
    request: Request,
    url: string,
    ctx: Context,
    status?: number,
  ): Promise<Response> {
    const handler = (await entryModule(id)).handler as NodeHandler;
    const req = nodeRequest(request, { url, clientAddress: ctx.oester.clientAddress });
    const res = new NodeResponse({ head: request.method === "HEAD" });
    if (status) res.statusCode = status;
    const done = handler(req, res, {
      waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
      requestMeta: { relativeProjectDir: "." },
    }).then(
      () => {
        if (!res.writableEnded) res.end();
      },
      (error: unknown) => {
        console.error(error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("Internal Server Error");
        } else res.destroy(error as Error);
      },
    );
    ctx.waitUntil(done);
    return res.response;
  }

  async function runMiddleware(request: Request, ctx: Context): Promise<Response> {
    const handler = (await entryModule(config.middleware!)).handler as WebHandler;
    return handler(request, {
      waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
      requestMeta: { relativeProjectDir: "." },
      signal: request.signal,
    });
  }

  function withHeaders(response: Response, headers: Headers | undefined): Response {
    const result = new Response(response.body, response);
    headers?.forEach((value, name) => {
      if (name === "set-cookie") result.headers.append(name, value);
      else if (!result.headers.has(name)) result.headers.set(name, value);
    });
    for (const name of internalHeaders) result.headers.delete(name);
    return result;
  }

  return {
    async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
      const url = new URL(request.url);
      let middlewareResponse: Response | undefined;
      let requestHeaders: Headers = request.headers;
      const result = await resolveRoutes({
        url,
        buildId: config.buildId,
        basePath: config.basePath,
        i18n: config.i18n,
        headers: request.headers,
        requestBody: request.body ?? new ReadableStream(),
        pathnames: Object.keys(config.pathnames),
        routes: config.routing,
        invokeMiddleware: async ({ url: middlewareUrl, headers }) => {
          if (!config.middleware) return {};
          const response = await runMiddleware(
            new Request(middlewareUrl, {
              method: request.method,
              headers,
              body: request.body ? request.clone().body : null,
              // @ts-expect-error a streamed body needs half duplex in fetch implementations
              duplex: "half",
            }),
            ctx,
          );
          const decision = responseToMiddlewareResult(response, headers, middlewareUrl);
          if (decision.rewrite) decision.rewrite = onOrigin(decision.rewrite, url);
          if (decision.redirect) decision.redirect.url = onOrigin(decision.redirect.url, url);
          requestHeaders = headers;
          if (decision.bodySent) middlewareResponse = response;
          return decision;
        },
      });

      if (result.middlewareResponded && middlewareResponse)
        return withHeaders(middlewareResponse, undefined);
      if (result.redirect) {
        const headers = new Headers(result.resolvedHeaders);
        headers.set("location", result.redirect.url.toString().replace(url.origin, ""));
        return new Response(null, { status: result.redirect.status, headers });
      }
      if (result.externalRewrite) {
        const proxied = await fetch(new Request(result.externalRewrite, request));
        return withHeaders(proxied, result.resolvedHeaders);
      }
      if (!result.resolvedPathname && result.status && result.resolvedHeaders?.has("location"))
        return new Response(null, { status: result.status, headers: result.resolvedHeaders });

      const target = result.resolvedPathname
        ? config.pathnames[result.resolvedPathname]
        : undefined;
      const forwarded = new Request(request.url, {
        method: request.method,
        headers: requestHeaders,
        body: request.body,
        // @ts-expect-error a streamed body needs half duplex in fetch implementations
        duplex: "half",
      });
      if (target && "file" in target) {
        const asset = await env.ASSETS.fetch(result.resolvedPathname!);
        return withHeaders(asset, result.resolvedHeaders);
      }
      if (target) {
        const invocation = result.invocationTarget!;
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(invocation.query))
          for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
        const search = query.size ? `?${query}` : "";
        const response = await runNode(
          target.entry,
          forwarded,
          `${invocation.pathname}${search}`,
          ctx,
          result.status,
        );
        return withHeaders(response, result.resolvedHeaders);
      }
      if (config.notFound) {
        const response = await runNode(
          config.notFound,
          forwarded,
          `${url.pathname}${url.search}`,
          ctx,
          404,
        );
        return withHeaders(response, result.resolvedHeaders);
      }
      return new Response("This page could not be found", { status: 404 });
    },
  };
}
