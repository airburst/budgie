// Codes, tokens and hashes (SPEC section 3).

// Crockford base32 (SPEC 3.4): no I, L, O, U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const INVITE_CODE_LENGTH = 12;
export const DEVICE_CODE_LENGTH = 8;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A random code of `length` characters, shown in groups of four: `H4TW-8PZR-3N6C`. */
export function generateCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  // 256 is a multiple of 32, so `& 31` is unbiased.
  for (const b of bytes) out += ALPHABET[b & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

export const generateInviteCode = () => generateCode(INVITE_CODE_LENGTH);
export const generateDeviceCode = () => generateCode(DEVICE_CODE_LENGTH);

/** SPEC 3.4: uppercase, drop spaces and `-`, O to 0, I and L to 1. */
export function normaliseCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export async function hashCode(code: string): Promise<string> {
  return sha256Hex(normaliseCode(code));
}

/** SPEC 3.3: base64url of 32 random bytes (43 characters). */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const hashToken = sha256Hex;
