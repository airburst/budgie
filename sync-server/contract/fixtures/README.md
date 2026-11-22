# Conformance fixtures

Each file here is one test case that both sync engines (TypeScript in Budgie,
Swift in BudgieMac) must pass. A fixture says nothing about SQLite, Drizzle or
SwiftData: rows are written as contract payloads (`../SPEC.md` section 5) plus
their sync state, so any engine can load them into its own store.

Every file validates against `../fixture.schema.json` (JSON Schema draft-07).
Every payload must also match `../tables.json` for its table: exactly the
listed fields, with the listed types. Budgie's
`src/tests/unit/sync-contract-fixtures.unit.test.ts` checks both.

Files are told apart by `kind`:

- `"merge"`: one sync round against a scripted server (below).
- `"ids"`: test vectors for the deterministic auto-post id function
  (`ids.json`, `../SPEC.md` section 8.9).

## Id vectors (`ids.json`)

`vectors[]` holds `schedulePublicId`, `dueDate`, `leg`, the exact `input`
string that is hashed, its `sha256` in lowercase hex, and the resulting `id`.
A harness checks, for every vector, that its function builds the same input
string, and returns the same id. `invalid[]` holds inputs the function must
refuse (`reason` is for people, not compared). The hashes were produced with
Python's `hashlib`, independently of either engine.

## Merge fixtures

### Shape

```json
{
  "kind": "merge",
  "formatVersion": 1,
  "id": "remote-newer-wins",
  "description": "What the case proves, in one or two sentences.",
  "device": { "deviceId": "3c9a1e52-...", "now": 1795343400000 },
  "given": [LocalRow],
  "editsInFlight": [LocalEdit],
  "response": { "pull": [Envelope], "rejected": [Rejection] },
  "expect": { "push": [Envelope], "rows": [LocalRow], "error": null }
}
```

| Field                    | Meaning                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `id`                     | Kebab-case; equals the file name without `.json`.                                                 |
| `formatVersion`          | The contract format version the fixture is written for.                                           |
| `device.deviceId`        | This device's id. Every HLC the engine stamps ends with it.                                       |
| `device.now`             | The engine's clock, in milliseconds since the Unix epoch, UTC. Fixed for the whole case.          |
| `given`                  | The complete local store before the round. Tables not mentioned are empty.                        |
| `editsInFlight`          | Optional. Local edits made after the push is sent and before the response arrives.                |
| `response.pull`          | Every envelope the server returns, all pages together, `more: false`.                             |
| `response.rejected`      | Pushed envelopes the server refused (`stale` or `drift`). Every other pushed envelope was stored. |
| `response.formatVersion` | Optional. The server's `formatVersion`; defaults to the fixture's.                                |
| `expect.push`            | The envelopes the engine must push in this round.                                                 |
| `expect.rows`            | The complete local store after the round.                                                         |
| `expect.error`           | `null`, or the apply error the round must fail with (`missing_reference`, `invalid_envelope`).    |

`LocalRow`:

```json
{
  "tbl": "accounts",
  "hlc": "001795342400000:00000:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47",
  "dirty": false,
  "unsealed": false,
  "payload": {
    "publicId": "0b8e5d7c-...",
    "...": "every field in tables.json"
  },
  "local": {
    "pendingReconcileBalance": 1234.56,
    "pendingReconcileDate": "2026-11-21"
  }
}
```

- `hlc` is `null` for a row that has never been sealed.
- `dirty` and `unsealed` are the two states of `../SPEC.md` section 8.3.
  `unsealed: true` implies `dirty: true`.
- `payload` is the row exactly as it would be sent, including `publicId`,
  `deletedAt` and, for accounts and categories, the `deleted` flag.
- `local` holds local-only values that are never sent (section 5.4). Only the
  two pending reconcile fields of `accounts` are defined. In `given`, absent
  means `null`. In `expect.rows`, it is compared only when present.

`LocalEdit` is `{ "tbl", "payload" }`: the full row after the edit, written as
an ordinary local edit (the row becomes dirty and unsealed). Its
`payload.updatedAt` is the edit time.

`Envelope` and `Rejection` are the wire shapes of `../SPEC.md` sections 6 and
9.3.

### How a harness runs one merge fixture

1. Create an empty local store. Load every row of `given` directly, with its
   payload, `local` values, `hlc`, `dirty` and `unsealed` exactly as written.
   Loading is not a local edit: it must not change any of these.
2. Set the engine's device id to `device.deviceId` and its clock to
   `device.now`.
3. Seal and encode (section 10.1). The edit time of an unsealed row is its
   `payload.updatedAt` read as UTC; if that is `null`, `device.now`. Engines
   that record edit times separately (BudgieMac) set them from the same value
   when loading.
4. Compare the outgoing envelopes with `expect.push`: the same set, keyed by
   `(tbl, publicId)`, order ignored, every field equal (payloads compared as
   JSON values).
5. Apply `editsInFlight`, if present, as local edits.
6. Treat `response` as the only server response: apply `pull` and acknowledge
   the push using `rejected` (sections 10.3 and 10.4), including the
   transfer-pair rule (section 8.8). Do not start a second round.
7. If `expect.error` is a string, the apply must fail with that error.
   Sealing (step 3) is not undone by a failed apply.
8. Compare the whole store with `expect.rows`: the same set of
   `(tbl, publicId)`; for each row, equal `hlc`, `dirty`, `unsealed` and
   `payload`, and equal `local` values where `local` is given.

Numbers compare by value (`1500` equals `1500.0`). Strings compare exactly.

### Writing a fixture

- One behaviour per file; name the file after it.
- Use the device ids and timestamps of the existing files where possible. The
  local device is `3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47`, the other device
  `9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50`, and `now` is 2026-11-22 10:30:00
  UTC (`1795343400000`).
- Every merge bug found in either engine becomes a fixture before it is fixed.
- Adding or changing a fixture changes the contract: see `../VERSION`.

## Fixtures

| File                                      | Story  | Behaviour                                                         |
| ----------------------------------------- | ------ | ----------------------------------------------------------------- |
| `remote-newer-wins.json`                  | SY-007 | Higher remote HLC replaces the local row; local-only fields stay. |
| `remote-older-ignored.json`               | SY-007 | Lower remote HLC is skipped.                                      |
| `equal-hlc-ignored.json`                  | SY-007 | Equal HLC is skipped even with a different payload.               |
| `remote-delete.json`                      | SY-007 | Remote delete applies `deletedAt` and the `deleted` flag.         |
| `remote-undelete-beats-older-delete.json` | SY-007 | Undelete with a higher HLC revives; with a lower one, skipped.    |
| `local-dirty-sealed-and-pushed.json`      | SY-007 | Seal rule on new, re-edited and already sealed rows; ack.         |
| `ids.json`                                | SY-008 | Deterministic auto-post id vectors (kind `ids`).                  |
