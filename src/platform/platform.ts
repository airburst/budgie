export type PlatformTarget = "electron" | "web";

export type PlatformCapabilities = {
  nativeUpdates: boolean;
  filesystemBackups: boolean;
  pwaInstallation: boolean;
  persistentBrowserStorage: boolean;
  touchInput: boolean;
};

export type Platform = {
  target: PlatformTarget;
  capabilities: PlatformCapabilities;
};

export type PlatformEnvironment = {
  electron: boolean;
  touch: boolean;
  persistentStorage: boolean;
  pwaInstallation: boolean;
};

export const createPlatform = (environment: PlatformEnvironment): Platform => {
  const target: PlatformTarget = environment.electron ? "electron" : "web";

  return {
    target,
    capabilities: {
      nativeUpdates: target === "electron",
      filesystemBackups: target === "electron",
      pwaInstallation: environment.pwaInstallation,
      persistentBrowserStorage: environment.persistentStorage,
      touchInput: environment.touch,
    },
  };
};

export const detectPlatformEnvironment = (): PlatformEnvironment => {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const navigatorObject =
    typeof navigator === "undefined" ? undefined : navigator;

  return {
    electron: Boolean(browserWindow?.api),
    touch: Boolean(
      navigatorObject?.maxTouchPoints && navigatorObject.maxTouchPoints > 0,
    ),
    persistentStorage: Boolean(navigatorObject?.storage?.persist),
    pwaInstallation: Boolean(
      browserWindow && "BeforeInstallPromptEvent" in browserWindow,
    ),
  };
};
