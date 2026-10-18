# @oester/sveltekit

SvelteKit adapter for [Oester](https://oester.fr). It writes the [Oester build output](https://github.com/slimluccii/oester/blob/main/docs/build-output.md) to `.oester/output`.

## Usage

```sh
npm install --save-dev @oester/sveltekit
```

```js
// vite.config.js
import oester from "@oester/sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: oester() })],
});
```

The adapter has no options. It needs SvelteKit 3.

## What goes where

- Prerendered pages, prerendered endpoints and remote `prerender` functions, the files in `static/` and the client build are static files. Oester serves them without running any code.
- Everything else is answered by SvelteKit's server on the edge: pages rendered on request, `+server` endpoints, form actions, remote functions, hooks, `__data.json` and `/_app/env.js`.
- When every route is prerendered and there are no remote functions, the output has no server at all, and public variables are written at build time.
- `paths.base` becomes the manifest's `base`. Pages prerendered as `about.html` (`trailingSlash: 'never'`) redirect `/about/` to `/about`, and pages prerendered as `about/index.html` (`'always'`) redirect the other way.
- Redirects met while prerendering become Oester redirects. A missing file under `/_app/immutable/` is a 404 that never starts the server.

## Variables and the platform

The deployment's variables reach `$app/env/private`, `$app/env/public` and the deprecated `$env/dynamic/*` when the server starts, so `src/env.ts` validates them on Oester rather than at build time.

`event.platform` holds Oester's `env` (the variables and `ASSETS`) and `ctx` (`waitUntil`, `oester.deploymentId`, `oester.clientAddress`). To type it:

```ts
// src/app.d.ts
import type { Platform as OesterPlatform } from "@oester/sveltekit";

declare global {
  namespace App {
    interface Platform {
      env: OesterPlatform["env"];
      ctx: OesterPlatform["ctx"];
    }
  }
}

export {};
```

`getClientAddress()` returns `ctx.oester.clientAddress`. `read()` from `$app/server` and server-side `fetch` of the app's own static files and prerendered pages are answered from the deployment through `env.ASSETS`, without a request over the network. `instrumentation.server.ts` runs before the app.

## Limits

- The server runs on an edge runtime without a file system, sockets or the Node builtins Oester leaves out; a dependency that imports one fails the build with its name.
- `platform` is undefined during `vite dev` and prerendering; the adapter has no emulator.
- A site with both `trailingSlash: 'always'` and `'never'` pages gets a warning: Oester serves its prerendered pages with and without the slash.
- Under `paths.base`, Oester serves the home page at `/docs` as well as `/docs/`, where SvelteKit redirects. With relative asset paths (the default), the page at `/docs` loads its assets from outside the base.
- Responses without `cache-control`, or with a cookie, are not cached by Oester. Set `cache-control` with `setHeaders` to cache a rendered page.
