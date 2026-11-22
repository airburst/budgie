// Typed errors thrown by the sync engine. A failed cycle rolls back its apply
// transaction and rethrows one of these (or the transport's own error);
// mapping them to a user-facing status is SY-033's job.

import { MissingReferenceError } from "@/services/portable-data";
import type { PortableTable } from "@/services/portable-data";

export { MissingReferenceError };

/** `sync_state` lacks the device id or token: the device is not enrolled. */
export class SyncNotConfiguredError extends Error {
  readonly code = "not_configured";
  constructor(missing: string) {
    super(`Sync is not configured: ${missing} is missing`);
    this.name = "SyncNotConfiguredError";
  }
}

/** A pulled envelope breaks SPEC.md section 8.7 (`invalid_envelope`). */
export class InvalidEnvelopeError extends Error {
  readonly code = "invalid_envelope";
  constructor(
    readonly table: string | null,
    readonly publicId: string | null,
    readonly problem: string,
  ) {
    super(
      `invalid_envelope: ${table ?? "?"} ${publicId ?? "?"}: ${problem}`,
    );
    this.name = "InvalidEnvelopeError";
  }
}

/**
 * A response carried a `formatVersion` above ours (SPEC.md section 4): nothing
 * was applied and the cursor was kept.
 */
export class FormatTooNewError extends Error {
  readonly code = "format_too_new";
  constructor(readonly serverFormatVersion: number) {
    super(`Server format version ${serverFormatVersion} is newer than ours`);
    this.name = "FormatTooNewError";
  }
}

/**
 * The server answered with an error body (SPEC.md section 2.4). Thrown by
 * transports; `code` is the contract's `error` string.
 */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter: number | null = null,
  ) {
    super(`Sync request failed: ${status} ${code}`);
    this.name = "SyncHttpError";
  }
}

/** One envelope alone exceeds the request body cap; it can never be pushed. */
export class EnvelopeTooLargeError extends Error {
  readonly code = "envelope_too_large";
  constructor(
    readonly table: PortableTable,
    readonly publicId: string,
    readonly bytes: number,
  ) {
    super(`${table} ${publicId} is ${bytes} bytes, over the request body cap`);
    this.name = "EnvelopeTooLargeError";
  }
}

/** The two apply errors of SPEC.md 10.6, by contract name. */
export const applyErrorCode = (
  error: unknown,
): "missing_reference" | "invalid_envelope" | null =>
  error instanceof MissingReferenceError
    ? "missing_reference"
    : error instanceof InvalidEnvelopeError
      ? "invalid_envelope"
      : null;
