import { createPlatform } from "@/platform/platform";
import { describe, expect, it } from "vitest";

describe("platform capabilities", () => {
  it("exposes Electron capabilities from injected environment state", () => {
    expect(
      createPlatform({
        electron: true,
        touch: false,
        persistentStorage: false,
        pwaInstallation: false,
      }),
    ).toEqual({
      target: "electron",
      capabilities: {
        nativeUpdates: true,
        filesystemBackups: true,
        pwaInstallation: false,
        persistentBrowserStorage: false,
        touchInput: false,
      },
    });
  });

  it("keeps web capabilities explicit and injectable", () => {
    expect(
      createPlatform({
        electron: false,
        touch: true,
        persistentStorage: true,
        pwaInstallation: true,
      }),
    ).toEqual({
      target: "web",
      capabilities: {
        nativeUpdates: false,
        filesystemBackups: false,
        pwaInstallation: true,
        persistentBrowserStorage: true,
        touchInput: true,
      },
    });
  });
});
