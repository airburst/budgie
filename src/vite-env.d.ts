declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Sync server base URL (SY-036); unset means no sync origin. */
  readonly VITE_SYNC_SERVER_URL?: string;
}
