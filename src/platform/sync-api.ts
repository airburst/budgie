// Sync on platforms that cannot do it (Electron, SY-035). Electron is frozen:
// its preload has no sync channels, so `window.api` lacks the sync methods
// there. UI code calls `getSyncApi()` instead of reading them off `window.api`
// directly; on Electron it gets methods that all answer `unsupported`.

import type {
  SyncApi,
  SyncFailure,
  SyncStatusView,
} from "@/services/sync/api-types";

const unsupportedFailure: SyncFailure = {
  ok: false,
  reason: "unsupported",
  message: "Sync is not available on this platform",
  retryAfter: null,
};

const unsupportedStatus: SyncStatusView = {
  enabled: false,
  state: "disabled",
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  retryAfter: null,
  retryAt: null,
  supported: false,
  configured: false,
  consented: false,
  enrolled: false,
  started: false,
  reconciliationReview: [],
};

export const createUnsupportedSyncApi = (): SyncApi => {
  const refuse = () => Promise.resolve(unsupportedFailure);
  return {
    getSyncStatus: () => Promise.resolve(unsupportedStatus),
    enrolSync: refuse,
    startSync: refuse,
    joinSync: refuse,
    syncNow: refuse,
    disableSync: refuse,
    enableSync: refuse,
    signOutSync: refuse,
    deleteSyncCloudData: refuse,
    listSyncDevices: refuse,
    revokeSyncDevice: refuse,
    createSyncDeviceCode: refuse,
    onSyncChange: () => () => undefined,
  };
};

const unsupported = createUnsupportedSyncApi();

/** The sync methods of `api`, or the "unsupported" ones when it has none. */
export const getSyncApi = (
  api: Partial<SyncApi> | undefined = typeof window === "undefined"
    ? undefined
    : window.api,
): SyncApi => (api?.syncNow && api.getSyncStatus ? (api as SyncApi) : unsupported);
