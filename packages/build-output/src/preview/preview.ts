import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";
import { outputDirectory } from "../contract.ts";
import { contentTypeOf } from "./content-types.ts";
import { route, type Decision, type Manifest } from "./route.ts";
import { mergeRuleFiles } from "./rules.ts";

export type PreviewOptions = {
  /** The project's root, whose `.oester/output` the build wrote. */
  root: string;
  /** Where to listen; every address when left out. */
  host?: string;
  port: number;
  /** Headers added to every response, unless the response sets them itself. */
  headers?: OutgoingHttpHeaders;
  logger?: { warn(message: string): void; error(message: string): void };
};

export type Preview = {
  url: string;
  host?: string;
  port: number;
  closed(): Promise<void>;
  stop(): Promise<void>;
};

type Handler = {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Response | Promise<Response>;
};

const ruleFileNames = new Set(["_headers", "_redirects"]);

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function staticFiles(staticDir: string): Promise<Set<string>> {
  const files = new Set<string>();
  const entries = await readdir(staticDir, { recursive: true, withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = relative(staticDir, join(entry.parentPath, entry.name)).split(sep).join("/");
    if (!ruleFileNames.has(path)) files.add(path);
  }
  return files;
}

/** Reads a build output as Oester's ingest does: the manifest with `_headers` and `_redirects` merged in, and the static files. */
async function readOutput(outputDir: string) {
  const raw = await readOptional(join(outputDir, "manifest.json"));
  if (raw === undefined)
    throw new Error(`${outputDir} holds no Oester build output; build the site first`);
  const staticDir = join(outputDir, "static");
  const ruleFiles: { headers?: string; redirects?: string } = {};
  for (const name of ["headers", "redirects"] as const)
    ruleFiles[name] =
      (await readOptional(join(outputDir, `_${name}`))) ??
      (await readOptional(join(staticDir, `_${name}`)));
  const { manifest, warnings } = mergeRuleFiles(JSON.parse(raw) as Manifest, ruleFiles);
  return { manifest, warnings, staticDir, files: await staticFiles(staticDir) };
}

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Answers a request as Oester's loader answers it for a deployment of this build output. */
function createFetch(
  outputDir: string,
  output: Awaited<ReturnType<typeof readOutput>>,
  logger: NonNullable<PreviewOptions["logger"]>,
) {
  const { manifest, staticDir, files } = output;
  // env.ASSETS answers from the static files alone, as the loader's does.
  const { middleware: _middleware, ...rest } = manifest;
  const assets: Manifest = {
    ...rest,
    routes: rest.routes.map((r) => ({ ...r, type: "static" as const })),
  };
  let handler: Promise<Handler> | undefined;

  function loadHandler(): Promise<Handler> {
    handler ??= (async () => {
      if (!manifest.server) throw new Error("the build output has no server code");
      const module = await import(pathToFileURL(join(outputDir, manifest.server.entry)).href);
      const loaded = module.default as Handler | undefined;
      if (!loaded || typeof loaded.fetch !== "function")
        throw new Error("the server module has no default export with fetch");
      return loaded;
    })().catch((error: unknown) => {
      handler = undefined;
      throw error;
    });
    return handler;
  }

  async function serveDecision(
    decision: Decision,
    request: Request,
    clientAddress: string | undefined,
  ): Promise<Response> {
    switch (decision.kind) {
      case "file": {
        const bytes = await readFile(join(staticDir, decision.file));
        const headers = new Headers(decision.headers);
        if (!headers.has("content-type")) headers.set("content-type", contentTypeOf(decision.file));
        const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
        headers.set("etag", etag);
        const asked = request.headers.get("if-none-match");
        if (
          decision.status === 200 &&
          asked?.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)
        )
          return new Response(null, { status: 304, headers });
        return new Response(bytes, { status: decision.status, headers });
      }
      case "redirect":
        return new Response(null, {
          status: decision.status,
          headers: { location: decision.location },
        });
      case "bad-request":
        return plain(400, "Bad request");
      case "plain-not-found":
        return plain(404, "Not found");
      case "server":
        return await runServer(request, clientAddress);
    }
  }

  async function runServer(request: Request, clientAddress: string | undefined) {
    let loaded: Handler;
    try {
      loaded = await loadHandler();
    } catch (error) {
      logger.error(`The server code could not be loaded: ${describe(error)}`);
      return plain(500, "The server code of this deployment could not be loaded");
    }
    const origin = new URL(request.url).origin;
    const env: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
      ASSETS: {
        fetch: async (input: string | Request) => {
          const path = typeof input === "string" ? input : new URL(input.url).pathname;
          const decision = route(assets, files, `${origin}${path}`);
          if (decision.kind === "server") return plain(404, "Not found");
          return await serveDecision(decision, request, clientAddress);
        },
      },
    };
    const ctx = { waitUntil: () => {}, oester: { deploymentId: "preview", clientAddress } };
    try {
      return withCaching(await loaded.fetch(request, env, ctx));
    } catch (error) {
      logger.error(`The server code threw: ${describe(error)}`);
      return plain(500, "The server code of this deployment threw an error");
    }
  }

  return (request: Request, clientAddress?: string) =>
    serveDecision(route(manifest, files, request.url), request, clientAddress);
}

/** Oester caches a server response only when it asks for it, sets no cookie and varies on nothing but its encoding. */
function withCaching(response: Response): Response {
  const headers = new Headers(response.headers);
  const varies = (headers.get("vary") ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .some((v) => v && v !== "accept-encoding");
  if (!headers.has("cache-control") || headers.has("set-cookie") || varies)
    headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function toRequest(incoming: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, values] of Object.entries(incoming.headersDistinct))
    for (const value of values ?? []) headers.append(name, value);
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(incoming.url ?? "/", origin), {
    method,
    headers,
    ...(hasBody
      ? { body: Readable.toWeb(incoming) as globalThis.ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
}

async function send(
  response: Response,
  outgoing: ServerResponse,
  method: string | undefined,
  extra: OutgoingHttpHeaders,
): Promise<void> {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(extra)) headers[name.toLowerCase()] = value;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  outgoing.writeHead(response.status, headers);
  if (!response.body || method === "HEAD") {
    await response.body?.cancel();
    outgoing.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body as ReadableStream), outgoing);
}

function urlHost(host: string | undefined): string {
  if (!host || host === "0.0.0.0" || host === "::") return "localhost";
  return host.includes(":") ? `[${host}]` : host;
}

/** Serves a build output over HTTP the way Oester serves a deployment of it, for previewing a build locally. */
export async function startPreview(options: PreviewOptions): Promise<Preview> {
  const logger = options.logger ?? console;
  const outputDir = join(options.root, outputDirectory);
  const output = await readOutput(outputDir);
  for (const warning of output.warnings)
    logger.warn(`${warning.file} line ${warning.line}: ${warning.message}`);
  const answer = createFetch(outputDir, output, logger);
  const extra = options.headers ?? {};

  const server = createServer((incoming, outgoing) => {
    const origin = `http://${incoming.headers.host ?? `localhost:${port}`}`;
    answer(toRequest(incoming, origin), incoming.socket.remoteAddress)
      .then((response) => send(response, outgoing, incoming.method, extra))
      .catch((error: unknown) => {
        logger.error(`The preview could not answer ${incoming.url}: ${describe(error)}`);
        if (outgoing.headersSent) outgoing.destroy();
        else outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end();
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const closed = new Promise<void>((resolve) => server.once("close", () => resolve()));

  return {
    url: `http://${urlHost(options.host)}:${port}/`,
    ...(options.host ? { host: options.host } : {}),
    port,
    closed: () => closed,
    stop: async () => {
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
