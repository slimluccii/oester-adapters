# Oester adapters

Framework adapters published as `@oester/*`, each writing the Oester build output (`.oester/output`: `manifest.json`, `static/`, `server/`) defined by `docs/build-output.md` in `slimluccii/oester`. That document is the contract; an adapter that needs more than it offers changes the contract there first (skill `contract-change` in that repository).

## Map

- `packages/build-output/`: what every adapter shares: `writeOutput()` checks and writes the manifest and static files, `bundleServer()` bundles the server for Bunny Edge and refuses builtins Oester does not provide. Its `contract.ts` mirrors the oester ingest. It is private: tsdown bundles it into each adapter's `dist`.
- `packages/<framework>/`: one adapter each, written against the framework's own adapter API.
- `examples/<framework>-<shape>/`: sites of different shapes, each with an `oester.test.ts` of HTTP checks.
- `e2e/`: the runner (`run.ts`) and request helpers (`get.ts`).
- `ci/affected.ts`: which packages and examples a change reaches; CI verifies, e2e-tests and dev-publishes only those.

## Commands

- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: what CI's verify job runs.
- `pnpm e2e [example ...]`: builds the packages and the examples, serves each output through oester's real ingest and loader (`deno task preview` in `../oester` or `OESTER_REPO`) and runs its checks. `--live <example>=<url>` runs them against a deployment.

## Working rules

- Test first: a unit test in `packages/*/src/*.test.ts` for logic, an `oester.test.ts` check for anything a visitor would see. A changed expectation is explained before it changes.
- Read the framework's adapter and config docs before relying on its internals; record what the adapter cannot support in its README as a limitation.
- Every user-facing change to a package gets a changeset (skill `release-with-changesets`).
- Conventional Commits, imperative and lowercase, one milestone per commit; the message ends at its subject or body, without trailers or attribution.
- US English in code and docs. Comments only for a constraint the code cannot show, one line. Prose without em dashes, en dashes or `--`.
- Publishing to npm and pushing wait for the operator's explicit go.
