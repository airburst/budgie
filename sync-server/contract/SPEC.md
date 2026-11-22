# Budgie sync contract

Format version: **1**

This document is the contract between the Budgie sync server and the two sync
engines (TypeScript in the web app, Swift in BudgieMac). An engine or server
built from this document alone, plus `tables.json` and the conformance
fixtures, must interoperate with the others. Where this document and any
implementation disagree, this document wins until it is changed.

Contract version: see `VERSION` (section 4.1). Conformance fixtures are in
`fixtures/`, described by `fixtures/README.md` and validated by
`fixture.schema.json`; both engines MUST pass every fixture.

The key words MUST, MUST NOT, SHOULD and MAY are used in their usual sense.

Contents:

1. Overview
2. Transport
3. Identifiers, tokens and codes
4. Format version
5. Row payloads
6. Envelope
7. Hybrid logical clock (HLC)
8. Merge and apply
9. Endpoints
10. The client sync cycle
11. Enrolment and lifecycle flows
12. Server storage (informative for clients)
13. Choices made where the plan was silent

---

## 1. Overview

- Each user has their own data set. Data sets are never shared between users.
- A user has one or more **devices** (an installed app: a BudgieMac install or
  a browser's web PWA). Each device holds a full local copy of the data and
  its own bearer token.
- Ten tables are synced (section 5). Every row has a **public id** (a UUID).
  Rows are exchanged whole, as **envelopes** (section 6).
- Conflicts are resolved by whole-row **last-write-wins** ordered by a per-row
  **hybrid logical clock** (section 7). Deleting a row is just another write.
- The server keeps exactly one entry per `(user, table, public id)`: the
  newest version it has accepted. It is a replica, not a history.
- There is one sync endpoint, `POST /v1/sync`, which pushes the caller's
  changes and pulls other devices' changes in one request (section 9.3).
- Everything not listed in section 5 stays on the device: preferences,
  half-finished reconciliations, BudgieMac's `bankText`, import rules and
  account order.

## 2. Transport

### 2.1 Base URL

The server's base URL is configuration in each app (build configuration or a
setting). It MUST NOT be hard-coded. The deployed server runs on a Cloudflare
`workers.dev` address; a custom domain may replace it later without any data
change. All paths in this document are relative to the base URL, for example
`<base>/v1/sync`.

HTTPS only. Clients MUST NOT follow redirects to another origin.

### 2.2 Requests and responses

- Request and response bodies are UTF-8 JSON with
  `Content-Type: application/json`. Requests without a body (GET, DELETE) send
  none. `204` responses have no body.
- Authenticated endpoints take `Authorization: Bearer <device token>`. The
  server resolves the user and device from the token only; any user or device
  id in a body is ignored.
- **Body cap: 1 MiB (1,048,576 bytes)** for every request. Larger requests are
  refused with `413 body_too_large` before the body is parsed. A sync request
  under the cap can still get `413 body_too_large` when its payloads are
  mostly quotes or backslashes: the server stores each payload as JSON text
  inside JSON, which can nearly double it. Clients that chunk pushes by size
  SHOULD leave room for this.
- Timestamps in API responses (not in row payloads) are ISO 8601 UTC with
  milliseconds, for example `"2026-11-22T10:25:00.000Z"`.
- Unknown fields in request bodies are ignored by the server. Unknown fields in
  response bodies MUST be ignored by clients, so the server can add response
  fields without a format bump.

### 2.3 CORS

The server sends CORS headers only for the configured web app origin
(production: `https://budget.fairhursts.net`; a local dev origin in dev builds
only). Allowed methods `GET, POST, DELETE`; allowed request headers
`Authorization, Content-Type`; preflight `OPTIONS` answers `204`. Other
origins get no CORS headers. BudgieMac is a native client and is not affected.

### 2.4 Errors

Every error response has this body:

```json
{
  "error": "rate_limited",
  "message": "Too many requests. Try again later.",
  "retryAfter": 30
}
```

- `error` is one of the codes below and is what clients branch on.
- `message` is English text for logs; clients SHOULD show their own wording.
- `retryAfter` (seconds, integer) is present on `429` and `503`, and the same
  value is sent in a `Retry-After` header.

| `error`              | HTTP | Retry?                  | Meaning                                                                                                                                                                        | Endpoints                 |
| -------------------- | ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `bad_request`        | 400  | no                      | Body is not valid JSON or does not match the request schema (including a malformed envelope, a duplicate envelope, or a cursor the server did not issue). Nothing was written. | any with a body or `:id`  |
| `bad_code`           | 400  | no                      | Enrolment code is unknown, already used or expired. One code for all three cases.                                                                                              | `POST /v1/enrol`          |
| `bad_token`          | 401  | no                      | `Authorization` header missing, malformed, or the token is unknown.                                                                                                            | authenticated             |
| `revoked`            | 401  | no                      | The token belongs to a revoked device.                                                                                                                                         | authenticated             |
| `not_found`          | 404  | no                      | Unknown path or method, or a device id that is not an active device of the caller's user.                                                                                      | any                       |
| `format_too_old`     | 409  | no (update the app)     | The request's `formatVersion` is lower than one already used by this user's devices.                                                                                           | `POST /v1/sync`           |
| `data_reset`         | 409  | no (Start or Join)      | The cursor predates a "Delete my cloud data" for this user.                                                                                                                    | `POST /v1/sync`           |
| `body_too_large`     | 413  | no (send less)          | Request body over 1 MiB.                                                                                                                                                       | any                       |
| `too_many_envelopes` | 413  | no (send less)          | More than 500 envelopes in `push`.                                                                                                                                             | `POST /v1/sync`           |
| `rate_limited`       | 429  | yes, after `retryAfter` | A rate limit was exceeded (section 2.5).                                                                                                                                       | any                       |
| `server_error`       | 500  | yes, with backoff       | Anything unexpected. Nothing is half-applied: the sync batch is atomic.                                                                                                        | any                       |
| `daily_limit`        | 503  | yes, after `retryAfter` | Cloudflare D1's free-plan daily limit was reached. `retryAfter` runs to the next 00:00 UTC.                                                                                    | any that use the database |

Per-envelope outcomes `stale` and `drift` are not HTTP errors; they are
reported inside a `200` sync response (section 9.3).

The server checks in this order, and stops at the first failure: rate limit,
body size, route, JSON and schema (`bad_request`, `too_many_envelopes`), token
(`bad_token`, `revoked`), then endpoint rules (`bad_code`, `format_too_old`,
`data_reset`, `not_found` for a device id). Clients MUST NOT depend on this
order.

`revoked`, `format_too_old` and `data_reset` are checked again as part of the
write itself, so a sync that races a revoke, a newer app's first sync or
"Delete my cloud data" gets the error and stores nothing.

Transport failures (no network, DNS, TLS, timeout) are retryable and mean
"offline" to the client.

### 2.5 Rate limits

There is no Cloudflare zone in front of the Worker, so all limits are enforced
inside the Worker. Exceeding any of them returns `429 rate_limited`.

- A per-IP request limit on every route.
- `POST /v1/enrol`: failed attempts are limited per IP. The count is
  approximate (it is kept per server instance), so a few more attempts than
  the limit may be answered before `429`.
- `POST /v1/devices/code`: limited per user.

The values are server configuration and are recorded in `sync-server/README.md`.
Clients only need to honour `retryAfter`.

### 2.6 Logging

Server logs carry user id, device id, route, status, counts and rejection
reasons. They MUST NOT contain payloads, tokens, codes or request bodies.

## 3. Identifiers, tokens and codes

### 3.1 Public ids

Every synced row has a public id: a UUID in canonical lowercase form,
`8-4-4-4-12` hex digits with hyphens, 36 characters:

```
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

- Any UUID version is accepted (random v4 for ordinary rows; the deterministic
  auto-post ids of section 8.9 use their own version).
- Uppercase, braces, missing hyphens and non-UUID strings (`legacy:...`,
  `auto:...`, 32 hex digits without hyphens) are invalid on the wire. A client
  holding such ids MUST rewrite them to fresh UUIDs before its first push
  (section 11.1). The server refuses them with `400 bad_request`.
- Public ids are unique per table, not across tables. The server keys rows by
  `(user, tbl, publicId)`.

### 3.2 Device ids

The server assigns each device a UUID (canonical lowercase) at enrolment and
returns it once (section 9.2). The client stores it; it is the last part of
every HLC the device stamps (section 7). A device that enrols again (after
signing out) gets a new device id.

### 3.3 Device tokens

- An opaque string, at most 128 characters, from the base64url alphabet. The
  server generates it from at least 32 random bytes.
- Returned once by `POST /v1/enrol`. The server stores only the lowercase hex
  SHA-256 of the token's UTF-8 bytes.
- Long-lived. It stops working when its device is revoked.
- Kept in the Keychain on the Mac and in the local database on the web.

### 3.4 Enrolment codes

Two kinds, entered the same way:

| Kind        | Issued by                                   | Length | Lifetime                              | Uses |
| ----------- | ------------------------------------------- | ------ | ------------------------------------- | ---- |
| Invite      | operator script `add-user` / `new-invite`   | 12     | server configuration (default 7 days) | 1    |
| Device code | an enrolled device, `POST /v1/devices/code` | 8      | 10 minutes                            | 1    |

- Alphabet: Crockford base32, `0123456789ABCDEFGHJKMNPQRSTVWXYZ`.
- Shown in groups of four separated by `-`: `7KQ2-M9XD` or `H4TW-8PZR-3N6C`.
- **Normalisation** (client before sending is optional; the server MUST
  apply it): uppercase; remove spaces and `-`; replace `O` with `0` and `I`
  and `L` with `1`.
- The server stores only the lowercase hex SHA-256 of the normalised code, and
  marks it used in the same database batch that creates the device.
- Codes never appear in logs.

## 4. Format version

The current format version is **1**. It is a single integer that covers:
the envelope (section 6), every table's payload (section 5 and `tables.json`),
and the merge rules (sections 7 and 8).

- Every sync request carries the client's `formatVersion`. The server stores,
  per user, the highest `formatVersion` any of the user's devices has sent, and
  returns it in every sync response.
- **Client guard:** if a sync response's `formatVersion` is higher than the
  client's own, the client MUST NOT apply that response's pull or any later
  page, MUST NOT advance its cursor, stops syncing, and shows "Update Budgie".
- **Server guard:** a sync request whose `formatVersion` is lower than the
  stored highest is refused with `409 format_too_old` before anything is
  written, so an old app cannot overwrite rows written in a newer format.
- A `formatVersion` higher than the server itself knows is accepted; the
  server does not parse payloads.

**Bump rule.** The version is bumped, and both apps must ship support before
any device sends the new number, when a change means an app implementing the
previous version could misread a row or lose data when it rewrites one. That
includes:

- adding, removing or renaming a payload field (adding is a bump too: an old
  app ignores the new field on apply and then drops it when it pushes its next
  edit of that row);
- changing a field's type, format, nullability or enum values;
- changing the envelope, the HLC format, or a merge rule;
- adding or removing a synced table.

Not a bump: new endpoints, new response fields that old clients ignore, new
error codes for new endpoints, server-side limits, and anything that does not
change what is stored in or read from a payload.

The sync format version is separate from `PORTABLE_FORMAT_VERSION` in
`src/services/portable-data.ts` (also 1). The two are expected to move together
when a payload field changes, but neither implies the other.

### 4.1 Contract version

`contract/VERSION` holds the **contract version**: a positive integer on one
line, followed by a newline. It identifies the whole contract directory
(`SPEC.md`, `tables.json`, `fixture.schema.json` and `fixtures/`), not the wire
format. BudgieMac's fixture copy script records it, so a stale copy fails a
test, and `GET /v1/health` returns it.

- The server's `CONTRACT_VERSION` constant (`sync-server/src/version.ts`) MUST
  equal it; a Budgie unit test checks this.
- It is `1` until BudgieMac first copies the contract. From then on, every
  change under `contract/` merged to `main` adds one to it, whether or not the
  format version changes.

## 5. Row payloads

A payload is a JSON object holding one row. Payloads reuse the portable export
row shapes (the `Portable*` types in Budgie's `src/services/portable-data.ts`
and BudgieMac's `BudgieExport`), minus the fields in section 5.4.

**`tables.json` in this directory is normative** for the field list of every
table: names, order, type, nullability, enum values, references, the
second-pass fields and the natural keys. The tables below repeat it for
reading; if they disagree, `tables.json` wins. A unit test in Budgie
(`src/tests/unit/sync-contract-tables.unit.test.ts`) fails if a `Portable*`
row type drifts from it.

### 5.1 Value types

| Type        | JSON    | Format                                                                                                     |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `uuid`      | string  | Canonical lowercase UUID (section 3.1).                                                                    |
| `string`    | string  | Any UTF-8 text, including empty. Compared byte for byte.                                                   |
| `number`    | number  | Finite JSON number (IEEE 754 double). Money is in major units, e.g. `-42.17`. No `NaN`, no strings.        |
| `integer`   | number  | Whole JSON number in the 32-bit signed range.                                                              |
| `boolean`   | boolean | `true` or `false`. Not `0` or `1`.                                                                         |
| `timestamp` | string  | UTC, `YYYY-MM-DD HH:MM:SS` (SQLite `CURRENT_TIMESTAMP` form, 19 characters, no `T`, no zone, no fraction). |
| `date`      | string  | Calendar date `YYYY-MM-DD`.                                                                                |
| `month`     | string  | Calendar month `YYYY-MM`.                                                                                  |

- Every field listed for a table MUST be present in its payload. A nullable
  field with no value is sent as `null`, never omitted.
- Values are carried, not interpreted: sign conventions for amounts, the
  `rrule` text (RFC 5545 recurrence rule, optionally with a `DTSTART:` line)
  and free text are stored as received.
- An enum field holding a value outside its list is invalid. New enum values
  are a format bump.

### 5.2 Fields common to every table

| Field       | Type        | Null | Notes                                                               |
| ----------- | ----------- | ---- | ------------------------------------------------------------------- |
| `publicId`  | `uuid`      | no   | MUST equal the envelope's `publicId`. Receivers use the envelope's. |
| `createdAt` | `timestamp` | yes  | When the row was first created, on whichever device.                |
| `updatedAt` | `timestamp` | yes  | Last local edit time on the device that wrote this version.         |
| `deletedAt` | `timestamp` | yes  | Non-null exactly when the row is deleted (section 5.5).             |

### 5.3 Per-table fields

`→ x` marks a foreign key, sent as the referenced row's public id in table `x`.
Fields marked **2nd** are resolved in the second apply pass (section 8.5).

**`accounts`** (apply order 1)

| Field          | Type      | Null | Notes                                                       |
| -------------- | --------- | ---- | ----------------------------------------------------------- |
| `name`         | `string`  | no   |                                                             |
| `number`       | `string`  | yes  | Account number as typed.                                    |
| `type`         | `string`  | no   | One of `bank`, `credit_card`, `loan`, `investment`, `cash`. |
| `balance`      | `number`  | no   | Opening balance.                                            |
| `currency`     | `string`  | no   | ISO 4217 code, e.g. `GBP`.                                  |
| `notes`        | `string`  | yes  |                                                             |
| `interestRate` | `number`  | yes  |                                                             |
| `creditLimit`  | `number`  | yes  |                                                             |
| `deleted`      | `boolean` | no   | Legacy delete flag. MUST equal the envelope's `deleted`.    |

**`categories`** (apply order 2)

| Field            | Type      | Null | Notes                                                     |
| ---------------- | --------- | ---- | --------------------------------------------------------- |
| `parentPublicId` | `uuid`    | yes  | → `categories`. **2nd**. `null` for a top-level category. |
| `name`           | `string`  | no   |                                                           |
| `expenseType`    | `string`  | no   | One of `expense`, `income`, `transfer`.                   |
| `deleted`        | `boolean` | no   | Legacy delete flag. MUST equal the envelope's `deleted`.  |

**`envelopes`** (apply order 3)

| Field       | Type      | Null | Notes                     |
| ----------- | --------- | ---- | ------------------------- |
| `name`      | `string`  | no   |                           |
| `active`    | `boolean` | no   |                           |
| `sortOrder` | `integer` | no   | Display order, ascending. |

**`transactions`** (apply order 4)

| Field                         | Type      | Null | Notes                                                   |
| ----------------------------- | --------- | ---- | ------------------------------------------------------- |
| `accountPublicId`             | `uuid`    | no   | → `accounts`.                                           |
| `categoryPublicId`            | `uuid`    | yes  | → `categories`.                                         |
| `date`                        | `date`    | no   |                                                         |
| `payee`                       | `string`  | no   | Free text, not a reference to `payees`.                 |
| `amount`                      | `number`  | no   |                                                         |
| `notes`                       | `string`  | yes  |                                                         |
| `cleared`                     | `boolean` | no   |                                                         |
| `reconciled`                  | `boolean` | no   |                                                         |
| `transferTransactionPublicId` | `uuid`    | yes  | → `transactions`. **2nd**. The other leg of a transfer. |

**`account_reconciliations`** (apply order 5)

| Field             | Type     | Null | Notes              |
| ----------------- | -------- | ---- | ------------------ |
| `accountPublicId` | `uuid`   | no   | → `accounts`.      |
| `date`            | `date`   | no   |                    |
| `balance`         | `number` | no   | Statement balance. |
| `notes`           | `string` | yes  |                    |

**`scheduled_transactions`** (apply order 6)

| Field                       | Type      | Null | Notes                                      |
| --------------------------- | --------- | ---- | ------------------------------------------ |
| `accountPublicId`           | `uuid`    | no   | → `accounts`.                              |
| `categoryPublicId`          | `uuid`    | yes  | → `categories`.                            |
| `payee`                     | `string`  | no   |                                            |
| `amount`                    | `number`  | no   |                                            |
| `rrule`                     | `string`  | no   | RFC 5545 recurrence rule text.             |
| `nextDueDate`               | `date`    | yes  |                                            |
| `autoPost`                  | `boolean` | no   |                                            |
| `daysInAdvance`             | `integer` | yes  |                                            |
| `notes`                     | `string`  | yes  |                                            |
| `active`                    | `boolean` | no   |                                            |
| `transferToAccountPublicId` | `uuid`    | yes  | → `accounts`. Set for scheduled transfers. |

**`payees`** (apply order 7). Natural key: `name`.

| Field              | Type     | Null | Notes            |
| ------------------ | -------- | ---- | ---------------- |
| `name`             | `string` | no   | Unique per user. |
| `categoryPublicId` | `uuid`   | yes  | → `categories`.  |
| `amount`           | `number` | yes  | Default amount.  |

**`envelope_categories`** (apply order 8). Natural key: `categoryPublicId`.

| Field              | Type   | Null | Notes                            |
| ------------------ | ------ | ---- | -------------------------------- |
| `envelopePublicId` | `uuid` | no   | → `envelopes`.                   |
| `categoryPublicId` | `uuid` | no   | → `categories`. Unique per user. |

**`budget_allocations`** (apply order 9). Natural key:
`(envelopePublicId, month)`.

| Field              | Type     | Null | Notes          |
| ------------------ | -------- | ---- | -------------- |
| `envelopePublicId` | `uuid`   | no   | → `envelopes`. |
| `month`            | `month`  | no   |                |
| `assigned`         | `number` | no   |                |

**`budget_transfers`** (apply order 10)

| Field                  | Type     | Null | Notes          |
| ---------------------- | -------- | ---- | -------------- |
| `fromEnvelopePublicId` | `uuid`   | no   | → `envelopes`. |
| `toEnvelopePublicId`   | `uuid`   | no   | → `envelopes`. |
| `month`                | `month`  | no   |                |
| `amount`               | `number` | no   |                |
| `notes`                | `string` | yes  |                |

Example payload, `transactions`:

```json
{
  "publicId": "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b",
  "createdAt": "2026-11-20 09:12:44",
  "updatedAt": "2026-11-22 10:15:30",
  "deletedAt": null,
  "accountPublicId": "0b8e5d7c-1a2b-4c3d-9e8f-7a6b5c4d3e2f",
  "categoryPublicId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "date": "2026-11-20",
  "payee": "Tesco",
  "amount": -42.17,
  "notes": null,
  "cleared": true,
  "reconciled": false,
  "transferTransactionPublicId": null
}
```

### 5.4 Never sent, and local-only data

- `accounts.pendingReconcileBalance` and `accounts.pendingReconcileDate` are
  part of the portable export but are **never sent**. A half-finished
  reconciliation stays on its device. On apply, a receiver leaves its local
  values of these two fields unchanged (an inserted row gets `null`).
  `tables.json` lists them under `neverSent`.
- Preferences (`settings`, including account shortcuts) are never sent.
- BudgieMac's `Transaction.bankText`, import rules and account order are never
  sent. On apply, BudgieMac keeps its local values.
- Local integer ids, `hlc` columns and dirty flags are never part of a payload.

A sender MUST NOT include any of these in a payload.

### 5.5 Deleted rows

Deletion is soft on the wire: a deleted row is an envelope with
`deleted: true` and a full payload whose `deletedAt` is set.

Senders MUST keep these consistent:

- `payload.deletedAt` is non-null if and only if `envelope.deleted` is `true`;
- for `accounts` and `categories`, `payload.deleted` equals `envelope.deleted`.

Receivers treat `envelope.deleted` as authoritative and normalise on apply:

- `deleted: true` and `payload.deletedAt` is `null`: store `deletedAt` as the
  envelope HLC's wall time (section 7.1) formatted as a `timestamp`;
- `deleted: false`: store `deletedAt` as `null`;
- `accounts` and `categories`: store `deleted` equal to `envelope.deleted`.

A client that hard-deletes rows locally (BudgieMac) MUST still send a full
payload for a delete. It therefore has to keep, or build at deletion time, the
row's last payload with its tombstone.

### 5.6 Unknown payload fields

Receivers MUST ignore payload fields that are not listed for the table in the
receiver's format version. They are not stored and not echoed. (BudgieMac
export files carry `bankText`; the same tolerance applies.)

A payload that is missing a listed field, or has a value of the wrong type, is
invalid; see section 8.7.

## 6. Envelope

One synced row version, in both directions:

```json
{
  "tbl": "transactions",
  "publicId": "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b",
  "hlc": "001795342530000:00000:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47",
  "deleted": false,
  "payload": {
    "publicId": "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b",
    "...": "..."
  }
}
```

| Field      | Type    | Rules                                                                                                                                                                                                                               |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tbl`      | string  | One of the ten `tbl` names in `tables.json`: `accounts`, `categories`, `envelopes`, `transactions`, `account_reconciliations`, `scheduled_transactions`, `payees`, `envelope_categories`, `budget_allocations`, `budget_transfers`. |
| `publicId` | string  | Canonical lowercase UUID (section 3.1).                                                                                                                                                                                             |
| `hlc`      | string  | Section 7.1 format.                                                                                                                                                                                                                 |
| `deleted`  | boolean | Whether this version is a deletion (section 5.5).                                                                                                                                                                                   |
| `payload`  | object  | The full row (section 5). Never `null`.                                                                                                                                                                                             |

The server validates `tbl`, `publicId`, `hlc` and `deleted`, and checks that
`payload` is a JSON object. It does not look inside `payload`. It stores the
payload and returns it to other devices unchanged (as an equivalent JSON
value; byte-identical text is not promised to clients).

## 7. Hybrid logical clock (HLC)

Every synced row carries an HLC, stamped by the device that wrote that version.
It orders versions of the same row across devices.

### 7.1 Format

```
<wall>:<counter>:<deviceId>
001795342530000:00000:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47
```

- `wall`: milliseconds since the Unix epoch, UTC, as exactly 15 decimal
  digits, zero-padded.
- `counter`: exactly 5 decimal digits, zero-padded, `00000` to `99999`.
- `deviceId`: the stamping device's id (section 3.2), canonical lowercase UUID.
- Total length 58. Regular expression:

```
^[0-9]{15}:[0-9]{5}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

### 7.2 Comparison

Compare two HLCs as plain strings, character by character by code point
(ASCII order; SQLite `BINARY` collation; Swift `String` `<` on these ASCII
strings). Because the parts are fixed width, this equals comparing the tuple
`(wall, counter, deviceId)`. Two HLCs are equal only if all three parts are.

A row with no HLC (never sealed, never synced) is older than any HLC.

### 7.3 Seal rule

A row is **sealed** when it is given a new HLC for a local change. Rows are
sealed lazily, just before they are pushed or compared (section 10.1), not on
every edit. Sealing changes only the HLC; it is not itself an edit.

Inputs: the row's current HLC `h` (may be absent), the device's own id `D`,
and `edit`, the wall time in milliseconds of the row's latest local edit.

`edit` is found the same way on every client:

1. Web: the row's `updatedAt` parsed as UTC (second resolution, so a multiple
   of 1000). BudgieMac, whose `updatedAt` is unreliable, uses instead the
   clock reading it recorded when it noticed the edit, in milliseconds.
2. If that gives no value (`updatedAt` is `null` or not in the `timestamp`
   format of section 5.1, or no edit time was recorded), `edit` is the
   current clock reading, in milliseconds, at the moment of sealing.
3. Edits made by the engine itself (section 8.10) set `updatedAt` to the
   current clock truncated to the second, and `edit` is that value on every
   client.
4. A portable import (or any bulk replacement of local data) while sync is on
   is a local edit of every row it writes or deletes, made at the moment of
   the import: `edit` is the clock reading at the import, in milliseconds,
   not the row's `updatedAt` from the package. The client seals these rows
   as part of the import. Otherwise an old backup would lose to an edit made
   on another device that this device has not pulled yet.

Then:

```
fromEdit  = (edit, 0, D)
increment = absent if h is absent;
            otherwise (h.wall, h.counter + 1, D),
            or (h.wall + 1, 0, D) if h.counter is 99999
newHlc    = the larger of fromEdit and increment
```

`newHlc` is always greater than `h`, so an edit made after a remote version was
applied always beats that version, even on a device whose clock is behind.
`updatedAt` has second resolution; the counter and device id break ties.

Examples, with `A = 3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47` (this device) and
`B = 9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50`:

| Row's current `hlc`       | Edit (`updatedAt`)    | New `hlc`                 | Why                    |
| ------------------------- | --------------------- | ------------------------- | ---------------------- |
| none                      | `2026-11-22 10:15:30` | `001795342530000:00000:A` | from edit              |
| `001795342530000:00000:A` | `2026-11-22 10:15:30` | `001795342530000:00001:A` | same second: increment |
| `001795342800000:00003:B` | `2026-11-22 10:16:00` | `001795342800000:00004:A` | B's clock was ahead    |
| `001795342500000:00002:B` | `2026-11-22 10:20:00` | `001795342800000:00000:A` | from edit              |
| `001795342530000:99999:A` | `2026-11-22 10:15:30` | `001795342530001:00000:A` | counter full           |

(`A` and `B` in the table stand for the full UUIDs.)

### 7.4 Drift limit

The server rejects an envelope whose HLC wall time is more than **5 minutes
(300,000 ms) ahead** of the server's clock at the time of the request:
`wall > serverNowMs + 300000` → reason `drift`. Clocks that are behind are not
rejected (they simply lose conflicts; see the risks in the plan).

A drift-rejected row stays dirty on the client and is pushed again next cycle
with the same HLC (it is not re-sealed unless edited again), so it is accepted
once the server clock catches up or the device clock is fixed.

## 8. Merge and apply

### 8.1 Pure last-write-wins

For each `(tbl, publicId)` the version with the highest HLC wins, whole row.
`deleted` is just another field:

- a delete with a higher HLC beats an earlier edit;
- an undelete (`deleted: false`) with a higher HLC beats an earlier delete, and
  the row comes back with the undelete's payload;
- there is no rule that tombstones win.

The same rule runs in two places:

- **Server:** an envelope is stored only if its HLC is greater than the stored
  one for that key (or none is stored) and it passes the drift check.
  Otherwise it is rejected as `stale` (lower or equal HLC) or `drift`.
- **Client apply:** an incoming envelope is applied only if its HLC is greater
  than the local row's HLC. Equal or lower: skipped, local row untouched.

Example, one row, three versions in arrival order at the server:

| Push                         | Stored before | Result                 |
| ---------------------------- | ------------- | ---------------------- |
| edit, `...30000:00000:A`     | none          | stored                 |
| delete, `...45000:00000:B`   | edit A        | stored, row deleted    |
| undelete, `...60000:00000:A` | delete B      | stored, row live again |
| edit, `...50000:00000:B`     | undelete A    | rejected `stale`       |

### 8.2 Applying one envelope (client)

Given an incoming envelope `e` and the local row `r` with the same
`(tbl, publicId)`, inside the apply transaction (section 10.3):

1. If `r` has a local edit that is not yet sealed, seal it first (section 7.3)
   and record that it was sealed.
2. If `r` exists and `r.hlc >= e.hlc`: skip.
3. Otherwise write the payload's fields (section 5) over `r`, or insert a new
   row; normalise the delete fields (section 5.5); keep local-only data
   (section 5.4); set the row's HLC to `e.hlc`; mark the row **not dirty**.
   This write is not a local edit: it MUST NOT mark the row dirty or change its
   `updatedAt` from the payload's value.
4. For `payees`, `envelope_categories` and `budget_allocations`, step 3 is
   subject to the natural-key rules of section 8.10.

### 8.3 Dirty and sealed state (client)

Each client tracks, per row, enough to answer:

- **dirty:** the row holds a local version the server has not acknowledged;
- **unsealed:** the row was edited locally after its HLC was last stamped.

How a client stores this is its own business. The rules it MUST follow:

- a local insert, update or delete makes the row dirty and unsealed;
- sealing makes it sealed (still dirty);
- an applied remote version makes it clean and sealed;
- an acknowledgement (section 10.4) clears dirty only if the row's HLC still
  equals the HLC that was pushed **and** it has not been edited since that
  seal. An edit made while a push was in flight keeps the row dirty.

### 8.4 Table apply order

Apply a pull table by table in this order (`applyOrder` in `tables.json`), so
every referenced row is present before the rows that reference it:

1. `accounts`
2. `categories`
3. `envelopes`
4. `transactions`
5. `account_reconciliations`
6. `scheduled_transactions`
7. `payees`
8. `envelope_categories`
9. `budget_allocations`
10. `budget_transfers`

Within a table the order does not matter. A client that hard-deletes rows MAY
process deletions in reverse order.

Clients SHOULD also push in this order (section 10.2).

### 8.5 Second pass: category parents and transfer links

Two references can point within their own table, so they cannot be resolved
row by row in the first pass:

- `categories.parentPublicId`
- `transactions.transferTransactionPublicId`

Pass 1 applies every row of every table, leaving these two fields unresolved
on rows it writes. Pass 2, still in the same transaction, sets them on every
row written in pass 1, resolving the public id against the local table (which
now holds the pulled rows). Rows skipped in pass 1 are not touched.

### 8.6 Resolving references

A reference resolves if the local table holds a row with that public id,
deleted or not, after pass 1. Every non-null reference in an applied payload
MUST resolve. If one does not, the apply fails with the error
`missing_reference` (naming table, public id and field): the whole apply
transaction is rolled back, the cursor is not advanced, and the next cycle
retries. A client MUST NOT write a link to a missing row, and MUST NOT
silently replace it with `null`.

A missing reference is normally transient (a parent pushed in a later chunk by
another device), which is why pushes follow the apply order.

### 8.7 Invalid envelopes in a pull

An envelope with an unknown `tbl`, an HLC that does not match section 7.1, a
payload missing a listed field, or a value of the wrong type or outside its
enum, fails the apply with the error `invalid_envelope`, handled like
`missing_reference`. These should never occur between two apps on the same
format version; they indicate a bug and need a fixture.

### 8.8 Transfer pairs

A transfer is two `transactions` rows whose `transferTransactionPublicId`
point at each other.

- Both legs are sealed and pushed in the same request (never split across push
  chunks).
- After apply, if one leg is deleted and the other is live, the client deletes
  the live leg as a local edit (dirty, sealed and pushed by the next round of
  the cycle).

### 8.9 Deterministic ids for auto-posted transactions

When a device auto-posts an occurrence of a scheduled transaction, the posted
transaction's public id is computed, not random. Two devices that post the
same occurrence offline then create the same row, and last-write-wins merges
them into one.

**Inputs**

| Input              | Value                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schedulePublicId` | The `scheduled_transactions` row's public id, canonical lowercase UUID (section 3.1).                                                                                                            |
| `dueDate`          | The occurrence's due date, `YYYY-MM-DD`, a real calendar date. This is the `nextDueDate` the occurrence was posted for, which is also the posted transaction's `date`.                           |
| `leg`              | `account` for the transaction on the schedule's `accountPublicId` (every auto-posted occurrence has one); `transfer` for the second leg of a scheduled transfer, on `transferToAccountPublicId`. |

Any other input is refused with an error. A schedule whose public id is not
yet a canonical UUID (an app that has never run Start, section 11.1) posts
with an ordinary random id instead; such rows are rewritten by Start like any
other.

Before creating an auto-posted transaction, the client looks up the computed
id. If a row with that id already exists locally, live or deleted, the
occurrence has already been posted (here or on another device): the client
MUST NOT create or change it, and only advances the schedule's `nextDueDate`.

**Algorithm**

1. Build the ASCII string

   ```
   budgie:auto-post:v1:<schedulePublicId>:<dueDate>:<leg>
   ```

   with no spaces, no trailing newline, and the inputs exactly as above.
   Example: `budgie:auto-post:v1:2f6d8c1a-4b3e-4d5f-9a7b-8c9d0e1f2a3b:2026-11-22:account`.

2. Hash its UTF-8 bytes (all ASCII) with SHA-256, giving 32 bytes.
3. Keep the first 16 bytes, `b[0]` to `b[15]`.
4. Set the version: `b[6] = (b[6] & 0x0F) | 0x80` (UUID version 8).
5. Set the variant: `b[8] = (b[8] & 0x3F) | 0x80` (RFC 9562 variant `10`).
6. Write the 16 bytes as lowercase hex in the `8-4-4-4-12` form.

For the example input, SHA-256 is
`7551869f10e3da7bcc3967d1541af2e30bee66050a2fda2c24386c4b3dd2a488` and the id
is `7551869f-10e3-8a7b-8c39-67d1541af2e3`.

The result is a canonical UUID (section 3.1), always version 8, and the two
legs of one transfer occurrence always differ. In Swift this is
`SHA256.hash(data: Data(input.utf8))` from CryptoKit, then the same two bit
operations; in TypeScript, `crypto.subtle.digest("SHA-256", ...)`.

**Vectors.** `fixtures/ids.json` holds valid vectors (inputs, the exact input
string, its SHA-256 in hex, and the id) and invalid inputs that must be
refused. Both engines run all of them.

**Notes**

- The id is used when the transaction is first created. Editing the posted
  transaction later (amount, date, anything) keeps its id.
- The two legs of a scheduled transfer link to each other by
  `transferTransactionPublicId` as usual (section 8.8).
- If a user deletes an auto-posted transaction and another device later posts
  the same occurrence, the other device's insert has the same public id. Which
  version survives is ordinary last-write-wins on that row (section 8.1).
- Changing the input string, hash or bit layout is a format version bump
  (section 4). The `v1` in the input string names this version of the
  function, not the format version.

### 8.10 Natural-key collisions

Three tables have a **natural key**: a combination of fields that at most one
live row may hold (`naturalKeys` in `tables.json`).

| Table                 | Natural key                 | Content fields (copied by rule 3) |
| --------------------- | --------------------------- | --------------------------------- |
| `payees`              | `name`                      | `categoryPublicId`, `amount`      |
| `envelope_categories` | `categoryPublicId`          | `envelopePublicId`                |
| `budget_allocations`  | `(envelopePublicId, month)` | `assigned`                        |

Two devices can create rows with different public ids and the same key while
offline. The server knows nothing about natural keys: it stores both by pure
last-write-wins (section 8.1). Each client resolves the collision when it
applies a pull, by these rules:

1. **Deleted rows never hold a natural key.** Only live rows (`deletedAt` is
   `null`) can collide. A deleted row keeps its own key fields in its payload.
2. **The lowest public id keeps the key.** Among the live rows claiming one
   key, the row whose `publicId` is lowest (string order) is the **winner**.
   This choice does not depend on clocks or on which versions a device has
   seen, so the winner can only change if a user deletes it.
3. **The newest content wins.** The live claimant with the highest HLC (ties:
   lowest public id) is the **source**. If the source is not the winner, the
   winner's content fields (table above) are set from the source.
4. **Every other claimant is deleted.** Each loser becomes a deleted version
   of its own public id, which is pushed like any other local change. The
   server ends up holding a deleted version of every losing public id.

**Procedure.** For each of the three tables, after deciding by
last-write-wins which incoming envelopes apply (section 8.2), group the live
rows that will exist by key: local live rows that are not being overwritten,
plus incoming live versions that apply. Resolve each group of two or more as
one set (not pairwise, which would depend on order):

- The loser's payload is its own payload with `deletedAt` and `updatedAt` set
  to the current clock as a `timestamp` (section 5.1).
- The winner, if its content changes, gets the source's content fields and
  `updatedAt` set the same way. Its other fields, including `createdAt` and
  the key, are its own.
- These are **engine edits**: the rows become dirty, and are sealed at once
  in the apply transaction (section 7.3, with `edit` = the new `updatedAt`).
  They are pushed by the next round of the cycle (section 10.5).
- A winner whose content does not change is stored as applied (clean, if it
  was incoming) or left as it was (if it was local).
- All claimants are sealed before they are compared (section 8.2 step 1).

The losing row is always deleted and pushed, whether or not it was ever
pushed before: the server may receive the delete of a public id it has not
seen, which is harmless.

**Storage.** A client whose local uniqueness rule also covers deleted rows
MUST store a deleted row that would block a key somewhere else, keeping its
HLC, payload and dirty state (a tombstone store). Applying a pull therefore
never fails on a unique constraint:

- Budgie web keeps plain `UNIQUE` constraints on these tables (two of them
  are inline table constraints, which cannot be changed without rebuilding
  the table), so it needs such a store for deleted rows of these three
  tables. A row in the store is still a row of its table for every other
  rule: lookups by public id, last-write-wins, pushing, and undelete (an
  undelete moves it back into the table, or into collision resolution if a
  live row now holds the key).
- BudgieMac already keeps deleted rows only as tombstones, so its unique
  `Payee.name` holds live payees only. Before inserting or renaming a live
  row it MUST apply these rules itself, because SwiftData would otherwise
  merge the two objects silently.

Deleted rows are part of the local state and MUST be kept (in the table or
the store) with their latest version; engines MUST NOT drop them.

**References.** No synced table references `payees`,
`envelope_categories` or `budget_allocations` by public id (see
`references` in `tables.json`), so deleting a loser leaves every reference
valid. The content fields copied by rule 3 are references that already
resolved when the source was applied.

**On each device.**

| Where                           | What happens to the losing public id                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The device that resolves        | Stored as deleted, dirty; pushed next round.                                                                                                                                                                                                                                                           |
| The server                      | Stores the delete by last-write-wins, like any delete.                                                                                                                                                                                                                                                 |
| A third device                  | Pulls the delete and, if the winner changed, the winner's new version. If it still has the loser live when the winner arrives (the delete not yet pushed), it resolves the same collision itself with the same winner, and pushes its own delete; last-write-wins keeps one of the identical outcomes. |
| A joining device (section 11.2) | Its old rows are deleted before the pull, so they never collide; pulled deleted losers are stored as deleted.                                                                                                                                                                                          |

**Why this converges.** Assume users stop editing and every device keeps
syncing.

- Resolution only ever deletes rows that are not the lowest live public id
  for their key, so the lowest live claimant on the server is never deleted
  by resolution. Every resolution that is stored removes at least one live
  claimant on the server, so the number of live rows per key falls until it
  is one.
- A resolution can be undone only by a newer version of a loser, which comes
  from a user edit (excluded) or from a device that has not yet seen the
  delete, which then pulls it, sees the collision again, and repeats the same
  choice of winner.
- When no key has two live rows, no device makes engine edits, so the server
  stops changing. Every device then holds the server's latest version of
  every public id (section 10), so all devices have identical live rows and
  the same deleted state.

Different devices can pick different content sources while they have seen
different versions; the winner's final content is whichever of their engine
edits has the highest HLC. That is the same lost-update risk as any
concurrent edit of one row (plan section 12).

### 8.11 After apply (client, informative)

After each apply the web engine compares each account's reconciled total with
its latest `account_reconciliations` balance and reports mismatches as
"review reconciliation". Nothing is repaired automatically. This does not
change what goes on the wire.

## 9. Endpoints

| Method and path          | Auth   | Purpose                                        |
| ------------------------ | ------ | ---------------------------------------------- |
| `GET /v1/health`         | none   | Liveness and versions.                         |
| `POST /v1/enrol`         | none   | Exchange an invite or device code for a token. |
| `POST /v1/sync`          | bearer | Push changes, pull other devices' changes.     |
| `POST /v1/devices/code`  | bearer | Issue a short code to enrol another device.    |
| `GET /v1/devices`        | bearer | List the user's active devices.                |
| `DELETE /v1/devices/:id` | bearer | Revoke one of the user's devices (or itself).  |
| `DELETE /v1/data`        | bearer | Delete the user's cloud data.                  |

Every endpoint can also return `rate_limited`, `body_too_large`,
`server_error` and, where it touches the database, `daily_limit`. Bearer
endpoints can return `bad_token` and `revoked`. These are not repeated below.

### 9.1 `GET /v1/health`

Response `200`:

```json
{ "status": "ok", "formatVersion": 1, "contractVersion": "1" }
```

- `formatVersion`: the highest format version this server build knows.
- `contractVersion`: the contract version the server was built with
  (section 4.1), as a string.

### 9.2 `POST /v1/enrol`

Request:

```json
{ "code": "7KQ2-M9XD", "deviceName": "Mark's iPhone" }
```

- `code`: an invite or device code, normalised by the server (section 3.4).
- `deviceName`: 1 to 100 characters after trimming whitespace; shown in the
  device list.

Response `201`:

```json
{
  "deviceId": "3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47",
  "token": "q9bV0n4yG2kO8wJm3tXr7cLs1eHp5uAz6dFi0gNy4Bk",
  "hasData": false
}
```

- The token is shown once; only its hash is kept.
- `hasData`: `true` if the server holds at least one row (live or deleted) for
  this user. The app offers **Start** when `false` and **Join** when `true`
  (section 11).
- The code is consumed and the device created in one database batch; on any
  error nothing is created.

Errors: `400 bad_request` (missing or empty fields), `400 bad_code` (unknown,
used or expired code; the same response for all three), `429 rate_limited`.

### 9.3 `POST /v1/sync`

Request:

```json
{
  "formatVersion": 1,
  "cursor": "0",
  "push": [
    {
      "tbl": "accounts",
      "publicId": "0b8e5d7c-1a2b-4c3d-9e8f-7a6b5c4d3e2f",
      "hlc": "001795342530000:00000:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47",
      "deleted": false,
      "payload": {
        "publicId": "0b8e5d7c-1a2b-4c3d-9e8f-7a6b5c4d3e2f",
        "createdAt": "2026-11-01 08:00:00",
        "updatedAt": "2026-11-22 10:15:30",
        "deletedAt": null,
        "name": "Current account",
        "number": "12345678",
        "type": "bank",
        "balance": 1500,
        "currency": "GBP",
        "notes": null,
        "interestRate": null,
        "creditLimit": null,
        "deleted": false
      }
    }
  ]
}
```

- `formatVersion`: integer ≥ 1, the client's format version.
- `cursor`: the cursor from the previous response, or `"0"` to start from the
  beginning. Opaque to clients: store it and send it back unchanged.
- `push`: 0 to 500 envelopes. No two with the same `(tbl, publicId)`.

Response `200`:

```json
{
  "formatVersion": 1,
  "cursor": "1:42",
  "more": false,
  "pull": [
    {
      "tbl": "payees",
      "publicId": "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
      "hlc": "001795342480000:00000:9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50",
      "deleted": false,
      "payload": {
        "publicId": "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
        "createdAt": "2026-11-22 10:14:40",
        "updatedAt": "2026-11-22 10:14:40",
        "deletedAt": null,
        "name": "Tesco",
        "categoryPublicId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "amount": null
      }
    }
  ],
  "rejected": [
    {
      "tbl": "transactions",
      "publicId": "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b",
      "reason": "drift"
    }
  ]
}
```

Push semantics:

- Each pushed envelope is either stored or listed in `rejected`, never both.
- `rejected[].reason`:
  - `stale`: the server already holds an equal or higher HLC for that key;
  - `drift`: the HLC wall time is more than 5 minutes ahead of server time.
- Rejecting one envelope does not affect the others. The push is otherwise
  atomic with the rest of the request.
- Every envelope stored by one request gets the same new sequence number,
  higher than any earlier one for the user.

Pull semantics:

- `pull` holds stored entries **after** the request's cursor that were last
  written by **other** devices, in server order. The caller's own writes are
  never returned. Each entry is the current (newest) version of its row.
- `more` is `true` when further entries exist after the returned cursor. The
  client then sends another request with the returned cursor (and its next
  push chunk, or an empty push).
- Repeating with returned cursors yields every row changed by other devices
  exactly once per change, including when many rows share a sequence number
  and when rows change between pages (a row rewritten later simply appears
  again further on, with its newer version).
- Cursor `"0"` returns the user's whole data set (all tables, deleted rows
  included), minus the caller's own writes.
- The page size is chosen by the server (default 500 entries). Clients MUST
  NOT assume a size.
- `formatVersion` is the highest format version any of this user's devices has
  sent (section 4).

Errors:

| Status | `error`              | When                                                                                                      |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------- |
| 400    | `bad_request`        | Schema violation, malformed envelope, duplicate `(tbl, publicId)` in `push`, unknown or malformed cursor. |
| 401    | `bad_token`          | Missing or unknown token.                                                                                 |
| 401    | `revoked`            | Device revoked.                                                                                           |
| 409    | `format_too_old`     | `formatVersion` lower than the user's highest. Body also has `"formatVersion": <highest>`.                |
| 409    | `data_reset`         | Cursor issued before the user's cloud data was deleted.                                                   |
| 413    | `body_too_large`     | Body over 1 MiB.                                                                                          |
| 413    | `too_many_envelopes` | More than 500 envelopes in `push`.                                                                        |
| 429    | `rate_limited`       | Rate limit.                                                                                               |
| 503    | `daily_limit`        | D1 daily limit reached; retry after 00:00 UTC.                                                            |
| 500    | `server_error`       | Anything else. Nothing was written.                                                                       |

On any error status nothing from the request was stored.

### 9.4 `POST /v1/devices/code`

Request: `{}` (or no body).

Response `201`:

```json
{ "code": "7KQ2-M9XD", "expiresAt": "2026-11-22T10:25:00.000Z" }
```

Valid for 10 minutes, single use, stored hashed. The new app enters it in
`POST /v1/enrol` and is enrolled for the same user. Issuing a code does not
invalidate earlier unexpired codes.

Errors: `401 bad_token`, `401 revoked` (a revoked device cannot issue codes),
`429 rate_limited` (per user).

### 9.5 `GET /v1/devices`

Response `200`, active (non-revoked) devices of the caller's user, oldest
first:

```json
{
  "devices": [
    {
      "id": "9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50",
      "name": "MacBook Air",
      "createdAt": "2026-11-20T18:02:11.000Z",
      "lastSeenAt": "2026-11-22T09:58:00.000Z",
      "current": false
    },
    {
      "id": "3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47",
      "name": "Mark's iPhone",
      "createdAt": "2026-11-22T10:10:03.000Z",
      "lastSeenAt": "2026-11-22T10:15:31.000Z",
      "current": true
    }
  ]
}
```

- `lastSeenAt`: time of the device's last authenticated request, accurate to
  within an hour; `null` if it has made none since enrolling.
- `current`: `true` for the device making the request.

Errors: `401 bad_token`, `401 revoked`.

### 9.6 `DELETE /v1/devices/:id`

Revokes the device `:id` if it is an active device of the caller's user. A
device may revoke itself ("Sign out this device"). The token stops working
immediately.

Response `204`, no body.

Errors: `404 not_found` if `:id` is not an active device of the caller's user
(unknown, another user's, or already revoked; the same response for all),
`400 bad_request` if `:id` is not a UUID.

### 9.7 `DELETE /v1/data`

Deletes the caller's user's cloud data: every stored row and every R2
snapshot. The user and devices remain; tokens keep working.

Response `200`:

```json
{ "deletedRows": 1834, "deletedSnapshots": 12, "timeTravelRetentionDays": 7 }
```

- Cloudflare D1 Time Travel may still hold the deleted rows for up to
  `timeTravelRetentionDays` days. The app says so.
- Every cursor issued before this call becomes invalid: a sync request with
  such a cursor returns `409 data_reset`. Cursor `"0"` remains valid, so any
  device can then run Start (section 11.1).
- The per-user sequence number is not reset; it stays monotonic.

## 10. The client sync cycle

### 10.1 Seal

Seal every dirty, unsealed row (section 7.3). Encode each dirty row as an
envelope: `tbl`, `publicId`, `hlc`, `deleted` from the row's delete state, and
the payload of section 5.

### 10.2 Push and pull

- Split the envelopes into chunks of at most 500 that also fit the 1 MiB body
  cap. Order envelopes by table apply order (section 8.4); within
  `categories`, parents before children. Keep both legs of a transfer in the
  same chunk.
- Send one request per chunk, each with the cursor returned by the previous
  response (the stored cursor for the first). Then keep sending requests with
  an empty push while `more` is `true`.
- Buffer every pulled envelope in memory; do not apply yet. If the same
  `(tbl, publicId)` appears more than once, keep the highest HLC.
- Record, per pushed envelope, whether it was stored or rejected and why.
- If any response's `formatVersion` is higher than the client's, stop: apply
  nothing, keep the stored cursor, status "update needed" (section 4).

### 10.3 Apply

In one local transaction:

1. Apply the buffered pull: pass 1 in table order, then pass 2
   (sections 8.2 to 8.6).
2. Acknowledge pushes (section 10.4).
3. Store the last response's cursor.

If anything fails, roll back the whole transaction. The stored cursor stays
where it was; dirty rows stay dirty; the next cycle repeats the work.
Applying an envelope twice is harmless (the second time is skipped as equal).

### 10.4 Acknowledge

For each pushed envelope:

| Outcome          | Action                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| stored           | clear dirty, subject to section 8.3 (HLC unchanged and no edit since the seal)                          |
| rejected `stale` | same as stored. The server holds this version (a retried push) or a newer one, which arrives in a pull. |
| rejected `drift` | keep dirty; status "clock ahead"; retried next cycle                                                    |

### 10.5 Repeat and finish

- Run the transfer-pair rule (section 8.8). If it, or edits made during the
  cycle, left rows dirty, run the cycle again (at most a few rounds).
- Run the after-apply checks (section 8.11).
- Report counts per table of rows applied and pushed.

### 10.6 Error handling

| Condition                                                 | Client behaviour                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Network failure, timeout                                  | Status "offline". Nothing applied. Retry later.                                                                                          |
| `500 server_error`                                        | Status "error". Retry with backoff.                                                                                                      |
| `429 rate_limited`, `503 daily_limit`                     | Status "error" with the reason. Retry after `retryAfter`.                                                                                |
| `401 bad_token`, `401 revoked`                            | Stop syncing; status "disconnected". Keep local data. Re-enrol needs a new code.                                                         |
| `409 format_too_old`, newer `formatVersion` in a response | Stop syncing; status "update needed". Keep local data.                                                                                   |
| `409 data_reset`                                          | Stop syncing; status "cloud data deleted". Keep local data and token. The user can Start (or Join, if another device has started since). |
| `413` errors                                              | A client bug (chunking). Status "error".                                                                                                 |
| `400 bad_request`                                         | A client bug. Status "error". Dirty rows stay dirty.                                                                                     |
| Apply error (`missing_reference`, `invalid_envelope`)     | Status "error". Cursor unchanged. Retry next cycle.                                                                                      |

A failure part-way through a multi-request cycle leaves rows already stored on
the server stored. They are pushed again next cycle (they are still dirty) and
come back as `stale`, which acknowledges them.

## 11. Enrolment and lifecycle flows

Nothing is sent to the server before the user has accepted the app's consent
screen.

### 11.1 Start (first app for a user, or after Delete my cloud data)

1. Enrol with an invite code (or, after a data reset, use the existing token).
   Start is only allowed when the server has no data for the user: `hasData`
   is `false` from enrol, or, with an existing token, a sync with cursor `"0"`
   and an empty push returns no rows and `more: false`. That probe never
   returns the caller's own writes (section 9.3), so it shows only whether
   another device has data; a device that already pushed must not use it to
   decide the server is empty. A client that has not started has no cursor
   at all (not `"0"`) and MUST NOT run a sync cycle until Start or Join has
   set one.
2. In one local transaction, rewrite every public id that is not a canonical
   lowercase UUID (section 3.1) to a fresh random UUID, keeping every foreign
   key and transfer link intact, and mark every row in the ten tables dirty and
   unsealed (deleted rows too).
3. Set the cursor to `"0"` and run sync cycles until no dirty rows remain. An
   interrupted upload resumes on the next cycle.

### 11.2 Join (a later app)

1. Enrol with an invite (when all devices were lost) or a device code from an
   enrolled app; `hasData` is `true`.
2. Offer a portable export ("Download backup") first.
3. Mark all local rows deleted **without** making them dirty, and clear their
   HLCs, so that every pulled version wins (section 7.2). Nothing from the
   joining app's old data is ever pushed. Rows whose natural key matches a
   pulled row are handled by section 8.10.
4. Set the cursor to `"0"`, pull everything, apply. Remap account shortcuts by
   public id and drop those that do not resolve.

If the join fails, the app's data is left as it was before step 3.

### 11.3 Add a device

On an enrolled app, `POST /v1/devices/code` and show the code and its expiry.
The new app enrols with it (section 9.2) and then Joins.

### 11.4 Disable, sign out, delete

- **Disable on this device:** stop syncing. Keep local data, the token and the
  cursor. Turning sync back on needs no code.
- **Sign out this device:** `DELETE /v1/devices/<own id>`, then forget the
  token and cursor. Local data stays. Turning sync on again needs a new code.
- **Delete my cloud data:** `DELETE /v1/data`, then disable sync on this
  device. Other devices get `409 data_reset` on their next sync.

## 12. Server storage (informative for clients)

This section guides the server implementation; clients MUST NOT depend on it.

Tables (D1, SQLite):

```sql
users(id, name, seq, max_format_version, data_epoch, created_at)
devices(id, user_id, name, token_hash, created_at, last_seen_at, revoked_at)
enrol_codes(code_hash, user_id, kind, expires_at, used_at, created_at)
changes(user_id, tbl, public_id, hlc, deleted, payload, device_id, seq,
        PRIMARY KEY (user_id, tbl, public_id)) WITHOUT ROWID
-- index on changes (user_id, seq, tbl, public_id)
```

`max_format_version`, `data_epoch`, `last_seen_at` and `enrol_codes` are
additions to the plan's table list that this contract needs (section 13).
Column names and types are the server's choice.

**Cursor encoding.** `"0"` is the start. Otherwise a cursor is
`"<data_epoch>:<seq>"` (every entry with sequence ≤ `seq` has been seen) or
`"<data_epoch>:<seq>:<tbl>:<public_id>"` (every entry ordered at or before
`(seq, tbl, public_id)` has been seen). Pulls are ordered by
`(seq, tbl, public_id)` ascending. A cursor whose epoch differs from the
user's current `data_epoch` returns `409 data_reset`.

**One sync request** = an authentication read (token hash → user, device,
revoked, `max_format_version`, `data_epoch`), the pre-batch checks, then one D1
`batch()` of four statements:

1. bump `users.seq` (and raise `max_format_version` to the request's value if
   higher);
2. upsert the pushed envelopes from `json_each` over one JSON parameter, only
   where the incoming `hlc` is greater than the stored one and its wall time is
   at most `now + 300000` ms, `RETURNING` the stored keys;
3. select the next page after the cursor where `device_id` is not the caller,
   ordered by `(seq, tbl, public_id)`, fetching page size + 1 to compute
   `more`;
4. read back `users.seq` and `max_format_version`.

`rejected` is the pushed keys minus the stored ones, computed in the Worker:
`drift` if the wall time is too far ahead, otherwise `stale`. When `more` is
`true` the response cursor is the last returned entry's
`(data_epoch, seq, tbl, public_id)`; otherwise it is `(data_epoch, users.seq)`
from statement 4.

**Snapshots** (daily, R2, `snapshots/<user>/<date>.json`): a portable data
package, format 1, whose collections are the stored payloads grouped by
`tables.json`'s `collection` name, with `pendingReconcileBalance` and
`pendingReconcileDate` added as `null` to accounts, `preferences: {}`, a
manifest and a checksum. Deleted rows are included with their `deletedAt`.

## 13. Choices made where the plan was silent

These were decided while writing this contract and are open to review.

1. **Full payload on deletes.** `payload` is never `null`; a delete carries the
   whole row with `deletedAt` set. BudgieMac's tombstones must keep the last
   payload. This keeps references closed on the server and keeps snapshots
   importable.
2. **Envelope `deleted` is authoritative** over `payload.deletedAt` and the
   legacy `deleted` flag on accounts and categories (section 5.5).
3. **HLC widths:** 15-digit wall, 5-digit counter, device UUID; counter
   overflow carries into the wall.
4. **Seal inputs for BudgieMac:** the recorded edit time instead of
   `updatedAt`.
5. **Dirty versus unsealed** are separate states (section 8.3), so an edit
   made while a push is in flight is not acknowledged away.
6. **`stale` acknowledges** the pushed row.
7. **Missing references fail the apply** and are retried; never written as
   `null`.
8. **Server-side `format_too_old`** refusal in addition to the client guard,
   with the user's highest format version stored on the server.
9. **`data_reset`**: `DELETE /v1/data` bumps a per-user data epoch carried in
   the cursor, so other devices stop instead of re-uploading partial data.
10. **Malformed pushes are refused whole** with `400 bad_request`; the only
    per-envelope rejection reasons are `stale` and `drift`.
11. **Cursor `"0"`** as the starting value; cursor text encoding in section 12.
12. **Codes:** Crockford base32, 12 characters for invites, 8 for device
    codes, server-side normalisation; invite lifetime configurable (default 7
    days).
13. **Tokens:** base64url of 32 random bytes; SHA-256 hex stored.
14. **`lastSeenAt`** in the device list, updated at most hourly.
15. **Revoking** an unknown, foreign or already revoked device returns the
    same `404`.
16. **Error body** `{ error, message, retryAfter? }` and the code list in
    section 2.4; `daily_limit` as `503`, `rate_limited` as `429`.
17. **Timestamps** in payloads are the SQLite `YYYY-MM-DD HH:MM:SS` UTC form;
    API metadata timestamps are ISO 8601.
18. **Start with an existing token** (after a data reset) checks emptiness with
    a cursor-`"0"` sync instead of a new endpoint.
19. **Contract version** stays `1` until BudgieMac first copies the contract,
    then goes up by one on every merged change under `contract/` (section 4.1).
20. **Auto-post ids** are UUID version 8 from SHA-256 over
    `budgie:auto-post:v1:<schedule>:<date>:<leg>`, with legs `account` and
    `transfer`; schedules without a canonical id post with random ids; an
    existing row with the computed id (live or deleted) is never recreated
    (section 8.9).
21. **Natural-key collisions** (section 8.10) replace the plan's proposal
    ("higher HLC keeps the key; the local row is re-keyed to the winner"):
    the lowest public id keeps the key, the highest HLC supplies the content,
    every other claimant is deleted and pushed, and deleted rows never hold a
    key. A clock-based winner could make two devices delete different rows
    and leave no live row; a public-id winner cannot.
