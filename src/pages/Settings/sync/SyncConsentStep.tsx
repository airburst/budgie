import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useId, useState } from "react";

/** The consent wording. Nothing is sent, or recorded, until it is confirmed. */
export const SYNC_CONSENT_POINTS: { title: string; text: string }[] = [
  {
    title: "What is uploaded",
    text: "All of your budget data: accounts, transactions, categories, payees, envelopes and scheduled transactions.",
  },
  {
    title: "Where it goes",
    text: "To a sync server run on Cloudflare, in the EU.",
  },
  {
    title: "Snapshots",
    text: "The server keeps a daily snapshot of your data for 30 days.",
  },
  {
    title: "Who can read it",
    text: "Your data is not end-to-end encrypted. The operator of the sync server can read it.",
  },
  {
    title: "Stopping and deleting",
    text: "You can stop syncing on this device at any time and keep your data here. You can also sign this device out, or delete your data from the server, from this Settings section.",
  },
];

export function SyncConsentStep({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();

  return (
    <div className="space-y-4" data-testid="sync-consent">
      <h3 className="text-base font-semibold">Before you turn on sync</h3>
      <p className="text-sm text-muted-foreground">
        Budgie keeps your data on this device unless you turn on sync. Please
        read this first.
      </p>
      <ul className="space-y-3 text-sm">
        {SYNC_CONSENT_POINTS.map((point) => (
          <li key={point.title}>
            <span className="font-medium">{point.title}.</span>{" "}
            <span className="text-muted-foreground">{point.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="size-5 shrink-0 cursor-pointer accent-blue-500"
        />
        <Label
          htmlFor={checkboxId}
          className="min-h-11 flex-1 cursor-pointer font-normal md:min-h-0"
        >
          I understand, and I agree to upload my data
        </Label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          disabled={!agreed}
          onClick={onConfirm}
        >
          Continue
        </Button>
        <Button
          variant="outline"
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
