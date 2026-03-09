# Settings Page

## Context

Settings are scattered: backup folder lives in BackupDialog, autofillPayees has no UI. Adding `/settings` route with tabs (General + Advanced) to centralize config.

## Decisions

- BackupDialog keeps its folder input (convenience override)
- Data folder change: move DB + restart (like restore flow)

## Preference Keys

| Key                   | Status                       | Storage          |
| --------------------- | ---------------------------- | ---------------- |
| `backupFolder`        | Existing in Preferences type | JSON blob        |
| `autofillPayees`      | Existing in Preferences type | JSON blob        |
| `backupRetentionDays` | **New**                      | JSON blob        |
| `dataFolder`          | **New** — stored OUTSIDE DB  | JSON config file |

**Important:** `dataFolder` cannot live in the DB because we need it before DB init. Store in `app.getPath("userData")/config.json`.

## Files to Modify

| File                                    | Action                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/components/ui/tabs.tsx`            | **New** — `bunx shadcn@latest add tabs`                                                                            |
| `src/pages/Settings/SettingsPage.tsx`   | **New** — tabbed settings page                                                                                     |
| `src/App.tsx`                           | Add `/settings` route                                                                                              |
| `src/components/header.tsx`             | Add "Settings" link to dropdown                                                                                    |
| `src/types/electron.d.ts`               | Add `backupRetentionDays` to Preferences; add `getDataFolder`, `moveDataFolder`, `chooseDataFolder` to ElectronAPI |
| `src/hooks/usePreferences.ts`           | No change (new fields are optional)                                                                                |
| `public/ipc/settings.js`                | Add `json_extract` for `backupFolder`, `backupRetentionDays`                                                       |
| `public/ipc/backups.js`                 | Add `backups:chooseDataFolder` handler; use `backupRetentionDays` in sweep                                         |
| `public/preload.js`                     | Expose `getDataFolder`, `moveDataFolder`, `chooseDataFolder`                                                       |
| `public/electron.js`                    | Read data folder from config file; register new handlers                                                           |
| `public/db.js` / `src/main/db/index.ts` | Accept custom dbPath from config                                                                                   |

## Step 1: Install Tabs

```
bunx shadcn@latest add tabs
```

## Step 2: Data folder config file

**`public/electron.js`** — before `setupDatabase()`:

- Read `config.json` from `app.getPath("userData")`
- Extract `dataFolder` (default: `path.join(os.homedir(), "app_database.db")`)
- Pass custom path to `setupDatabase()`

**`public/db.js` / `src/main/db/index.ts`** — `setupDatabase(customDbPath?)`:

- Use `customDbPath` if provided, else current default

New IPC handlers in `public/electron.js` (or a new `public/ipc/data-folder.js`):

- `settings:getDataFolder` — returns current dbPath
- `settings:moveDataFolder` — copies DB to new location, writes config.json, relaunches app (same pattern as `backups:restore`)
- `settings:chooseDataFolder` — directory picker dialog

## Step 3: Extend Preferences

**`src/types/electron.d.ts`**:

```ts
type Preferences = {
  hideReconciled: boolean;
  hideCleared: boolean;
  autofillPayees: boolean;
  backupFolder?: string;
  backupRetentionDays?: number;
};
```

**`public/ipc/settings.js`** — add to `getPreferences`:

- `backupFolder`: `json_extract($.backupFolder)` → null default
- `backupRetentionDays`: `json_extract($.backupRetentionDays)` → null default

**`public/ipc/backups.js`** — use `backupRetentionDays` from prefs in `sweepOldBackups` instead of hardcoded 30.

## Step 4: Create SettingsPage

**`src/pages/Settings/SettingsPage.tsx`**

```
Layout
  div.p-4.max-w-2xl.mx-auto
    Header: back button + "Settings"
    Tabs (defaultValue="general")
      TabsList: General | Advanced
      TabsContent "general":
        Card:
          Checkbox + label: "Automatically fill transaction details" → autofillPayees
      TabsContent "advanced":
        Card "Backups":
          - Backup folder: Input + Browse (FolderOpen icon button)
            Load default from getDefaultBackupFolder, override from prefs
          - Keep backups for: number Input + "days" suffix
            Default 30 when undefined
        Card "Data":
          - Data folder: Input (readonly) + Browse button
            Load from getDataFolder()
          - "Move" button triggers moveDataFolder (with confirmation dialog)
          - Warning text: "Moving data will restart the app"
```

Save on change for preferences (autofillPayees, backupFolder, backupRetentionDays).
Data folder uses explicit "Move" action with confirmation.

## Step 5: Route + header

**`src/App.tsx`** — add lazy import + `<Route path="/settings" element={<SettingsPage />} />`

**`src/components/header.tsx`** — add "Settings" item at top of dropdown, navigates to `/settings`.

## Step 6: Backup retention integration

**`public/ipc/backups.js`** — `sweepOldBackups` reads retention days from prefs (passed through or queried). Fallback to 30 if not set.

## Verification

1. Settings dropdown → "Settings" → navigates to `/settings`
2. General tab: toggle autofillPayees → TransactionForm behavior changes
3. Advanced tab: change backup folder → create backup → uses new folder
4. Advanced tab: change retention days → persisted
5. Advanced tab: browse data folder → move → app restarts with DB in new location
6. BackupDialog still works with its own folder input
7. `bun run lint && bun run check-types`
8. `bun run test`
