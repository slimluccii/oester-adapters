# Oester adapters

Framework adapters that write the [Oester build output](https://github.com/slimluccii/oester/blob/main/docs/build-output.md).

| Package          | Framework                 |
| ---------------- | ------------------------- |
| `@oester/astro`  | Astro                     |
| `@oester/nitro`  | Nuxt and other Nitro apps |
| `@oester/next`   | Next.js                   |
| `@oester/svelte` | SvelteKit                 |
| `@oester/wald`   | WaldJS                    |

## Development

- `pnpm test` runs the unit tests of every package.
- `pnpm e2e [example ...]` builds the examples in `examples/` and runs each one's `oester.test.ts` against its output, served through Oester's own ingest and loader. It needs Deno and a checkout of the oester repository at `../oester` or `OESTER_REPO`.
- `pnpm e2e --live <example>=<url>` runs the same checks against a deployment on Oester.
- `pnpm changeset` records a change for the next release.
