# @oester/svelte

## 0.2.0

### Minor Changes

- f6602e7: The server output is one ES module that imports only the Node builtins Oester provides, as Oester runs each deployment as one script. An `import()` of a bundled module is evaluated in place, `import.meta` is a plain object with a `file:` URL, a server above 7 MB gets a warning and one above 10 MB fails the build, naming its largest packages.

### Patch Changes

- 37713de: Link the npm page to the readme and the issue tracker, and show how to install the Astro adapter.

## 0.1.0

### Minor Changes

- 2746bf7: First release of the SvelteKit adapter: prerendered pages and static files are served as static files, everything else by SvelteKit on the edge.
