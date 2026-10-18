import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// The request and response objects Next.js's Node.js entries take, built on the web Request and Response the edge has.

export type NodeRequest = Readable & {
  method: string;
  url: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  httpVersion: string;
  httpVersionMajor: number;
  httpVersionMinor: number;
  complete: boolean;
  aborted: boolean;
  socket: {
    encrypted: boolean;
    remoteAddress?: string;
    destroyed: boolean;
    on(): void;
    once(): void;
    off(): void;
  };
  connection: NodeRequest["socket"];
};

/** A Node-style request for an entry; `url` is the path and query to hand to Next, which may differ from the visitor's. */
export function nodeRequest(
  request: Request,
  options: { url: string; clientAddress?: string },
): NodeRequest {
  const body = request.body
    ? Readable.fromWeb(request.body as unknown as NodeReadableStream)
    : Readable.from([]);
  const headers: Record<string, string> = {};
  const rawHeaders: string[] = [];
  request.headers.forEach((value, name) => {
    headers[name] = value;
    rawHeaders.push(name, value);
  });
  headers.host ??= new URL(request.url).host;
  const socket = {
    encrypted: true,
    remoteAddress: options.clientAddress,
    destroyed: false,
    on() {},
    once() {},
    off() {},
  };
  return Object.assign(body, {
    method: request.method,
    url: options.url,
    headers,
    rawHeaders,
    httpVersion: "1.1",
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    complete: true,
    aborted: false,
    socket,
    connection: socket,
  });
}

const bodiless = new Set([101, 204, 205, 304]);

/** A Node-style response whose `response` promise gives the web Response once the headers are flushed. */
export class NodeResponse extends Writable {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  readonly response: Promise<Response>;
  private readonly headers = new Map<string, string | string[]>();
  private readonly head: boolean;
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private resolve!: (response: Response) => void;

  constructor(options: { head?: boolean } = {}) {
    super();
    this.head = options.head ?? false;
    this.response = new Promise((resolve) => (this.resolve = resolve));
  }

  get finished(): boolean {
    return this.writableEnded;
  }

  setHeader(name: string, value: string | number | readonly string[]): this {
    if (this.headersSent) {
      throw Object.assign(new Error("Cannot set headers after they are sent to the client"), {
        code: "ERR_HTTP_HEADERS_SENT",
      });
    }
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? [...value] : String(value));
    return this;
  }

  appendHeader(name: string, value: string | readonly string[]): this {
    const existing = this.headers.get(name.toLowerCase());
    const added = Array.isArray(value) ? value : [value as string];
    if (existing === undefined) return this.setHeader(name, added.length === 1 ? added[0]! : added);
    return this.setHeader(name, [...(Array.isArray(existing) ? existing : [existing]), ...added]);
  }

  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  getHeaders(): Record<string, string | string[]> {
    return Object.fromEntries(this.headers);
  }

  getHeaderNames(): string[] {
    return [...this.headers.keys()];
  }

  hasHeader(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }

  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase());
  }

  writeHead(
    statusCode: number,
    message?: string | Record<string, string | number | string[]> | string[],
    headers?: Record<string, string | number | string[]> | string[],
  ): this {
    if (typeof message !== "string") [message, headers] = [undefined, message];
    this.statusCode = statusCode;
    if (message) this.statusMessage = message;
    if (Array.isArray(headers))
      for (let index = 0; index < headers.length; index += 2)
        this.appendHeader(headers[index]!, headers[index + 1]!);
    else if (headers)
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    return this;
  }

  flushHeaders(): void {
    if (this.headersSent) return;
    this.headersSent = true;
    const headers = new Headers();
    for (const [name, value] of this.headers)
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
    const init = { status: this.statusCode, statusText: this.statusMessage, headers };
    if (this.head || bodiless.has(this.statusCode)) {
      this.resolve(new Response(null, init));
      return;
    }
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => void (this.controller = controller),
    });
    this.resolve(new Response(body, init));
  }

  override _write(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.flushHeaders();
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, encoding) : (chunk as Uint8Array);
    if (bytes.byteLength) this.controller?.enqueue(new Uint8Array(bytes));
    callback();
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.flushHeaders();
    this.controller?.close();
    callback();
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (error) {
      if (!this.headersSent) {
        this.statusCode = 500;
        this.flushHeaders();
      }
      try {
        this.controller?.error(error);
      } catch {
        // The body already ended.
      }
    }
    callback(error);
  }
}
