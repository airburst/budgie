// Pure parsing of the build-time sync server setting. Lives at the repo root
// (no `import.meta`, no app imports) so `vite.config.ts` and
// `scripts/verify-web-build.ts` can load it as well as the app
// (`src/services/sync/config.ts`).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate a raw setting. Empty or unset gives `null`. Otherwise the value
 * must be an https URL (http only for localhost) with no credentials, query
 * or fragment; it is returned without a trailing slash. Throws on anything
 * else so a bad build fails loudly rather than silently syncing nowhere.
 */
export const parseSyncServerUrl = (raw: string | undefined): string | null => {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_SYNC_SERVER_URL is not a valid URL: ${value}`);
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))
  )
    throw new Error(
      "VITE_SYNC_SERVER_URL must be https (http only for localhost)",
    );
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "VITE_SYNC_SERVER_URL must not have credentials, query or fragment",
    );
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
};

/** The origin a CSP `connect-src` needs for a parsed setting, or null. */
export const syncConnectOrigin = (url: string | null): string | null =>
  url === null ? null : new URL(url).origin;
