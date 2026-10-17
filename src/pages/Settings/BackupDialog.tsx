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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CheckCircle, FolderOpen, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BackupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const creatingRef = useRef(false);
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
      try {
        const [prefs, defaultFolder] = await Promise.all([
          window.api.getPreferences(),
          window.api.getDefaultBackupFolder(),
        ]);
        setFolder(prefs.backupFolder ?? defaultFolder);
      } catch (e) {
        setStatus("error");
        setMessage(
          e instanceof Error ? e.message : "Could not load backup folder",
        );
      }
    }
    void loadFolder();
  }, [open]);

  async function handleBrowse() {
    const chosen = await window.api.chooseBackupFolder();
    if (chosen) setFolder(chosen);
  }

  async function handleCreate() {
    // Guards a double tap before `status` re-renders.
    if (creatingRef.current) return;
    creatingRef.current = true;
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
    } finally {
      creatingRef.current = false;
    }
  }

  // Dismissal (swipe, Escape, backdrop) is ignored while a backup is running.
  function handleOpenChange(next: boolean) {
    if (!next && creatingRef.current) return;
    onOpenChange(next);
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOpenChange}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-md"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            Create Backup
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Save a snapshot of your data to the selected folder. Backups older
            than 30 days are removed automatically.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-folder">Backup folder</Label>
            <div className="flex gap-2">
              <Input
                id="backup-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Choose backup folder"
                onClick={handleBrowse}
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          {status !== "idle" && (
            <div
              role={status === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 text-sm break-words ${
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
              <span className="min-w-0">
                {status === "busy" ? "Creating backup…" : message}
              </span>
            </div>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={status === "busy"}
          >
            Close
          </Button>
          <Button
            onClick={handleCreate}
            disabled={status === "busy" || !folder}
          >
            Create Backup
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
