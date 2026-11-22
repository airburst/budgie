// Build-time sync server setting (SY-036). `VITE_SYNC_SERVER_URL` names the
// sync server; unset means the app has no sync origin at all: the CSP does not
// mention one and nothing can reach a server. The URL is never hard-coded.
// Parsing is shared with `vite.config.ts` via `vite.sync-origin.ts`.

import { parseSyncServerUrl } from "../../../vite.sync-origin";

export {
  parseSyncServerUrl,
  syncConnectOrigin,
} from "../../../vite.sync-origin";

/** The configured sync server base URL, or null when sync has no origin. */
export const SYNC_SERVER_URL: string | null = parseSyncServerUrl(
  import.meta.env.VITE_SYNC_SERVER_URL,
);
