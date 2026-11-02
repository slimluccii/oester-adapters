# @oester/astro

## 0.2.0

### Minor Changes

- f6602e7: The server output is one ES module that imports only the Node builtins Oester provides, as Oester runs each deployment as one script. An `import()` of a bundled module is evaluated in place, `import.meta` is a plain object with a `file:` URL, a server above 7 MB gets a warning and one above 10 MB fails the build, naming its largest packages.

### Patch Changes

- 28d8a93: Support `astro preview`: it serves the built `.oester/output` the way Oester serves a deployment, with the manifest's routing, `_headers` and `_redirects`, the static files and the server.
- 37713de: Link the npm page to the readme and the issue tracker, and show how to install the Astro adapter.

## 0.1.0

### Minor Changes

- 94a3414: Add the Astro adapter, moved from `astro-adapter-oester`: manifest version 3, route caching through `oesterCache()`, edge middleware, hashed assets declared immutable, and no server for sites without pages rendered on request.
