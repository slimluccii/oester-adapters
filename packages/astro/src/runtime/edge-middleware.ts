import type { MiddlewareHandler } from "astro";
import { createContext } from "astro/middleware";
import type { Context, Env } from "./handler.ts";

type Server = {
  rendersOnRequest(request: Request): boolean;
  render(request: Request, env: Env, ctx: Context, locals?: object): Promise<Response>;
};

/**
 * With middlewareMode "edge", Oester sends every path but the built assets to the server, so the site's middleware runs
 * before prerendered pages and public files too; what it passes on is rendered by Astro or served from the static files.
 */
export function withEdgeMiddleware(
  server: Server,
  onRequest: MiddlewareHandler,
  i18n: { defaultLocale?: string; locales?: string[] },
) {
  return {
    fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
      const context = createContext({
        request,
        defaultLocale: i18n.defaultLocale ?? "",
        ...(i18n.locales ? { userDefinedLocales: i18n.locales } : {}),
        locals: { oester: { env, ctx } },
        ...(ctx.oester.clientAddress ? { clientAddress: ctx.oester.clientAddress } : {}),
      });
      const next = async (rewrite?: string | URL | Request): Promise<Response> => {
        const target =
          rewrite === undefined
            ? request
            : rewrite instanceof Request
              ? rewrite
              : new Request(new URL(rewrite, request.url), request);
        const response = server.rendersOnRequest(target)
          ? await server.render(target, env, ctx, context.locals)
          : await env.ASSETS.fetch(target);
        // Static responses are immutable, and middleware commonly sets headers on what next() returns.
        return new Response(response.body, response);
      };
      return Promise.resolve(onRequest(context, next)).then((response) => response ?? next());
    },
  };
}
