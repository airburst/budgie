# Budgie — Agent Instructions

## Before Marking Any Task Done

After every code change, run **both** checks and fix all reported issues before considering the task complete:

```
bun run lint
bun run check-types
```

Both commands must exit cleanly (zero errors) before work is done.

## New Entity Rule

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

### CRITICAL: Never drop tables

This is a financial application. **Never generate or apply a migration that contains `DROP TABLE`.**
Data loss is unacceptable.

Drizzle will sometimes generate `DROP TABLE` / recreate migrations when it detects a default
value change (e.g. because `new Date().toISOString()` in the schema produces a different
timestamp on each `generate` run). Always inspect the generated SQL before applying it.

If a generated migration contains `DROP TABLE`, discard it and write a manual migration instead.
For adding columns, `ALTER TABLE ... ADD COLUMN` is always sufficient and safe:

```sql
ALTER TABLE `table_name` ADD COLUMN `column_name` type REFERENCES `other_table`(`id`);
```
