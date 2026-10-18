# Proposal for WaldJS upstream

What should change in [WaldJS](https://github.com/Stefan-Espant/WaldJS) now that `@oester/wald` exists. Nothing here is changed in WaldJS yet.

## The built-in `oesterAdapter()` no longer deploys

`oesterAdapter()` in `packages/cli/src/adapters.ts` (added in #53, published in `@waldjs/cli` 0.13.0) writes manifest version 2. Oester's ingest now accepts version 3 only (`only manifest version 3 is supported`), and the v2 output differs in three more places:

- the files go to `.oester/output/client`, where v3 reads `.oester/output/static`;
- the header rule uses `path`, where v3 uses `source`;
- it sets `cache-control` on `/assets/*`, a header v3 refuses in the manifest, which fails the deploy. Oester sets browser cache times itself.

## Proposal: point to `@oester/wald`

Replace the body of `oesterAdapter()` with a deprecation that names the package, and keep the export for one minor release so existing configs fail with a clear message instead of a broken deploy:

```ts
export function oesterAdapter(): WaldAdapter {
  throw new Error(
    "oesterAdapter() is replaced by @oester/wald: npm install @oester/wald, then adapter: oester() from '@oester/wald'",
  );
}
```

Then remove it in the next minor, and change its row in the README's adapter table to:

| Adapter                        | Output                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `oester()` from `@oester/wald` | `.oester/output/` with the manifest Oester reads: base, not-found page, trailing slash |

Why a separate package rather than updating the built-in one: the contract moves with Oester, and a release of `@waldjs/cli` should not be needed each time it does. `@oester/wald` is released with the other Oester adapters and is tested against Oester's own ingest and loader.

## Smaller things that would help every host

- **A not-found convention.** `src/pages/404.wald` renders to `404/index.html`, which hosts do not look for. Rendering it to `404.html` (as Astro does with `404.astro`) would let Netlify, Cloudflare Pages, GitHub Pages and Oester pick it up without an adapter. `@oester/wald` accepts both, so it keeps working after such a change.
- **A `trailingSlash` setting in `wald.config.ts`.** The marketing site fixed duplicate URLs with Vercel's `trailingSlash: false` (#105). A framework setting would let every adapter map it, and `wald preview` and `wald grow` could follow it. `@oester/wald` offers `oester({ trailingSlash })` until then.
- **The adapter context.** `outDirRelative` holds an absolute path, because `wald build` resolves `config.outDir` before calling the adapter. Either name it `outDir` only or pass the relative path.
