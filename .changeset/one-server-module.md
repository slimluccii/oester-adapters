---
"@oester/astro": minor
"@oester/svelte": minor
---

The server output is one ES module that imports only the Node builtins Oester provides, as Oester runs each deployment as one script. An `import()` of a bundled module is evaluated in place, `import.meta` is a plain object with a `file:` URL, a server above 7 MB gets a warning and one above 10 MB fails the build, naming its largest packages.
