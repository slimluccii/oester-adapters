# @oester/next

Runs Next.js on [Oester](https://github.com/slimluccii/oester). A [Next.js adapter](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath) that writes the [Oester build output](https://github.com/slimluccii/oester/blob/main/docs/build-output.md) to `.oester/output` on `next build`.

## Usage

```sh
npm install @oester/next
```

```ts
// next.config.ts
import { adapterPath } from "@oester/next";
import type { NextConfig } from "next";

const config: NextConfig = { adapterPath };

export default config;
```

Instead of `adapterPath`, a platform can set `NEXT_ADAPTER_PATH` to this package's path. Requires Next.js 16.4 or later.

## How it runs

- Static files, `public/` and Pages Router pages prerendered for good are files Oester serves itself.
- Everything else goes to one server. It resolves routes with `@next/routing`, the resolver Next.js publishes for adapters, and calls the entries Next.js built, as `next start` would.
- The edge has no file system and no `require()`, so the files Next.js traced for its entries ship as a read-only file system in memory, with a CommonJS loader over it. They are split into parts: a part loads when the first request needs it.
- Each deployment gets a global object of its own, so what Next.js writes to the global object (its manifests and caches, a patched `fetch`, `Date`, `Math.random`, `crypto` and `console`) does not reach other deployments in the same isolate.

## Supported

- App Router: static, dynamic and streamed pages, `generateStaticParams`, route handlers, server actions (with and without JavaScript), `cookies()`, `headers()`, `redirect()`, `notFound()`, `after()`, metadata routes, `next/og`, draft mode, Cache Components with partial prerendering and `use cache`.
- Pages Router: `getStaticProps`, `getStaticPaths` with fallback `false` or `"blocking"`, `getServerSideProps`, API routes, `res.revalidate`, `_app`, `_document` and a custom 404.
- `proxy.ts`, `middleware.ts` and routes with `runtime = "edge"`.
- `redirects`, `rewrites` and `headers` from `next.config`, `basePath`, `trailingSlash` and `output: "export"`.
- The deployment's variables in `process.env` at request time.

## Limits

- **Caching is per isolate.** ISR, `revalidatePath`, `revalidateTag` and `use cache` work in memory, from the prerendered pages on. Isolates do not share them, and a new isolate starts from the build again.
- **next/image serves images as they are.** The image optimizer needs sharp, which cannot run on the edge; the adapter sets `images.unoptimized` unless `images.loader` or `images.loaderFile` is set.
- **Native addons are left out**, with a warning. A route that loads one fails when it runs.
- **Prerendered App Router pages are answered by the server**, since a client navigation asks for the same path with an RSC header. Oester does not cache them, because Next.js varies them on that header.
- **Node.js APIs** are those Oester provides. A module that loads `fs` gets the read-only file system; `http`, `net`, `child_process` and the like load, and fail when used. Writing a file fails with `EROFS`.
- **Some changes to intrinsics are shared.** Next sets `Error.prepareStackTrace` and patches `Date.prototype.constructor` and `Error.prototype`, which other deployments in the same isolate see; only a realm of its own would keep those apart.
- **i18n routing fails the build**: `@next/routing` 16.4 mis-resolves the root path and dynamic API routes under i18n.
- A `next.config` redirect or header the manifest cannot express exactly is applied by the server, so it does not reach static files; the build warns about each one.
