import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

const withVisitor = createMiddleware({ type: "function" }).server(({ next }) =>
  next({ context: { visitor: getRequestHeader("x-visitor") ?? "anonymous" } }),
);

export const getGreeting = createServerFn({ method: "GET" })
  .middleware([withVisitor])
  .handler(({ context }) => ({
    greeting: process.env.GREETING ?? "no greeting",
    visitor: context.visitor,
  }));

export const echo = createServerFn({ method: "POST" })
  .validator((data: { message: string }) => data)
  .handler(({ data }) => ({ echoed: data.message.toUpperCase() }));

export const getTheme = createServerFn({ method: "GET" }).handler(
  () => getCookie("theme") ?? "light",
);

export const setTheme = createServerFn({ method: "POST" })
  .validator((theme: string) => theme)
  .handler(({ data }) => {
    setCookie("theme", data, { path: "/", httpOnly: true, sameSite: "lax" });
    return data;
  });

export const plainText = createServerFn({ method: "GET" }).handler(() => "plain from the server");
