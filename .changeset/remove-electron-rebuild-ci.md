---
"budgie": patch
---

Remove obsolete electron-rebuild step from release CI workflow (better-sqlite3 is N-API and needs no rebuild; the step failed because node-abi doesn't know the Electron 44 ABI)
