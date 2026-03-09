import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BackupInfo } from "@/types/electron";
import { format } from "date-fns";
import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedPath(null);
    async function load() {
      const [prefs, defaultFolder] = await Promise.all([
        window.api.getPreferences(),
        window.api.getDefaultBackupFolder(),
      ]);
      const backupFolder = prefs.backupFolder ?? defaultFolder;
      setFolder(backupFolder);
      const list = await window.api.listBackups(backupFolder);
      setBackups(list);
    }
    load();
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
    if (!selectedPath) return;
    await window.api.restoreBackup(selectedPath);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              Select a backup to restore. The app will restart automatically.
              All current data will be replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div
              className="rounded-lg border overflow-y-auto"
              style={{ maxHeight: "240px" }}
            >
              {backups.length === 0 ? (
                <p className="text-muted-foreground text-sm p-4 text-center">
                  No backups found in the configured folder.
                </p>
              ) : (
                <ul className="divide-y">
                  {backups.map((b) => (
                    <li
                      key={b.path}
                      onClick={() => setSelectedPath(b.path)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 cursor-pointer text-sm hover:bg-accent/50 select-none",
                        selectedPath === b.path &&
                          "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="font-mono truncate flex-1 mr-4">
                        {b.name}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {b.size > 0 ? formatSize(b.size) : ""}
                        {b.size > 0 ? " · " : ""}
                        {format(new Date(b.createdAt), "d MMM yyyy, HH:mm")}
                      </span>
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
              <FolderOpen className="size-4 mr-2" />
              Browse for file…
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedPath}
              onClick={handleRestore}
            >
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restore this backup?"
        description="This will replace all current data and restart the app immediately. This cannot be undone."
        confirmLabel="Restore"
        onConfirm={handleConfirmRestore}
      />
    </>
  );
}
