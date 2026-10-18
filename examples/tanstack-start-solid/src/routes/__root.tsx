import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { HydrationScript } from "solid-js/web";

export const Route = createRootRoute({
  head: () => ({ meta: [{ charset: "utf-8" }, { title: "Solid on Oester" }] }),
  component: () => (
    <html lang="en">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
