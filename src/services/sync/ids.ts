// Deterministic public ids for auto-posted transactions (sync contract
// SPEC.md section 8.9). Two devices that post the same occurrence of a
// schedule produce the same id, so the rows merge into one.

/** Which transaction of an occurrence: the one on the schedule's account, or
 * the other leg of a scheduled transfer (on `transferToAccountPublicId`). */
export type AutoPostLeg = "account" | "transfer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isCalendarDate = (value: string) => {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** The exact string whose UTF-8 bytes are hashed. Throws on invalid input. */
export const autoPostIdInput = (
  schedulePublicId: string,
  dueDate: string,
  leg: AutoPostLeg,
): string => {
  if (!UUID.test(schedulePublicId)) {
    throw new Error(
      "Auto-post id: schedule public id is not a canonical lowercase UUID",
    );
  }
  if (!isCalendarDate(dueDate)) {
    throw new Error("Auto-post id: due date is not a YYYY-MM-DD calendar date");
  }
  if (leg !== "account" && leg !== "transfer") {
    throw new Error("Auto-post id: leg is not account or transfer");
  }
  return `budgie:auto-post:v1:${schedulePublicId}:${dueDate}:${leg}`;
};

/** SHA-256 of the input, first 16 bytes, UUID version 8 and RFC 9562 variant. */
export const autoPostTransactionId = async (
  schedulePublicId: string,
  dueDate: string,
  leg: AutoPostLeg,
): Promise<string> => {
  const input = autoPostIdInput(schedulePublicId, dueDate, leg);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
