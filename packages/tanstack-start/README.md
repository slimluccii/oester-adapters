# @oester/tanstack-start

Builds a [TanStack Start](https://tanstack.com/start) app for [Oester](https://github.com/slimluccii/oester). React and Solid both work.

## Usage

```sh
npm install --save-dev @oester/tanstack-start
```

Add `oester()` to the Vite plugins, after `tanstackStart()`:

```ts
import oester from "@oester/tanstack-start";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), oester()],
});
```

`vite build` then writes `.oester/output`. No Nitro is needed: the adapter bundles TanStack Start's own server entry.

## What you get

- Client assets, files from `public/` and prerendered pages are served as static files. Every other path goes to the server.
- Server-side rendering with streaming, loaders, `redirect()`, `notFound()`, error components, selective SSR (`ssr: false` and `"data-only"`) and route `headers`.
- Server functions (GET, POST, FormData), server routes, request and function middleware, `createCsrfMiddleware`, cookies, and `getRequestIP()`, which reads the visitor's address from Oester.
- `process.env` holds the deployment's variables at request time. `import.meta.env` is replaced at build time, as Vite does everywhere.
- Vite's `base` becomes the site's base, so the router basepath follows it.
- In SPA mode every path without a file gets the prerendered shell, and server functions and `/api/*` still reach the server. Name other server route paths with `oester({ spa: { serverPaths: ["/api/*", "/auth/*"] } })`, and the shell with `spa.shell` when `spa.prerender.outputPath` moved it.

## Limits

- The server runs on an edge runtime without a file system, sockets or the Node builtins Oester leaves out, and the build fails when the server imports one.
- A router basepath that differs from Vite's `base` is refused, since Oester serves a site under one base.
- Paths under Vite's assets directory (`/assets/*`) are only ever static files, so a route there never reaches the server.
- TanStack Start has no `waitUntil`, so work cannot outlive the response.
- In SPA mode, request middleware does not run for the shell, which is a static file.
