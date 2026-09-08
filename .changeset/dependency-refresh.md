---
"budgie": patch
---

Upgrade dependencies: Electron 44, TypeScript 7, Vitest 5, React Router 8, TanStack Table 9,
better-sqlite3 13, concurrently 10 and changesets 3, plus all outstanding minor/patch bumps.

better-sqlite3 is now an N-API module, so the `electron-rebuild` / `npm rebuild` steps have
been removed from install, build and test.
