---
name: add-example
description: Add an example site with HTTP checks that run against Oester's real loader. Use when proving an adapter feature end to end, reproducing a serving bug, or covering a new site shape.
---

1. `examples/<framework>-<shape>/`, a private workspace package depending on its adapter as `workspace:*`, with a `build` script that writes `.oester/output`. Variables the deployment should see go in `package.json` under `"oester": { "variables": { ... } }`.
2. Build in the features the shape is about, using the framework's own APIs.
3. `oester.test.ts` with vitest, requesting through `get()` from `../../e2e/get.ts` (redirects are not followed). `expectStaticCaching(page, assetRegex)` checks etags, 304 and immutable assets. Guard checks that only hold locally with `live`.
4. One `it` per observable behavior, named for what a visitor sees.
5. `pnpm e2e <example>` green. Each failure is a bug in the adapter or the contract, fixed there; the check changes only when its expectation was wrong, with the reason stated.

The example's folder name is what `pnpm e2e` and `ci/affected.ts` take.
