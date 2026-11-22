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

/**
 * Neither Start nor Join has run on this device (the stored cursor is NULL),
 * so its rows may still hold non-UUID public ids and must not be pushed.
 */
export class SyncNotStartedError extends Error {
  readonly code = "not_started";
  constructor() {
    super("Sync has not been started on this device: run Start or Join");
    this.name = "SyncNotStartedError";
  }
}

/**
 * A local row would go out as an envelope that breaks the contract (the same
 * check a receiver applies, SPEC.md 8.7). Nothing is pushed: other devices
 * would fail their apply on it forever.
 */
export class InvalidOutgoingEnvelopeError extends Error {
  readonly code = "invalid_outgoing_envelope";
  constructor(
    readonly table: string,
    readonly publicId: string | null,
    readonly problem: string,
  ) {
    super(`Cannot push ${table} ${publicId ?? "?"}: ${problem}`);
    this.name = "InvalidOutgoingEnvelopeError";
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
    /** The whole error body, e.g. `formatVersion` of `format_too_old`. */
    readonly body: Readonly<Record<string, unknown>> = {},
  ) {
    super(`Sync request failed: ${status} ${code}`);
    this.name = "SyncHttpError";
  }
}

/**
 * The request never got an answer (no network, DNS, TLS, timeout, refused
 * redirect): "offline" (SPEC.md 2.4). Nothing was applied.
 */
export class SyncNetworkError extends Error {
  readonly code = "network";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SyncNetworkError";
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
