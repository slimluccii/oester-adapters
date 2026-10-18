import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";

export type Env = { ASSETS: { fetch(input: Request | string): Promise<Response> } };
export type Context = {
  waitUntil(promise: Promise<unknown>): void;
  oester: { deploymentId: string; clientAddress?: string };
};
/** What every request's `Astro.locals.oester` holds. */
export type OesterLocals = { env: Env; ctx: Context };

setGetEnv((key) => process.env[key]);
const app = createApp();

/** Whether Astro renders this request on demand; prerendered pages and public files are not its to answer. */
export const rendersOnRequest = (request: Request): boolean => app.match(request) !== undefined;

export function render(
  request: Request,
  env: Env,
  ctx: Context,
  locals?: object,
): Promise<Response> {
  const routeData = app.match(request);
  return app.render(request, {
    addCookieHeader: true,
    waitUntil: (promise) => ctx.waitUntil(promise),
    prerenderedErrorPageFetch: (url) => env.ASSETS.fetch(new URL(url).pathname),
    ...(routeData ? { routeData } : {}),
    locals: { ...locals, oester: { env, ctx } satisfies OesterLocals },
    ...(ctx.oester.clientAddress ? { clientAddress: ctx.oester.clientAddress } : {}),
  });
}

export default {
  fetch: (request: Request, env: Env, ctx: Context): Promise<Response> => render(request, env, ctx),
};
