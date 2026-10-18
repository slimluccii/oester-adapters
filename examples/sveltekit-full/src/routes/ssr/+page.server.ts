import { SECRET_MESSAGE } from "$app/env/private";

export function load({ cookies, getClientAddress, platform, locals, request }) {
  const visits = Number(cookies.get("visits") ?? "0") + 1;
  cookies.set("visits", String(visits), { path: "/" });
  return {
    visits,
    secret: SECRET_MESSAGE,
    address: getClientAddress(),
    deploymentId: platform?.ctx.oester.deploymentId,
    assets: typeof platform?.env.ASSETS.fetch,
    requestId: locals.requestId,
    userAgent: request.headers.get("user-agent"),
  };
}
