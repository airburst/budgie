import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";
import { downloadPortableExport } from "../export-backup";

/** "Download backup": the portable export. Reused wherever a backup is offered first. */
export function DownloadBackupButton({
  variant = "outline",
}: {
  variant?: "outline" | "secondary";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await downloadPortableExport();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        className="w-full min-h-11 sm:w-auto md:min-h-0"
        onClick={() => void handleClick()}
        disabled={busy}
      >
        <Download />
        Download backup
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
