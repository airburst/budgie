import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";

type TransferStatus = "idle" | "busy" | "success" | "error";

export function DataTransferSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDocument, setPendingDocument] = useState<string | null>(null);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [message, setMessage] = useState("");

  async function handleExport() {
    setStatus("busy");
    setMessage("");
    try {
      const dataDocument = await window.api.exportPortableData();
      const url = URL.createObjectURL(
        new Blob([dataDocument], { type: "application/json;charset=utf-8" }),
      );
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `budgie-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("success");
      setMessage("Data exported");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Export failed");
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPendingDocument(await file.text());
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not read file");
    }
  }

  async function handleImport() {
    if (!pendingDocument) return;
    setStatus("busy");
    setMessage("");
    try {
      await window.api.importPortableData(pendingDocument);
      setPendingDocument(null);
      setStatus("success");
      setMessage("Data imported");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Data transfer
      </p>
      <p className="text-sm text-muted-foreground">
        Export your data to move it between Budgie installations. Importing
        replaces all local data.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleExport} disabled={status === "busy"}>
          <Download />
          Export data
        </Button>
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={status === "busy"}
        >
          <Upload />
          Import data
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          className="sr-only"
          aria-label="Choose Budgie data package"
        />
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
          {status === "success" && <CheckCircle className="size-4" />}
          {status === "error" && <XCircle className="size-4" />}
          <span>{status === "busy" ? "Working…" : message}</span>
        </div>
      )}
      <ConfirmDialog
        open={pendingDocument !== null}
        onOpenChange={(open) => !open && setPendingDocument(null)}
        title="Replace local data?"
        description="Importing replaces all local financial data and preferences. This cannot be undone."
        confirmLabel="Import data"
        onConfirm={handleImport}
      />
    </div>
  );
}