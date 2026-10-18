import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: "utf-8" }, { title: "Prerendered docs" }] }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/">Home</Link> <Link to="/about">About</Link>{" "}
          <Link to="/guides/$slug" params={{ slug: "intro" }}>
            Intro
          </Link>{" "}
          <Link to="/live">Live</Link> <Link to="/client-only">Client only</Link>{" "}
          <Link to="/data-only">Data only</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
