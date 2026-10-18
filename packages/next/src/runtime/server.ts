import { Buffer } from "node:buffer";
import process from "node:process";
import { clearImmediate, setImmediate } from "node:timers";
import routing, { type ResolveRoutesParams } from "@next/routing";
import { builtins } from "./builtins.ts";
import { loadEdgeEntry, type EdgeEntry, type EdgeHandler } from "./edge.ts";
import { createModules, type FileContent } from "./modules.ts";
import { NodeResponse, nodeRequest } from "./node-http.ts";
import { onOrigin } from "./urls.ts";

/** An entry Next.js built: a Node.js module exporting `handler`, or scripts for its edge runtime. */
export type Entry =
  { runtime: "nodejs"; id: string; file: string } | ({ runtime: "edge"; id: string } & EdgeEntry);

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
  /** What answers a path no route matches: an entry rendering the not-found page, or the static 404 page. */
  notFound?: { entry: string } | { file: string };
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
  const edgeHandlers = new Map<string, Promise<EdgeHandler>>();
  async function entryModule(id: string): Promise<{ handler: unknown }> {
    const entry = config.entries[id]!;
    await Promise.all((config.partsOf[id] ?? []).map(loadPart));
    if (entry.runtime === "edge") {
      let handler = edgeHandlers.get(id);
      if (!handler) {
        handler = loadEdgeEntry(entry, {
          read: modules.read,
          bytes: modules.bytes,
          builtins,
          process,
        });
        edgeHandlers.set(id, handler);
        handler.catch(() => edgeHandlers.delete(id));
      }
      return { handler: await handler };
    }
    // What `next start` sets up before any entry loads: AsyncLocalStorage on globalThis, among others.
    if (!environment) {
      modules.require("next/dist/build/adapter/setup-node-env.external");
      environment = true;
    }
    return modules.require(entry.file) as { handler: unknown };
  }

  async function runEdge(
    id: string,
    request: Request,
    url: string,
    ctx: Context,
  ): Promise<Response> {
    const handler = (await entryModule(id)).handler as EdgeHandler;
    return handler(
      new Request(new URL(url, request.url), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        // @ts-expect-error a streamed body needs half duplex in fetch implementations
        duplex: "half",
      }),
      { waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise), signal: request.signal },
    );
  }

  type Invocation = { env: Env; ctx: Context };

  function run(id: string, request: Request, url: string, call: Invocation, status?: number) {
    return config.entries[id]!.runtime === "edge"
      ? runEdge(id, request, url, call.ctx)
      : runNode(id, request, url, call, status);
  }

  /** Writes the not-found page into a Node response, for Pages Router pages that return `notFound`. */
  async function render404(req: unknown, res: NodeResponse, call: Invocation): Promise<void> {
    const notFound = config.notFound;
    res.statusCode = 404;
    if (notFound && "file" in notFound) {
      const page = await call.env.ASSETS.fetch(notFound.file);
      res.setHeader("content-type", page.headers.get("content-type") ?? "text/html; charset=utf-8");
      res.end(Buffer.from(await page.arrayBuffer()));
    } else if (notFound && config.entries[notFound.entry]!.runtime === "nodejs") {
      const handler = (await entryModule(notFound.entry)).handler as NodeHandler;
      await handler(req, res, { waitUntil: call.ctx.waitUntil, requestMeta: requestMeta(call) });
    } else res.end("This page could not be found");
  }

  function requestMeta(call: Invocation) {
    return {
      relativeProjectDir: ".",
      render404: (req: unknown, res: NodeResponse) => render404(req, res, call),
    };
  }

  async function runNode(
    id: string,
    request: Request,
    url: string,
    call: Invocation,
    status?: number,
  ): Promise<Response> {
    const { ctx } = call;
    const handler = (await entryModule(id)).handler as NodeHandler;
    const req = nodeRequest(request, { url, clientAddress: ctx.oester.clientAddress });
    const res = new NodeResponse({ head: request.method === "HEAD" });
    if (status) res.statusCode = status;
    const done = handler(req, res, {
      waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
      requestMeta: requestMeta(call),
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
      const call = { env, ctx };
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
        const response = await run(
          target.entry,
          forwarded,
          `${invocation.pathname}${search}`,
          call,
          result.status,
        );
        return withHeaders(response, result.resolvedHeaders);
      }
      if (config.notFound && "file" in config.notFound) {
        const page = await env.ASSETS.fetch(config.notFound.file);
        return withHeaders(
          new Response(page.body, { status: 404, headers: page.headers }),
          result.resolvedHeaders,
        );
      }
      if (config.notFound) {
        const response = await run(
          config.notFound.entry,
          forwarded,
          `${url.pathname}${url.search}`,
          call,
          404,
        );
        return withHeaders(response, result.resolvedHeaders);
      }
      return new Response("This page could not be found", { status: 404 });
    },
  };
}
