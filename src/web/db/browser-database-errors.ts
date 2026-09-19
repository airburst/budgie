export type BrowserDatabaseErrorCode =
  | "opfs-unavailable"
  | "private-browsing"
  | "quota"
  | "corruption"
  | "migration"
  | "worker"
  | "unknown";

export class BrowserDatabaseError extends Error {
  constructor(
    public readonly code: BrowserDatabaseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserDatabaseError";
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const classifyBrowserDatabaseError = (
  error: unknown,
  phase: "initialize" | "migration" | "worker" = "initialize",
): BrowserDatabaseError => {
  if (error instanceof BrowserDatabaseError) return error;

  const message = messageOf(error);
  const normalized = message.toLowerCase();
  let code: BrowserDatabaseErrorCode =
    phase === "migration"
      ? "migration"
      : phase === "worker"
        ? "worker"
        : "unknown";

  if (/quota|disk full|database or disk is full/.test(normalized)) {
    code = "quota";
  } else if (
    /private|incognito|not authorized|permission denied/.test(normalized)
  ) {
    code = "private-browsing";
  } else if (
    /opfs|origin private file system|sharedaccesshandle|vfs/.test(normalized)
  ) {
    code = "opfs-unavailable";
  } else if (
    /malformed|corrupt|not a database|database disk image/.test(normalized)
  ) {
    code = "corruption";
  }

  return new BrowserDatabaseError(code, message, { cause: error });
};
