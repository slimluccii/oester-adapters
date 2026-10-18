import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  const response = await next();
  if (!context.isPrerendered) response.headers.set("x-middleware", "ran");
  return response;
});
