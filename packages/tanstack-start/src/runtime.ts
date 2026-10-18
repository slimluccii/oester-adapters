/** What TanStack Start's server entry exports: `createServerEntry({ fetch })`. */
export type ServerEntry = {
  fetch(request: Request, options?: never): Response | Promise<Response>;
};

export type Env = { ASSETS: { fetch(input: string | Request): Promise<Response> } } & Record<
  string,
  unknown
>;

export type Context = {
  waitUntil(promise: Promise<unknown>): void;
  oester: { deploymentId: string; clientAddress?: string };
};

/** Wraps TanStack Start's server entry in the handler Oester calls. */
export function createHandler(server: ServerEntry) {
  return {
    fetch(request: Request, _env: Env, ctx: Context): Response | Promise<Response> {
      if (ctx.oester.clientAddress)
        Object.defineProperty(request, "ip", {
          value: ctx.oester.clientAddress,
          configurable: true,
        });
      return server.fetch(request);
    },
  };
}
