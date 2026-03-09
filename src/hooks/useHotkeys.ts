import { useEffect, useRef } from "react";

export type Hotkey = {
  key: string;
  ctrl?: boolean;
  handler: () => void | Promise<void>;
};

export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      )
        return;

      for (const hk of ref.current) {
        const wantsCtrl = hk.ctrl ?? false;
        const hasCtrl = e.ctrlKey || e.metaKey;
        if (wantsCtrl !== hasCtrl) continue;
        if (e.key.toLowerCase() !== hk.key.toLowerCase()) continue;

        e.preventDefault();
        hk.handler();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
