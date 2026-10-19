---
name: release-with-changesets
description: Record and release package changes with Changesets. Use when a change to a package should reach npm, or when asked to version or publish.
---

1. `pnpm changeset`, or a file in `.changeset/` with the packages and their bump: `patch` for fixes, `minor` for features and while below 1.0 for breaking changes too. The summary is one or two sentences for the changelog, written for users of the package.
2. Push to `main` (on the operator's go). CI's version job opens a "chore: version packages" pull request, and the dev job publishes the packages that have a changeset under the `dev` dist-tag.
3. Merging that pull request publishes the new versions with trusted publishing (OIDC, environment `npm`) and creates GitHub releases.

`@oester/build-output` is private and bundled into every adapter by tsdown, so a change to it needs a changeset for each adapter it changes. When an adapter relies on new loader behavior, the operator deploys Oester and releases the loader before the adapter is published.
