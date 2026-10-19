# @oester/astro

Astro adapter for [Oester](https://oester.fr). It writes the [Oester build output](https://github.com/slimluccii/oester/blob/main/docs/build-output.md) to `.oester/output`.

## Usage

```sh
npm install @oester/astro
```

```js
// astro.config.mjs
import oester, { oesterCache } from "@oester/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: oester(),
  // Optional: route caching at Oester's edge.
  cache: { provider: oesterCache() },
});
```

The adapter needs Astro 7.4 or later.

## Supported

- Static, hybrid and server output. A site without pages rendered on request gets no server.
- Actions, server islands (also on prerendered pages), sessions with a driver you choose, `astro:env` secrets, streaming, cookies, redirects from the configuration, i18n, content collections.
- Headers Astro computes for prerendered pages, such as the CSP of `security.csp`.
- `base` and `trailingSlash`.
- Route caching with `oesterCache()`: `Astro.cache.set()` and `routeRules` cache responses at the edge (`s-maxage`). Oester purges them on every deploy; purging by path or tag is not available.
- `middlewareMode: "edge"`: `oester({ middlewareMode: "edge" })` runs `src/middleware` before every request but those for built assets, so it can guard and rewrite to prerendered pages too. Astro still runs it while prerendering, where `context.isPrerendered` is true.
- `Astro.locals.oester` holds `{ env, ctx }`: the deployment's static files (`env.ASSETS`), `ctx.waitUntil()` and `ctx.oester.deploymentId`.

## Limits

- Sharp optimizes images on prerendered pages at build. Pages rendered on request serve images as they are, since Sharp needs native code the edge does not have.
- Sessions need a driver that works over HTTP or in memory (`sessionDrivers.lruCache()` keeps them per isolate, so only for trying things out). Oester has no file system.
- `Astro.rewrite()` from a page rendered on request reaches only routes in the server bundle, as in Astro itself. Edge middleware can rewrite to prerendered pages.
