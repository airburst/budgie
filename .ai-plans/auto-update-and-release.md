# Auto-Update & Release Pipeline

## Context

Budgie is an Electron app (electron-builder, v0.7.0) with no CI/CD and no auto-update mechanism. The repo (`airburst/budgie`) will be made public. Goal: publish artifacts to GitHub Releases and prompt users to restart when a new version is available. Minimize hosting cost ($0 via GitHub Releases).

---

## Step 1 — Install electron-updater

```
bun add electron-updater
```

---

## Step 2 — Add auto-update logic to `public/electron.js`

After `createWindow()`, add update checking (skip in dev):

```js
const { autoUpdater } = require("electron-updater");

// After createWindow() inside app.whenReady():
if (!isDev) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdates();

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-downloaded", info.version);
  });
}
```

Key points:
- `autoDownload: true` — download silently in background
- `autoInstallOnAppQuit` — install on next quit/restart
- Sends version to renderer so we can show a notification

---

## Step 3 — Expose update events via preload

**`public/preload.js`** — add:

```js
onUpdateDownloaded: (callback) => {
  ipcRenderer.on("update-downloaded", (_, version) => callback(version));
},
restartToUpdate: () => ipcRenderer.send("restart-to-update"),
```

**`public/electron.js`** — handle restart request:

```js
ipcMain.on("restart-to-update", async () => {
  // Backup before installing update
  try {
    let backupFolder = DEFAULT_BACKUP_FOLDER;
    try {
      const row = sqlite.prepare("SELECT preferences FROM settings WHERE id = 1").get();
      if (row) {
        const prefs = JSON.parse(row.preferences || "{}");
        if (prefs.backupFolder) backupFolder = prefs.backupFolder;
      }
    } catch {}
    await createBackupDirect(sqlite, backupFolder);
  } catch (e) {
    console.error("Pre-update backup failed:", e);
  }
  skipAutoBackup = true;
  autoUpdater.quitAndInstall();
});
```

---

## Step 4 — Type the new API

**`src/types/electron.d.ts`** — add to `ElectronAPI`:

```ts
onUpdateDownloaded: (callback: (version: string) => void) => void;
restartToUpdate: () => void;
```

---

## Step 5 — Add update toast in root layout

Add an `useEffect` in the app's root layout that listens to `window.api.onUpdateDownloaded`. When fired, show a toast (bottom-right) with "Version X.Y.Z available" and a Restart button. Use shadcn's `toast`/`sonner` or a simple fixed-position div. Restart calls `window.api.restartToUpdate()`.

---

## Step 6 — Configure electron-builder for GitHub publish

**`package.json`** `build` section — add:

```json
"publish": {
  "provider": "github",
  "owner": "airburst",
  "repo": "budgie"
}
```

Update mac target to include `zip` (required for auto-update on macOS — DMG alone won't work):

```json
"mac": {
  "category": "public.app-category.finance",
  "target": ["dmg", "zip"]
}
```

---

## Step 7 — GitHub Actions workflow

**`.github/workflows/release.yml`**:

Trigger: push of tag matching `v*`

Jobs:
- **build-mac** (macos-latest): build + publish mac artifacts
- **build-windows** (windows-latest): build + publish windows artifacts
- **build-linux** (ubuntu-latest): build + publish linux artifacts

Each job:
1. Checkout
2. Setup bun
3. `bun install`
4. `bun run electron-rebuild -f -w better-sqlite3`
5. `vite build && vite build --config vite.main.config.ts`
6. `electron-builder --publish always` (with `GH_TOKEN` from secrets)

electron-builder will create the GitHub Release and upload artifacts automatically.

---

## Step 8 — Release trigger script

**`scripts/release.sh`**:

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists"
  exit 1
fi

git tag "$TAG"
git push origin "$TAG"
echo "Pushed $TAG — GitHub Actions will build and publish"
```

Add to `package.json` scripts: `"release": "bash scripts/release.sh"`

Workflow: `bun run version` (consume changesets, bump version) → commit → `bun run release` (tag + push).

---

## Step 9 — Add `GH_TOKEN` secret

In GitHub repo settings → Secrets → Actions, add `GH_TOKEN` with a PAT that has `repo` scope (or use the default `GITHUB_TOKEN` — works for public repos).

---

## Files to modify

| File | Change |
|------|--------|
| `package.json` | Add `electron-updater` dep, `publish` config, `release` script, mac `zip` target, fix category |
| `public/electron.js` | Auto-update checking + restart handler |
| `public/preload.js` | `onUpdateDownloaded`, `restartToUpdate` |
| `src/types/electron.d.ts` | Type the two new API methods |
| `src/pages/Settings/SettingsPage.tsx` or root layout | Update notification UI |
| `.github/workflows/release.yml` | New file — CI/CD |
| `scripts/release.sh` | New file — tag + push |

---

## Verification

1. `bun run lint && bun run check-types` — clean
2. `bun run test` — passes
3. Local test: run built app, verify `autoUpdater` initializes without errors (won't find updates yet, that's fine)
4. Tag a test release, confirm GitHub Actions builds and publishes artifacts to a GitHub Release
5. Install the released version, then tag a newer version — confirm the update notification appears and restart installs the new version

---

## Decisions

- **Update UI**: Toast in root layout (bottom-right, non-intrusive)
- **Backup**: Yes, backup before installing update
- **Progress**: Just "ready to restart" — no download progress events

## Unresolved questions

- None
