# QIF Import

## Context

Users need to import bank transactions from QIF files. QIF files contain terse uppercase payee names that may overlap with existing transactions, so a matching/dedup screen is needed before import.

## Decisions

- Date format: always DD/MM/YYYY (UK locale)
- Import triggered from AccountTransactions page (auto-uses current account)
- UI: modal dialog (not full page)

## QIF Format (Type:Bank)

```
!Type:Bank
D09/03/2026       ← date DD/MM/YYYY
PPAYEE NAME       ← payee (uppercase, terse)
T-27.19           ← amount (negative=withdrawal, positive=deposit)
MMemo text        ← memo (optional)
^                 ← end of transaction
```

## Architecture

### 1. QIF Parser — `src/lib/qif-parser.ts` (new, pure)

```ts
type QifTransaction = {
  date: string; // yyyy-MM-dd
  payee: string;
  amount: number;
  memo: string | null;
};

function parseQif(content: string): QifTransaction[];
```

- Validate `!Type:Bank` header
- Split on `^`, parse D/P/T/M lines from each block
- Date: parse DD/MM/YYYY → yyyy-MM-dd
- Amount: `parseFloat(T value)`

### 2. Duplicate Matcher — `src/lib/qif-matcher.ts` (new, pure)

```ts
type MatchResult = {
  qifTx: QifTransaction;
  status: "new" | "duplicate" | "out-of-range";
  matchedTxId?: number;
  checked: boolean;
};

function matchQifTransactions(
  qifTxs: QifTransaction[],
  existingTxs: Transaction[],
  lastReconcileDate: string | null,
): MatchResult[];
```

**Logic per QIF transaction:**

1. If date ≤ lastReconcileDate → `out-of-range`, unchecked
2. Find existing tx with same amount AND date within ±3 days → `duplicate`, unchecked
3. Otherwise → `new`, checked

### 3. IPC — `public/ipc/import.js` (new)

- `import:chooseQifFile` — `dialog.showOpenDialog` with filter `{ name: "QIF File", extensions: ["qif"] }`
- `import:readQifFile(filePath)` — `fs.readFileSync(filePath, "utf-8")`

Register in `public/electron.js`, expose in `public/preload.js`.

### 4. Import Dialog — `src/pages/AccountTransactions/ImportDialog.tsx` (new)

Props: `open`, `onOpenChange`, `accountId`, `qifContent: string`, `filename: string`

**Layout (sm:max-w-3xl):**

- Header: "Import — {filename}"
- Info bar: "{N} transactions found, {X} new, {Y} duplicates"
- Table: Checkbox | Status (badge) | Date | Payee | Withdrawal | Deposit
  - "New" rows: green badge, pre-checked
  - "Duplicate" rows: yellow badge, unchecked
  - "Out of range" rows: gray badge, unchecked
- Footer: "Import {count} transactions" button + Cancel

**On Import:** For each checked row, `createTransaction` with `cleared: true`, `categoryId: null`, `notes: memo`. Invalidate queries, close dialog.

### 5. AccountTransactions Integration

**`src/pages/AccountTransactions/AccountTransactions.tsx`:**

- Add "Import" button next to Reconcile
- On click: `chooseQifFile()` → `readQifFile()` → set state → open ImportDialog
- State: `importData: { content: string; filename: string } | null`

## Files to Modify

| File                                                    | Action                                |
| ------------------------------------------------------- | ------------------------------------- |
| `src/lib/qif-parser.ts`                                 | **New** — parser                      |
| `src/lib/qif-matcher.ts`                                | **New** — duplicate detection         |
| `src/pages/AccountTransactions/ImportDialog.tsx`        | **New** — import matching dialog      |
| `src/pages/AccountTransactions/AccountTransactions.tsx` | Add Import button + state             |
| `public/ipc/import.js`                                  | **New** — file picker + file read     |
| `public/electron.js`                                    | Register import handlers              |
| `public/preload.js`                                     | Expose `chooseQifFile`, `readQifFile` |
| `src/types/electron.d.ts`                               | Add API methods                       |
| `src/tests/unit/qif-parser.test.ts`                     | **New** — parser tests                |
| `src/tests/unit/qif-matcher.test.ts`                    | **New** — matcher tests               |

## Verification

1. On account page, click Import → file picker filtered to .qif
2. Select example QIF → dialog shows 25 txns with status badges
3. Duplicates detected against existing account transactions
4. Uncheck/check rows → Import button count updates
5. Click Import → transactions created as cleared
6. Unit tests: parser handles valid/invalid QIF, matcher covers new/duplicate/out-of-range
7. `bun run lint && bun run check-types && bun run test`
