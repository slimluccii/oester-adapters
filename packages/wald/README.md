# @oester/wald

Deploy [WaldJS](https://waldjs.eu) sites on Oester.

```sh
npm install @oester/wald
```

```ts
// wald.config.ts
import { oester } from "@oester/wald";
import { defineConfig } from "@waldjs/cli";

export default defineConfig({
  adapter: oester(),
});
```

`wald build` renders the site to `outDir` (`dist` by default) as usual, and the adapter then writes `.oester/output`: the static files and a manifest that tells Oester the site's `base` and its not-found page.

## Options

| Option          | Default    | Meaning                                                                                                             |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `trailingSlash` | `"ignore"` | `"never"` redirects `/blog/` to `/blog` with 308, `"always"` redirects `/blog` to `/blog/`, `"ignore"` serves both. |

## What it maps

- **Pages**: every page is rendered at build time, so the whole site is static and Oester runs no server for it.
- **`base`** from `wald.config.ts`: the site is served under it, and the root of the hostname redirects there.
- **Not-found page**: `public/404.html`, or else the page `src/pages/404.wald` renders, is served with status 404 for any missing path.
- **Redirects and headers**: put them in `public/_redirects` and `public/_headers` (Netlify syntax); Oester translates them. `Cache-Control` lines are ignored, since Oester sets browser cache times itself.
- **Islands, images and content collections** are build-time features and need nothing from the adapter.
