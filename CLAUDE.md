# Budgie — Agent Instructions

## Before Marking Any Task Done

After every code change, run **both** checks and fix all reported issues before considering the task complete:

```
bun run lint
bun run check-types
```

Both commands must exit cleanly (zero errors) before work is done.

---

## Test Infrastructure

Tests live in `src/tests/` and run with Vitest:

```
bun run test          # run all tests
```

> `npm rebuild better-sqlite3` may be required before the first run on a new machine
> (better-sqlite3 is a native module that must be compiled for the current runtime).

### Layout

```
src/tests/
  integration/
    setup.ts               ← pins vi.setSystemTime("2026-03-07T00:00:00.000Z")
    accounts.test.ts
    categories.test.ts
    forecast.test.ts
    reconciliation.test.ts
    scheduled.test.ts      ← CRUD + rrule expansion
    auto-post.test.ts      ← processAutoPost sweep (7 suites)
    transactions.test.ts
    helpers/
      db.ts                ← createTestDb() — in-memory SQLite + full migrations
      fixtures.ts          ← shared typed seed data (accounts, transactions, scheduled)
      ipc.ts               ← createMockIpc() + registerAllHandlers()
  unit/
    balances.unit.test.ts
    forecast.unit.test.ts
```

### Key patterns

- **`createTestDb()`** — spins up an in-memory SQLite DB with all migrations applied. Each
  `describe` block creates its own instance and calls `teardown()` in `afterAll`.
- **`createMockIpc()` / `registerAllHandlers()`** — loads real CommonJS IPC handlers from
  `public/ipc/` against the in-memory DB, bypassing Electron entirely.
- **Deterministic time** — all integration tests run with system time pinned to `2026-03-07`
  via `vi.setSystemTime` in `setup.ts`. Author fixture dates and expected values relative to
  that anchor.
- **Sequential stateful tests** — `it` blocks within an integration `describe` are intentionally
  sequential; each builds on the previous block's DB state.
- **`processAutoPost` is directly callable** — it is exported as
  `require("public/ipc/scheduled-transactions.js").processAutoPost` and takes `(db, schema)`,
  so it can be exercised directly in integration tests without going through the IPC mock.

---

Whenever a new table is added to `src/main/db/schema.ts`, you **must** wire up full CRUD
across all five files before considering the task done.

**One file per entity.** Each entity lives in its own `public/ipc/<entity>.js`. Never combine
multiple entities in one handler file, and never add cross-entity joins to these handlers —
each handler queries only its own table.

### 1. `public/ipc/entity.js` — create handler file

```js
const { eq } = require("drizzle-orm");

module.exports = function registerEntityHandlers(ipcMain, db, schema) {
  ipcMain.handle("entity:getAll", () => db.select().from(schema.entity));
  ipcMain.handle("entity:getById", (_, id) =>
    db
      .select()
      .from(schema.entity)
      .where(eq(schema.entity.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("entity:create", (_, data) =>
    db.insert(schema.entity).values(data).returning(),
  );
  ipcMain.handle("entity:update", (_, id, data) =>
    db
      .update(schema.entity)
      .set(data)
      .where(eq(schema.entity.id, id))
      .returning(),
  );
  ipcMain.handle("entity:delete", (_, id) =>
    db.delete(schema.entity).where(eq(schema.entity.id, id)),
  );
};
```

### 2. `public/electron.js` — import and register

```js
const registerEntityHandlers = require("./ipc/entity");

// inside app.whenReady():
registerEntityHandlers(ipcMain, db, schema);
```

### 3. `public/preload.js` — expose on `window.api`

```js
getEntities:    ()           => ipcRenderer.invoke("entity:getAll"),
getEntity:      (id)         => ipcRenderer.invoke("entity:getById", id),
createEntity:   (data)       => ipcRenderer.invoke("entity:create", data),
updateEntity:   (id, data)   => ipcRenderer.invoke("entity:update", id, data),
deleteEntity:   (id)         => ipcRenderer.invoke("entity:delete", id),
```

### 4. `src/types/electron.d.ts` — extend `ElectronAPI`

```ts
import type { InferSelectModel } from "drizzle-orm";
import type { entity } from "@/main/db/schema";

export type Entity = InferSelectModel<typeof entity>;

// In ElectronAPI interface:
getEntities: () => Promise<Entity[]>;
getEntity: (id: number) => Promise<Entity | null>;
createEntity: (data: Omit<Entity, "id" | "createdAt">) => Promise<Entity[]>;
updateEntity: (id: number, data: Partial<Omit<Entity, "id" | "createdAt">>) =>
  Promise<Entity[]>;
deleteEntity: (id: number) => Promise<void>;
```

### 5. Rebuild `public/db.js`

After any change to `src/main/db/`:

```
bun run vite build --config vite.main.config.ts
```

---

## Changesets (Versioning & Changelog)

This project uses [changesets](https://github.com/changesets/changesets) for version management.
**Every PR or push to main that includes user-facing changes MUST include a changeset.**

### Adding a changeset

Run `bunx changeset` and follow the prompts — pick `patch`, `minor`, or `major` and write a
short summary of the change. This creates a markdown file in `.changeset/`.

- **patch** — bug fixes, cosmetic tweaks
- **minor** — new features, non-breaking enhancements
- **major** — breaking changes

### Before release

```
bun run version        # consumes changesets, bumps package.json, appends CHANGELOG.md
```

### Rules for agents

- If your work changes any user-facing behavior, **add a changeset before finishing**.
  Run `bunx changeset` interactively, or create a `.changeset/<short-name>.md` file directly:
  ```md
  ---
  "budgie": patch
  ---

  Short description of the change
  ```
- Do **not** run `bun run version` — the maintainer does this at release time.
- Do **not** skip the changeset even if the change seems small. When in doubt, add one.

---

## UI Components

All UI components must come from the shadcn component registry at **https://ui.shadcn.com/docs/components**.

- **Always prefer the Base UI variant** when a component offers both a Radix UI and a Base UI implementation. Base UI components are listed under the "Base UI" section in the sidebar (e.g. Button, Dialog, Select, Combobox, Button Group, etc.).
- Install missing components with `bunx shadcn@latest add <component-name>` before building custom implementations.
- Never hand-roll UI primitives (dialogs, selects, comboboxes, tooltips, popovers, etc.) that already exist in the registry.
- Existing components live in `src/components/ui/`. Read a component file before using it to understand its API — the Base UI wrappers often differ from the Radix equivalents in prop names and composition patterns.

---

## IPC Channel Naming Convention

`<entity>:<verb>` — e.g. `accounts:getAll`, `accounts:getById`, `accounts:create`, `accounts:update`, `accounts:delete`.

## Migration

After editing `schema.ts`, generate a migration before wiring IPC:

```
bun run db:migrate
```

> **Note:** `bun run db:migrate` (`drizzle-kit generate`) may prompt interactively when it
> detects column renames. If it does, pipe won't work — write the migration manually instead
> (see below).

### `created_at` — always use a SQL default

All `created_at` columns must use a stable SQL-level default, **not** a JS function:

```ts
// CORRECT — stable, never causes drift
createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),

// WRONG — JS function serialises differently each generate run → spurious migrations
createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
```

### CRITICAL: Never drop tables

This is a financial application. **Never generate or apply a migration that contains `DROP TABLE`.**
Data loss is unacceptable.

Always inspect generated SQL before applying it. If it contains `DROP TABLE`, discard it and
write a manual migration instead. For adding columns, `ALTER TABLE ... ADD COLUMN` is always
sufficient and safe:

```sql
ALTER TABLE `table_name` ADD COLUMN `column_name` type REFERENCES `other_table`(`id`);
```

### Manual migration checklist

After writing a migration file by hand:

1. Add an entry to `src/main/db/migrations/meta/_journal.json`
2. Update `src/main/db/migrations/meta/<idx>_snapshot.json` to match the new schema state
3. Rebuild `public/db.js` (see above)
4. Test against a fresh DB:
   ```
   rm -f test.db
   sed '/^--> statement-breakpoint/d' src/main/db/migrations/<file>.sql | sqlite3 test.db
   sqlite3 test.db ".tables"
   ```
