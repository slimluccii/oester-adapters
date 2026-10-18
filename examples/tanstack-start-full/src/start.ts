import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const stamp = createMiddleware().server(({ next }) => {
  setResponseHeader("x-request-middleware", "ran");
  return next();
});

const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({ requestMiddleware: [stamp, csrf] }));
