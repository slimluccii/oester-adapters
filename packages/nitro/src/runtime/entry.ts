import "#nitro-internal-pollyfills";
import * as runtime from "nitropack/runtime";

type Context = {
  waitUntil(promise: Promise<unknown>): void;
  oester: { deploymentId: string; clientAddress?: string };
};
type Env = { ASSETS: { fetch(input: Request | string): Promise<Response> } };

// nitropack's runtime types resolve only inside a Nitro build, where its generated types exist.
type LocalFetch = (
  url: string,
  init: RequestInit & { host: string; protocol: string; context: object },
) => Promise<Response>;
const nitroApp = (
  runtime as unknown as { useNitroApp(): { localFetch: LocalFetch } }
).useNitroApp();

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const url = new URL(request.url);
    const body = request.body ? await request.arrayBuffer() : undefined;
    // h3 reads the scheme and the visitor's address from these headers; Oester knows both, so a visitor cannot set them.
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
    if (ctx.oester.clientAddress) headers.set("x-forwarded-for", ctx.oester.clientAddress);
    else headers.delete("x-forwarded-for");
    return nitroApp.localFetch(url.pathname + url.search, {
      host: url.host,
      protocol: url.protocol,
      headers,
      method: request.method,
      redirect: request.redirect,
      body,
      context: {
        waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
        _platform: { oester: { env, ctx } },
      },
    });
  },
};
