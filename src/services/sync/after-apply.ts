// The after-apply hooks the engine runs by default (SPEC.md 10.5 and 8.11).
// One place to register them; a caller can still pass its own list in
// `SyncEngineDeps.afterApply`.

import type { AfterApplyHook } from "@/services/sync/engine";
import { repairHalfDeletedTransfers } from "@/services/sync/transfers";

export const defaultAfterApplyHooks: readonly AfterApplyHook[] = [
  repairHalfDeletedTransfers,
];
