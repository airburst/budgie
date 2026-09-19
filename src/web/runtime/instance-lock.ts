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
  let resolveAcquired: (active: boolean) => void = () => undefined;
  const acquired = new Promise<boolean>((resolve) => {
    resolveAcquired = resolve;
  });
  void navigator.locks.request(name, { ifAvailable: true }, (held) => {
    if (!held) {
      resolveAcquired(false);
      return false;
    }
    resolveAcquired(true);
    return new Promise<boolean>((resolve) => {
      releaseLock = () => {
        released = true;
        resolve(true);
      };
    });
  });

  if (!(await acquired)) {
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
