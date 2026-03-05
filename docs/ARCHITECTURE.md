# Budgie Architecture

Electron 40 + React 19 + TypeScript + Tailwind v4 + better-sqlite3 + Drizzle ORM. Single-user desktop personal finance app.

---

## Process Map

```
public/electron.js   Main process (CJS, Node.js) — window, IPC handlers, DB
public/preload.js    Preload (CJS, sandboxed)    — contextBridge API surface
src/                 Renderer (Vite + React)      — all UI code
```

`contextIsolation: true`. Renderer has zero Node access. All DB access goes through IPC.

---

## Adding an IPC Handler (the full pattern)

Four files must change together:

**1. `src/main/db/index.ts`** — add query function or export if needed, then rebuild:

```
bun run vite build --config vite.main.config.ts
```

This writes `public/db.js` (CJS bundle). Any change to `src/main/db/` requires a rebuild.

**2. `public/electron.js`** — register handler after `setupDatabase()`:

```js
ipcMain.handle("channel:name", () => db.select().from(schema.tableName));
```

**3. `public/preload.js`** — expose to renderer:

```js
contextBridge.exposeInMainWorld("api", {
  existingMethod: () => ipcRenderer.invoke("existing:channel"),
  newMethod: (arg) => ipcRenderer.invoke("channel:name", arg),
});
```

**4. `src/types/electron.d.ts`** — extend the interface:

```ts
interface ElectronAPI {
  existingMethod: () => Promise<ExistingType[]>;
  newMethod: (arg: ArgType) => Promise<ReturnType>;
}
```

Types use `InferSelectModel<typeof schema.tableName>` from drizzle-orm.

---

## Database

- File: `~/app_database.db` (`app.getPath("home")`)
- WAL mode enabled (`sqlite.pragma("journal_mode = WAL")`)
- Schema: `src/main/db/schema.ts` — Drizzle `sqliteTable` definitions
- Migrations: `src/main/db/migrations/` — generated with `bun run db:migrate`
- Drizzle instance (`db`) and `schema` namespace are both exported from `src/main/db/index.ts`

**To add a table:** edit `schema.ts`, run `bun run db:migrate`, then rebuild `db.js`.

---

## Frontend Structure

```
src/
  index.html        Inline script sets .dark class before paint
  index.tsx         createRoot, StrictMode
  App.tsx           QueryClientProvider → HashRouter → Routes, dark mode listener
  pages/
    Home.tsx        Currently: proof-of-concept tasks query
  components/
    layout.tsx      SidebarProvider + SideMenu + sticky header + <main>
    side-menu.tsx   Left nav rail, account list (stub)
    ui/             shadcn components (@base-ui/react primitives)
  types/
    electron.d.ts   window.api type declarations
  index.css         All Tailwind config, design tokens, dark mode variables
```

### Routing

`HashRouter` (required — works with `file://` in production). Add routes in `App.tsx`.

Current routes:

```
/   →   pages/Home.tsx
```

Planned: Overview, Accounts, Transaction Register, Scheduled Payments, Budget, Reports.

---

## Data Fetching Pattern

TanStack Query v5. `queryClient` is a module-level singleton in `App.tsx`.

```ts
// Read
const { data = [] } = useQuery({
  queryKey: ["tableName"],
  queryFn: () => window.api.getItems(),
});

// Write
const mutation = useMutation({
  mutationFn: (payload) => window.api.createItem(payload),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tableName"] }),
});
```

No global state library. Server state lives in TanStack Query. UI state is component-local `useState`.

---

## Styling

Tailwind v4 — no `tailwind.config.ts`. All config in `src/index.css`.

- Design tokens: `oklch()` color space, defined in `:root` and `.dark`
- Dark mode: `.dark` class on `<html>`. Applied by inline script in `index.html` on load; kept in sync by `useEffect` in `App.tsx` listening to `prefers-color-scheme`
- Theme mapped into Tailwind via `@theme inline` block — use `bg-background`, `text-foreground`, `text-primary` etc.
- Font: Noto Sans Variable (`font-sans`)
- Chart palette: `--chart-1` through `--chart-5` (blue range)
- Border radius: `--radius: 0.45rem`; steps: `rounded-sm/md/lg/xl/2xl/3xl/4xl`

---

## Build

```
bun run start          Dev: Vite on :3000 + Electron (wait-on)
bun run build          Prod: vite build → vite build (db) → electron-builder → out/
bun run db:migrate     Generate migration SQL from schema changes
bun run check-types    tsc --noEmit
bun run lint           eslint --fix
```

Two Vite builds:

- `vite.config.ts` — renderer: `src/` → `build/`, `base: "./"` for `file://` compat
- `vite.main.config.ts` — DB module: `src/main/db/index.ts` → `public/db.js` (CJS, externalises electron/better-sqlite3/drizzle-orm)
