# Auto-Update Support Plan

## Context

Budgie has no auto-update, code signing, or notarization. Users must manually download new versions. Goal: add electron-updater with S3 hosting, Mac code signing, and local MinIO testing. Local build/publish (no CI).

## Architecture

```txt
[S3 Bucket] ← electron-builder publishes DMG + latest-mac.yml
     ↓ HTTPS
[Running App] → electron-updater checks latest-mac.yml
     ↓ if newer version
[Native Dialog] → "Update available. Download?"
     ↓ user accepts
[Download + Install on Quit]
```

---

## Phase 1: Mac Code Signing + Notarization (prerequisite)

**Gated on Apple Developer enrollment ($99/yr)**

1. Enroll at https://developer.apple.com/programs/
2. Create Developer ID Application cert: Xcode → Settings → Accounts → Manage Certs → "+" → "Developer ID Application"
3. Verify: `security find-identity -v -p codesigning`
4. Create app-specific password at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords
5. Set env vars in `~/.zshrc`:

   ```bash
   export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="your@email.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="TEAMID"
   ```

6. Create `build/entitlements.mac.plist`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>com.apple.security.cs.allow-jit</key><true/>
     <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
   </dict>
   </plist>
   ```

7. Update `package.json` build.mac:
   ```json
   "mac": {
     "category": "public.app-category.finance",
     "target": "dmg",
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist",
     "notarize": true
   }
   ```

---

## Phase 2: electron-updater Integration (can start before Phase 1 completes)

### 2a. Install

```bash
bun add electron-updater
```

### 2b. Create `public/ipc/updater.js`

```js
const { autoUpdater } = require("electron-updater");
const { dialog } = require("electron");

module.exports = function registerUpdaterHandlers(ipcMain, mainWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `Version ${info.version} is available. Download now?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "Update downloaded. Restart now to install?",
        buttons: ["Restart", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Update error:", err.message);
  });

  ipcMain.handle("update:check", () => autoUpdater.checkForUpdates());
};
```

### 2c. Wire into `public/electron.js`

```js
const registerUpdaterHandlers = require("./ipc/updater");

// Inside app.whenReady(), after createWindow():
if (!isDev) {
  registerUpdaterHandlers(ipcMain, mainWindow);
  // Auto-check on launch (silent — error handler logs only)
  autoUpdater.checkForUpdates().catch(() => {});
}
```

Note: since we use native dialogs, the renderer doesn't need update events. Only one IPC channel needed: `update:check` for the menu item.

### 2d. Add "Check for Updates..." menu item

In `public/electron.js`, add to the app menu:

```js
{
  label: "Budgie",
  submenu: [
    { label: "Check for Updates...", click: () => autoUpdater.checkForUpdates() },
    { type: "separator" },
    { role: "quit" }
  ]
}
```

### 2e. Update `public/preload.js`

```js
checkForUpdate: () => ipcRenderer.invoke("update:check"),
```

### 2f. Update `src/types/electron.d.ts`

```ts
checkForUpdate: () => Promise<unknown>;
```

### 2g. Update production CSP in `public/electron.js`

Add S3 bucket to `connect-src`:

```txt
connect-src 'self' https://budgie-releases.s3.eu-west-2.amazonaws.com
```

---

## Phase 3: S3 Bucket Setup

1. Create bucket:

   ```bash
   aws s3 mb s3://budgie-releases --region eu-west-2
   ```

2. Set public-read policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::budgie-releases/*"
       }
     ]
   }
   ```

3. Create IAM user `budgie-publisher` with scoped S3 permissions (PutObject, GetObject, ListBucket, DeleteObject on `budgie-releases`)

4. Save credentials: `~/.aws/credentials` under `[budgie]` profile

5. Add publish config to `package.json` build section:

   ```json
   "publish": {
     "provider": "s3",
     "bucket": "budgie-releases",
     "region": "eu-west-2",
     "acl": "public-read"
   }
   ```

6. Add publish scripts:

   ```json
   "publish:mac": "vite build && vite build --config vite.main.config.ts && electron-builder --mac --publish always"
   ```

7. Publish: `AWS_PROFILE=budgie bun run publish:mac`

---

## Phase 4: MinIO Local Testing

1. Install: `brew install minio/stable/minio minio/stable/mc`

2. Start: `minio server ~/minio-data --console-address ":9001"`

3. Create bucket:

   ```bash
   mc alias set local http://localhost:9000 minioadmin minioadmin
   mc mb local/budgie-releases
   mc anonymous set download local/budgie-releases
   ```

4. Add local publish script:

   ```json
   "publish:local": "vite build && vite build --config vite.main.config.ts && electron-builder --mac --publish always --config.publish.provider=s3 --config.publish.endpoint=http://localhost:9000 --config.publish.bucket=budgie-releases --config.publish.region=eu-west-2 --config.publish.acl=public-read --config.publish.forcePathStyle=true"
   ```

5. Test cycle:
   - Set version to `0.1.0`, publish to MinIO
   - Install the 0.1.0 DMG
   - Bump to `0.2.0`, publish again
   - Temporarily add to updater.js: `autoUpdater.setFeedURL({ provider: "s3", endpoint: "http://localhost:9000", bucket: "budgie-releases", region: "eu-west-2", pathStyle: true })`
   - Launch 0.1.0 app → should see "Update available" dialog

---

## Phase 5: Publish Workflow

```bash
# 1. Bump version
npm version patch  # or minor/major

# 2. Build + sign + notarize + upload
AWS_PROFILE=budgie bun run publish:mac

# 3. electron-builder uploads to S3:
#    - Budgie-X.Y.Z.dmg
#    - Budgie-X.Y.Z.dmg.blockmap (for delta updates)
#    - latest-mac.yml
```

---

## Files to Modify

| File                           | Change                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `package.json`                 | electron-updater dep, build.mac, build.publish, publish scripts |
| `build/entitlements.mac.plist` | **New** — macOS entitlements                                    |
| `public/ipc/updater.js`        | **New** — update check/download/install handlers                |
| `public/electron.js`           | Register updater, add menu item, update CSP                     |
| `public/preload.js`            | Expose `checkForUpdate`                                         |
| `src/types/electron.d.ts`      | Type for `checkForUpdate`                                       |

## Verification

1. **MinIO test**: Full publish + update cycle with version bump
2. **Signing test**: `codesign -dvvv out/mac-arm64/Budgie.app` shows valid signature
3. **Notarization test**: `spctl -a -v out/mac-arm64/Budgie.app` shows "accepted"
4. **S3 test**: Publish to real S3, verify `latest-mac.yml` accessible via HTTPS

## Notes

- **Mac signing is required** for auto-update — unsigned DMGs can't be updated by electron-updater
- **Windows/Linux signing deferred** — auto-update works unsigned, users just see SmartScreen warnings on initial install
- Update check on launch + manual menu item only, no timer
- S3 bucket: `budgie-releases`, region: `eu-west-2`
