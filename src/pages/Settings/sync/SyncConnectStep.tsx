import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSyncApi } from "@/platform/sync-api";
import { useId, useState } from "react";
import { describeSyncFailure } from "./sync-messages";

/** After consent: the code and a device name. The first request to the server happens here. */
export function SyncConnectStep({
  onEnrolled,
  onCancel,
}: {
  /** Whether the server already holds data (Join) or not (Start). */
  onEnrolled: (hasData: boolean) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeId = useId();
  const nameId = useId();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await getSyncApi().enrolSync({
        code,
        deviceName,
        consent: true,
      });
      if (result.ok) onEnrolled(result.hasData);
      else setError(describeSyncFailure(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <h3 className="text-base font-semibold">Connect this device</h3>
      <p className="text-sm text-muted-foreground">
        Enter the code you were given, or the code shown on another device that
        is already syncing.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={codeId}>Code</Label>
        <Input
          id={codeId}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          className="min-h-11 md:min-h-0"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Device name</Label>
        <Input
          id={nameId}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="For example, Mark's phone"
          className="min-h-11 md:min-h-0"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive break-words">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          disabled={busy || code.trim() === "" || deviceName.trim() === ""}
        >
          {busy ? "Connecting…" : "Connect"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
