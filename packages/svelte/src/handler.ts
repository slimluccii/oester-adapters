import type { Server } from "@sveltejs/kit";

/** The handler's `env`: the deployment's variables as strings, and `ASSETS` to read its static files. */
export type Env = {
  ASSETS: { fetch(input: string | Request): Promise<Response> };
  [variable: string]: unknown;
};

export type Context = {
  waitUntil(promise: Promise<unknown>): void;
  oester: { deploymentId: string; clientAddress?: string };
};

/** What `event.platform` holds on Oester. */
export type Platform = { env: Env; ctx: Context };

export type HandlerConfig = { base: string };

export function createHandler(server: Server, config: HandlerConfig) {
  let started: Promise<void> | undefined;

  function start(env: Env): Promise<void> {
    const variables: Record<string, string> = {};
    for (const [name, value] of Object.entries(env))
      if (typeof value === "string") variables[name] = value;
    return server.init({
      env: variables,
      read: async (file) => {
        const response = await env.ASSETS.fetch(`${config.base}/${file}`);
        if (!response.ok) throw new Error(`read(${file}) failed: ${response.status}`);
        return response.body;
      },
    });
  }

  return {
    async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
      await (started ??= start(env));
      return server.respond(request, {
        getClientAddress() {
          if (ctx.oester.clientAddress) return ctx.oester.clientAddress;
          throw new Error("Oester did not pass the client address of this request");
        },
        platform: { env, ctx } satisfies Platform,
      });
    },
  };
}
