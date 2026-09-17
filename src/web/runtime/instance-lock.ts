export type InstanceLock = {
  active: boolean;
  release: () => void;
};

type LockMessage = { type: "active" | "released" };

export const acquireInstanceLock = async (
  name = "budgie-active-instance",
): Promise<InstanceLock> => {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return { active: true, release: () => undefined };
  }

  const channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel("budgie-instance-lock");
  let releaseLock: (() => void) | undefined;
  let released = false;
  const lock = await navigator.locks.request(
    name,
    { ifAvailable: true },
    (held) => {
      if (!held) return false;
      return new Promise<boolean>((resolve) => {
        releaseLock = () => {
          released = true;
          resolve(true);
        };
      });
    },
  );

  if (lock === false) {
    channel?.close();
    return { active: false, release: () => undefined };
  }

  channel?.postMessage({ type: "active" } satisfies LockMessage);
  return {
    active: true,
    release: () => {
      if (released) return;
      channel?.postMessage({ type: "released" } satisfies LockMessage);
      channel?.close();
      releaseLock?.();
    },
  };
};
