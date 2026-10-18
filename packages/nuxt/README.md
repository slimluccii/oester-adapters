# @oester/nuxt

Nuxt module and Nitro preset for [Oester](https://oester.fr).

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@oester/nuxt"],
});
```

A Nitro app without Nuxt uses the preset: `preset: "@oester/nuxt/preset"`.

## Supported

- Server rendering, prerendered routes, `nuxt generate` (no server; paths without a page get the `200.html` shell), `ssr: false`, `app.baseURL`.
- Server routes, server middleware, Nitro plugins, `useStorage` (in memory, per isolate), runtime config from `NUXT_*` variables, server components (`<NuxtIsland>`), streamed responses.
- Route rules: `redirect` and `headers` go into the Oester manifest, so prerendered pages and files get them too. `swr`, `isr` and `cache` become a `cache-control` for Oester's edge cache, which every isolate shares and every deploy purges, instead of Nitro's cache in the memory of one isolate.
- `event.context.oester` holds `{ env, ctx }`: the deployment's static files (`env.ASSETS`) and `ctx.oester.deploymentId`. `getRequestIP(event, { xForwardedFor: true })` gives the visitor's address.

## Limits

- `useStorage` and Nitro's cache have no persistent driver on Oester; use a driver that works over HTTP for data that must last.
- Route rules with `**` in the middle of a path stay with Nitro and apply only to responses from the server.
