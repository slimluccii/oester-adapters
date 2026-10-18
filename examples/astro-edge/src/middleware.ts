import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  // Astro also runs middleware while prerendering, where there is no visitor to check.
  if (pathname.startsWith("/private") && !context.isPrerendered) {
    const user = context.cookies.get("user")?.value;
    if (!user) return new Response("sign in first", { status: 401 });
    context.locals.user = user;
  }
  if (pathname === "/legacy") return next("/about");
  const response = await next();
  response.headers.set("x-edge-middleware", "ran");
  return response;
});
