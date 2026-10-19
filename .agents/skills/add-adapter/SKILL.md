---
name: add-adapter
description: Add an adapter for a new framework as `@oester/<framework>`. Use when supporting a framework that has no package in `packages/` yet.
---

1. Read the framework's adapter or deployment API docs and its config docs; prefer the official hook (an adapter API, a Vite or Nitro preset) over patching its output.
2. Create `packages/<framework>/` from an existing adapter: `package.json` (version `0.0.0`, `publishConfig.access: public`, `repository.directory`, exports with the `oester-source` condition first, the framework as a peer dependency, `esbuild` as a dependency, `@oester/build-output` as a `workspace:*` devDependency, `build: tsdown`), `tsconfig.json`, `tsdown.config.ts` spreading `adapter` from `tsdown.base.ts` with an entry for every export and every runtime file the adapter hands to the framework by path, `README.md`.
3. Map the framework's build onto `writeOutput()`: prerendered files into `static`, server routes into the manifest's patterns, hashed assets into `immutable`, and the server entry through `bundleServer()` as a module whose default export is `{ fetch(request, env, ctx) }`. A fully static build needs no server.
4. Unit-test the mapping logic in `src/*.test.ts`, red first.
5. Add at least two examples of different shapes (skill `add-example`) and get `pnpm e2e <examples>` green.
6. README: install, config options, what is verified, limitations. Add a row to the root README table.
7. A changeset, `minor`, for the new package.

Done when `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm e2e` for its examples pass.
