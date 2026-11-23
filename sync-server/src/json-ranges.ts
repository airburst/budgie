// Minimal scanner over text that is already known to be valid JSON (it has
// been through JSON.parse). It finds where each value starts and ends, so the
// server can keep a payload exactly as the client sent it (SY-013: stored byte
// for byte) instead of re-serialising.
//
// Every loop advances through the text and stops at its end, and nesting is
// counted, not recursed, so no input can hang it or overflow the stack. Input
// that does not have the expected shape throws `ScanError`.

export interface Range {
  start: number;
  end: number;
}

export class ScanError extends Error {}

/** Deepest nesting allowed inside a payload (real payloads are flat objects). */
export const MAX_DEPTH = 32;

function skipWs(text: string, i: number): number {
  while (i < text.length && " \t\n\r".includes(text[i] as string)) i++;
  return i;
}

function skipString(text: string, i: number): number {
  if (text[i] !== '"') throw new ScanError("string expected");
  i++;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') return i + 1;
    i += c === "\\" ? 2 : 1;
  }
  throw new ScanError("unterminated string");
}

/** End index (exclusive) of the value starting at `i`. */
export function skipValue(
  text: string,
  i: number,
  maxDepth = MAX_DEPTH,
): number {
  if (i >= text.length) throw new ScanError("value expected");
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === "{" || c === "[") {
    let depth = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i = skipString(text, i);
        continue;
      }
      if (ch === "{" || ch === "[") {
        depth++;
        if (depth > maxDepth) throw new ScanError("nested too deeply");
      } else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    throw new ScanError("unterminated value");
  }
  const start = i;
  while (i < text.length && !",}] \t\n\r".includes(text[i] as string)) i++;
  if (i === start) throw new ScanError("value expected");
  return i;
}

/** Member ranges of the object starting at `start`; the last duplicate key wins, like JSON.parse. */
export function objectMembers(text: string, start: number): Map<string, Range> {
  const members = new Map<string, Range>();
  if (text[start] !== "{") throw new ScanError("object expected");
  let i = skipWs(text, start + 1);
  if (text[i] === "}") return members;
  while (i < text.length) {
    i = skipWs(text, i);
    const keyEnd = skipString(text, i);
    let key: string;
    try {
      key = JSON.parse(text.slice(i, keyEnd)) as string;
    } catch {
      throw new ScanError("bad key");
    }
    i = skipWs(text, keyEnd);
    if (text[i] !== ":") throw new ScanError("colon expected");
    i = skipWs(text, i + 1);
    const end = skipValue(text, i);
    members.set(key, { start: i, end });
    i = skipWs(text, end);
    if (text[i] === "}") return members;
    if (text[i] !== ",") throw new ScanError("comma expected");
    i++;
  }
  throw new ScanError("unterminated object");
}

/** Element ranges of the array starting at `start`. */
export function arrayElements(text: string, start: number): Range[] {
  const out: Range[] = [];
  if (text[start] !== "[") throw new ScanError("array expected");
  let i = skipWs(text, start + 1);
  if (text[i] === "]") return out;
  while (i < text.length) {
    i = skipWs(text, i);
    const end = skipValue(text, i, MAX_DEPTH + 2);
    out.push({ start: i, end });
    i = skipWs(text, end);
    if (text[i] === "]") return out;
    if (text[i] !== ",") throw new ScanError("comma expected");
    i++;
  }
  throw new ScanError("unterminated array");
}

/**
 * The exact text of `push[n].payload` for every envelope in a sync request body.
 * Throws ScanError if the body is not shaped like a sync request or a payload
 * nests deeper than MAX_DEPTH.
 */
export function rawPushPayloads(text: string): string[] {
  const top = objectMembers(text, skipWs(text, 0));
  const push = top.get("push");
  if (!push) return [];
  return arrayElements(text, push.start).map((el) => {
    const payload = objectMembers(text, el.start).get("payload");
    if (!payload) throw new ScanError("payload missing");
    if (text[payload.start] !== "{")
      throw new ScanError("payload not an object");
    return text.slice(payload.start, payload.end);
  });
}
