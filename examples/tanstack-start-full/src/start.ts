import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

const stamp = createMiddleware().server(async ({ next }) => {
  const result = await next();
  result.response.headers.set("x-request-middleware", "ran");
  return result;
});

const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({ requestMiddleware: [stamp, csrf] }));
