# @oester/next

## 0.1.0

### Minor Changes

- 9da488c: Add the Next.js adapter. It writes the Oester build output on `next build`: static files are served by Oester, and the rest runs Next's own entries on the edge, through a read-only file system in memory and Next's route resolver.

### Patch Changes

- Updated dependencies [98a60f4]
  - @oester/build-output@0.1.0
