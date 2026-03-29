import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { usePreferences } from "@/hooks/usePreferences";
import type { AccountShortcut } from "@/types/electron";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Hard-coded global shortcuts from layout.tsx — shown as read-only
const SYSTEM_SHORTCUTS: Array<{
  key: string;
  ctrl: boolean;
  label: string;
  note?: string;
}> = [
  { key: "a", ctrl: false, label: "Accounts" },
  { key: "s", ctrl: false, label: "Subscriptions" },
  { key: "f", ctrl: false, label: "Forecast", note: "account page" },
  { key: "r", ctrl: false, label: "Reconcile", note: "account page" },
];

function formatKey(key: string, ctrl?: boolean) {
  const label =
    key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
  return ctrl ? `Ctrl+${label}` : label;
}

function isSystemKey(key: string, ctrl: boolean) {
  return SYSTEM_SHORTCUTS.some(
    (r) => r.key.toLowerCase() === key.toLowerCase() && r.ctrl === ctrl,
  );
}

export function ShortcutsTab() {
  const { preferences, update } = usePreferences();
  const { accounts } = useAccounts();

  const shortcuts = preferences.accountShortcuts ?? [];

  const [pendingKey, setPendingKey] = useState<{
    key: string;
    ctrl: boolean;
  } | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState("");
  const [listening, setListening] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const listenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("keydown", listenerRef.current, {
          capture: true,
        });
      }
    };
  }, []);

  function saveShortcuts(next: AccountShortcut[]) {
    update.mutate({ ...preferences, accountShortcuts: next });
  }

  function removeShortcut(index: number) {
    saveShortcuts(shortcuts.filter((_, i) => i !== index));
  }

  function startListening() {
    if (listenerRef.current) {
      window.removeEventListener("keydown", listenerRef.current, {
        capture: true,
      });
    }
    setListening(true);
    setPendingKey(null);
    setConflict(null);

    function onKeyDown(e: KeyboardEvent) {
      if (["Control", "Meta", "Shift", "Alt", "Tab"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      listenerRef.current = null;
      setListening(false);
      setPendingKey({ key: e.key, ctrl: e.ctrlKey || e.metaKey });
    }

    listenerRef.current = onKeyDown;
    window.addEventListener("keydown", onKeyDown, { capture: true });
  }

  function handleAdd() {
    if (!pendingKey || !pendingAccountId) return;
    setConflict(null);

    if (isSystemKey(pendingKey.key, pendingKey.ctrl)) {
      setConflict(
        `"${formatKey(pendingKey.key, pendingKey.ctrl)}" is a built-in shortcut and cannot be rebound.`,
      );
      return;
    }

    // Replace any existing binding for the same key combination
    const filtered = shortcuts.filter(
      (s) =>
        !(
          s.key.toLowerCase() === pendingKey.key.toLowerCase() &&
          (s.ctrl ?? false) === pendingKey.ctrl
        ),
    );

    const shortcut: AccountShortcut = {
      key: pendingKey.key,
      accountId: Number(pendingAccountId),
    };
    if (pendingKey.ctrl) shortcut.ctrl = true;

    saveShortcuts([...filtered, shortcut]);
    setPendingKey(null);
    setPendingAccountId("");
  }

  const activeAccounts = accounts.filter((a) => !a.deleted);

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="rounded-md border border-border p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Keyboard Shortcuts
        </p>

        <div className="flex flex-col">
          <div className="grid grid-cols-[64px_1fr] items-center gap-3 pb-1 text-xs text-muted-foreground border-b border-border">
            <span>Key</span>
            <span>Action</span>
          </div>

          {/* System shortcuts — read-only */}
          {SYSTEM_SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="grid grid-cols-[64px_1fr] items-center gap-3 py-2 border-b border-border text-muted-foreground"
            >
              <kbd className="flex items-center justify-center w-8 rounded bg-muted p-2 text-xs font-mono">
                {formatKey(s.key, s.ctrl)}
              </kbd>
              <span className="flex-1 text-sm">
                {s.label}
                {s.note && (
                  <span className="ml-2 text-xs text-muted-foreground/60">
                    {s.note}
                  </span>
                )}
              </span>
            </div>
          ))}

          {/* User-defined account shortcuts */}
          {shortcuts.map((s, i) => {
            const account = accounts.find((a) => a.id === s.accountId);
            return (
              <div
                key={i}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-3 py-2 border-b border-border last:border-0"
              >
                <kbd className="flex items-center justify-center w-8 rounded bg-muted p-2 text-xs font-mono">
                  {formatKey(s.key, s.ctrl)}
                </kbd>
                <span className="flex-1 text-sm">
                  {account?.name ?? `Account ${s.accountId}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeShortcut(i)}
                  aria-label="Remove shortcut"
                >
                  <X className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[128px_1fr_auto] items-center gap-2">
          <button
            type="button"
            onClick={startListening}
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-left font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {listening ? (
              <span className="text-muted-foreground">Press a key…</span>
            ) : pendingKey ? (
              formatKey(pendingKey.key, pendingKey.ctrl)
            ) : (
              <span className="text-muted-foreground">Key…</span>
            )}
          </button>

          <Select
            value={pendingAccountId}
            onValueChange={(v) => setPendingAccountId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select account…">
                {pendingAccountId
                  ? (activeAccounts.find(
                      (a) => String(a.id) === pendingAccountId,
                    )?.name ?? "Select account…")
                  : "Select account…"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={!pendingKey || !pendingAccountId}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>

        {conflict && <p className="text-xs text-destructive">{conflict}</p>}

        <p className="text-xs text-muted-foreground">
          Click the key field then press any key (with or without Ctrl/Cmd) to
          assign a shortcut to jump directly to an account.
        </p>
      </div>
    </div>
  );
}
