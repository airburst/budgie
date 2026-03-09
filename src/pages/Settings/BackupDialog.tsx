import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, FolderOpen, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

type BackupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const [folder, setFolder] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setMessage("");
    async function loadFolder() {
      const [prefs, defaultFolder] = await Promise.all([
        window.api.getPreferences(),
        window.api.getDefaultBackupFolder(),
      ]);
      setFolder(prefs.backupFolder ?? defaultFolder);
    }
    loadFolder();
  }, [open]);

  async function handleBrowse() {
    const chosen = await window.api.chooseBackupFolder();
    if (chosen) setFolder(chosen);
  }

  async function handleCreate() {
    setStatus("busy");
    setMessage("");
    try {
      const prefs = await window.api.getPreferences();
      if (prefs.backupFolder !== folder) {
        await window.api.setPreferences({ ...prefs, backupFolder: folder });
      }
      const result = await window.api.createBackup(folder);
      const filename = result.path.split("/").pop() ?? result.path;
      setStatus("success");
      setMessage(`Saved: ${filename}`);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Backup failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Backup</DialogTitle>
          <DialogDescription>
            Save a snapshot of your data to the selected folder. Backups older
            than 30 days are removed automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-folder">Backup folder</Label>
            <div className="flex gap-2">
              <Input
                id="backup-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          {status !== "idle" && (
            <div
              className={`flex items-center gap-2 text-sm ${
                status === "success"
                  ? "text-green-600"
                  : status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {status === "success" && (
                <CheckCircle className="size-4 shrink-0" />
              )}
              {status === "error" && <XCircle className="size-4 shrink-0" />}
              <span>{status === "busy" ? "Creating backup…" : message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleCreate}
            disabled={status === "busy" || !folder}
          >
            Create Backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
