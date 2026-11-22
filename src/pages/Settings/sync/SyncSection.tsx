import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useState } from "react";
import { SyncConnectStep } from "./SyncConnectStep";
import { SyncConsentStep } from "./SyncConsentStep";
import { SyncStartJoinStep } from "./SyncStartJoinStep";
import { SyncStatusPanel } from "./SyncStatusPanel";

type Step = "off" | "consent" | "connect";

/**
 * The Sync card in Settings. Off by default: until the user confirms consent
 * and connects, the app sends nothing to the sync server. Absent when the
 * platform has no sync or the build has no sync server.
 */
export function SyncSection() {
  const { status } = useSyncStatus();
  const [step, setStep] = useState<Step>("off");
  const [hasData, setHasData] = useState<boolean | null>(null);

  if (!status || !status.supported || !status.configured) return null;

  let body: React.ReactNode;
  if (status.started) {
    body = <SyncStatusPanel status={status} />;
  } else if (status.enrolled) {
    body = <SyncStartJoinStep hasData={hasData} onHasData={setHasData} />;
  } else if (step === "connect") {
    body = (
      <SyncConnectStep
        onEnrolled={setHasData}
        onCancel={() => setStep("off")}
      />
    );
  } else if (step === "consent") {
    body = (
      <SyncConsentStep
        onConfirm={() => setStep("connect")}
        onCancel={() => setStep("off")}
      />
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sync is off. Your data stays on this device. Turn it on to keep your
          devices up to date through a cloud copy.
        </p>
        <Button
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          onClick={() => setStep("consent")}
        >
          Turn on sync
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="sync-heading"
      className="rounded-md border border-border p-4 space-y-4"
    >
      <h2
        id="sync-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Sync
      </h2>
      {body}
    </section>
  );
}
