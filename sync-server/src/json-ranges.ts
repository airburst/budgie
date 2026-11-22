// Minimal scanner over text that is already known to be valid JSON. It finds
// where each value starts and ends, so the server can keep a payload exactly as
// the client sent it (SY-013: stored byte for byte) instead of re-serialising.

export interface Range {
  start: number;
  end: number;
}

function skipWs(text: string, i: number): number {
  while (i < text.length && " \t\n\r".includes(text[i] as string)) i++;
  return i;
}

function skipString(text: string, i: number): number {
  i++; // opening quote
  while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** End index (exclusive) of the value starting at `i`. */
export function skipValue(text: string, i: number): number {
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === "{" || c === "[") {
    const close = c === "{" ? "}" : "]";
    i = skipWs(text, i + 1);
    if (text[i] === close) return i + 1;
    for (;;) {
      if (c === "{") {
        i = skipString(text, skipWs(text, i));
        i = skipWs(text, i) + 1; // colon
      }
      i = skipWs(text, skipValue(text, skipWs(text, i)));
      if (text[i] === close) return i + 1;
      i = skipWs(text, i + 1); // comma
    }
  }
  while (i < text.length && !",}] \t\n\r".includes(text[i] as string)) i++;
  return i;
}

/** Member ranges of the object starting at `start`; the last duplicate key wins, like JSON.parse. */
export function objectMembers(text: string, start: number): Map<string, Range> {
  const members = new Map<string, Range>();
  let i = skipWs(text, start + 1);
  if (text[i] === "}") return members;
  for (;;) {
    i = skipWs(text, i);
    const keyEnd = skipString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd)) as string;
    i = skipWs(text, keyEnd) + 1; // colon
    i = skipWs(text, i);
    const end = skipValue(text, i);
    members.set(key, { start: i, end });
    i = skipWs(text, end);
    if (text[i] === "}") return members;
    i++; // comma
  }
}

/** Element ranges of the array starting at `start`. */
export function arrayElements(text: string, start: number): Range[] {
  const out: Range[] = [];
  let i = skipWs(text, start + 1);
  if (text[i] === "]") return out;
  for (;;) {
    i = skipWs(text, i);
    const end = skipValue(text, i);
    out.push({ start: i, end });
    i = skipWs(text, end);
    if (text[i] === "]") return out;
    i++; // comma
  }
}

/** The exact text of `push[n].payload` for every envelope in a sync request body. */
export function rawPushPayloads(text: string): string[] {
  const top = objectMembers(text, skipWs(text, 0));
  const push = top.get("push");
  if (!push) return [];
  return arrayElements(text, push.start).map((el) => {
    const payload = objectMembers(text, el.start).get("payload");
    if (!payload) throw new Error("payload missing");
    return text.slice(payload.start, payload.end);
  });
}
