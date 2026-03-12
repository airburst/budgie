import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBudgetTransfers } from "@/hooks/useBudgetTransfers";
import type { Envelope } from "@/types/electron";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";

type Props = {
  month: string;
  envelopes: Envelope[];
};

export function MoveMoneyDialog({ month, envelopes }: Props) {
  const { create } = useBudgetTransfers(month);
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit =
    fromId !== "" && toId !== "" && fromId !== toId && parseFloat(amount) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        fromEnvelopeId: fromId as number,
        toEnvelopeId: toId as number,
        month,
        amount: parseFloat(amount),
        notes: notes || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setFromId("");
          setToId("");
          setAmount("");
          setNotes("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowLeftRight className="size-4 mr-1" />
            Move Money
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move Money</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">From</span>
            <select
              value={fromId}
              onChange={(e) =>
                setFromId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select envelope...</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">To</span>
            <select
              value={toId}
              onChange={(e) =>
                setToId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select envelope...</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Amount (£)</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
