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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBudgetTransfers } from "@/hooks/useBudgetTransfers";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Envelope } from "@/types/electron";
import { useEffect, useRef, useState } from "react";
import { formatMonth } from "./MonthSelector";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  envelopes: Envelope[];
};

export function MoveMoneyDialog({
  open,
  onOpenChange,
  month,
  envelopes,
}: Props) {
  const { create } = useBudgetTransfers(month);
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setFromId(null);
    setToId(null);
    setAmount("");
    setNotes("");
    setSaveError(null);
    setConfirmDiscard(false);
  }, [open]);

  const items = envelopes.map((e) => ({ value: String(e.id), label: e.name }));
  const dirty =
    fromId !== null || toId !== null || amount !== "" || notes !== "";
  const sameEnvelope = fromId !== null && fromId === toId;
  const canSubmit =
    fromId !== null &&
    toId !== null &&
    fromId !== toId &&
    parseFloat(amount) > 0;

  function handleClose() {
    setConfirmDiscard(false);
    onOpenChange(false);
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    handleClose();
  }

  async function submit() {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await create.mutateAsync({
        fromEnvelopeId: Number(fromId),
        toEnvelopeId: Number(toId),
        month,
        amount: parseFloat(amount),
        notes: notes || null,
      });
    } catch (err) {
      setSaveError(
        `Couldn't move the money. ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
    handleClose();
  }

  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (saving || submittingRef.current) return;
    requestClose();
  }

  function envelopeSelect(
    id: string,
    label: string,
    value: string | null,
    onChange: (value: string | null) => void,
  ) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={value}
          onValueChange={(v) => onChange(v as string | null)}
          items={items}
        >
          <SelectTrigger id={id} className="h-11 w-full md:h-8">
            <SelectValue placeholder="Select envelope" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="min-h-11 md:min-h-8"
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-md"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            Move Money
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Move budgeted money between envelopes for {formatMonth(month)}.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-4"
          >
            {envelopeSelect("move-from", "From", fromId, setFromId)}
            {envelopeSelect("move-to", "To", toId, setToId)}
            {sameEnvelope && (
              <p className="text-sm text-destructive">
                Choose two different envelopes.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="move-amount">Amount (£)</Label>
              <Input
                id="move-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                className="h-11 md:h-8"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="move-notes">Notes (optional)</Label>
              <Input
                id="move-notes"
                type="text"
                className="h-11 md:h-8"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {/* Hidden submit button so pressing Enter in any input submits */}
            <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
          </form>
          {saveError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {saveError}
            </p>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || saving}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard changes?"
          description="This money hasn't been moved yet."
          confirmLabel="Discard"
          onConfirm={handleClose}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
