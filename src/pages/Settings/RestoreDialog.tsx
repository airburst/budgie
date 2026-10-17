import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { BackupInfo } from "@/types/electron";
import { format } from "date-fns";
import { FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type RestoreDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RestoreDialog({ open, onOpenChange }: RestoreDialogProps) {
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restoringRef = useRef(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedPath(null);
    setError(null);
    async function load() {
      try {
        const [prefs, defaultFolder] = await Promise.all([
          window.api.getPreferences(),
          window.api.getDefaultBackupFolder(),
        ]);
        const backupFolder = prefs.backupFolder ?? defaultFolder;
        setFolder(backupFolder);
        const list = await window.api.listBackups(backupFolder);
        setBackups(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load backups");
      }
    }
    void load();
  }, [open]);

  async function handleBrowse() {
    const chosen = await window.api.chooseBackupFile(folder);
    if (!chosen) return;
    // If the file isn't already in the list, add it as a one-off entry
    if (!backups.find((b) => b.path === chosen)) {
      const name = chosen.split("/").pop() ?? chosen;
      setBackups((prev) => [
        { name, path: chosen, size: 0, createdAt: new Date().toISOString() },
        ...prev,
      ]);
    }
    setSelectedPath(chosen);
  }

  function handleRestore() {
    if (!selectedPath) return;
    setConfirmOpen(true);
  }

  async function handleConfirmRestore() {
    if (!selectedPath || restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    setError(null);
    try {
      await window.api.restoreBackup(selectedPath);
    } catch (e) {
      // Keep the dialog and selection so the user can retry or pick another.
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  }

  // Dismissal (swipe, Escape, backdrop) is ignored while a restore is running.
  function handleOpenChange(next: boolean) {
    if (!next && restoringRef.current) return;
    onOpenChange(next);
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOpenChange}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-lg"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            Restore Backup
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Select a backup to restore. The app will restart automatically. All
            current data will be replaced.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody className="flex flex-col gap-3">
          <div className="max-h-60 overflow-y-auto rounded-lg border">
            {backups.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No backups found in the configured folder.
              </p>
            ) : (
              <ul className="divide-y" aria-label="Backups">
                {backups.map((b) => (
                  <li key={b.path}>
                    <button
                      type="button"
                      aria-pressed={selectedPath === b.path}
                      onClick={() => setSelectedPath(b.path)}
                      className={cn(
                        "flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm select-none hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                        selectedPath === b.path &&
                          "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="min-w-0 max-w-full flex-1 truncate font-mono">
                        {b.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {b.size > 0 ? formatSize(b.size) : ""}
                        {b.size > 0 ? " · " : ""}
                        {format(new Date(b.createdAt), "d MMM yyyy, HH:mm")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={handleBrowse}
          >
            <FolderOpen className="mr-2 size-4" />
            Browse for file…
          </Button>

          {error && (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={restoring}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!selectedPath || restoring}
            onClick={handleRestore}
          >
            {restoring ? "Restoring…" : "Restore"}
          </Button>
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Restore this backup?"
          description="This will replace all current data and restart the app immediately. This cannot be undone."
          confirmLabel="Restore"
          onConfirm={handleConfirmRestore}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
