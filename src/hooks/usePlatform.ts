import {
  createPlatform,
  detectPlatformEnvironment,
  type Platform,
} from "@/platform/platform";
import { useSyncExternalStore } from "react";

const platform = createPlatform(detectPlatformEnvironment());

const subscribe = () => () => undefined;
const getPlatform = (): Platform => platform;

export const usePlatform = (): Platform =>
  useSyncExternalStore(subscribe, getPlatform, getPlatform);

export { platform };
