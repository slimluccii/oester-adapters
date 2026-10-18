import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { title: "TanStack Start on Oester" }],
    links: [{ rel: "icon", href: "/favicon.svg" }],
  }),
  component: () => (
    <Document>
      <Outlet />
    </Document>
  ),
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/">Home</Link> <Link to="/deferred">Deferred</Link>{" "}
          <Link to="/cookies">Cookies</Link>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
