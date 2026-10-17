import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { Category } from "@/types/electron";
import { useRef } from "react";
import type { ForecastRowWithBalance } from "./ForecastTransactionList";

type Props = {
  row: ForecastRowWithBalance | null;
  category?: Category;
  onClose: () => void;
};

/**
 * Read-only details for a projected row. It never edits the real transaction
 * or schedule; inclusion is toggled only from the card.
 */
export function ForecastDetails({ row, category, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <ResponsiveOverlay
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResponsiveOverlayContent
        initialFocus={closeRef}
        dialogClassName="sm:max-w-md"
      >
        {row && (
          <>
            <ResponsiveOverlayHeader>
              <ResponsiveOverlayTitle className="break-words">
                {row.payee}
              </ResponsiveOverlayTitle>
              <ResponsiveOverlayDescription>
                Projected transaction details
              </ResponsiveOverlayDescription>
            </ResponsiveOverlayHeader>
            <ResponsiveOverlayBody>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Date</dt>
                <dd>{formatDate(row.date)}</dd>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="tabular-nums">
                  <Amount value={row.amount} />
                </dd>
                <dt className="text-muted-foreground">Projected balance</dt>
                <dd className="tabular-nums">
                  {row.included ? <Amount value={row.runningBalance} /> : "—"}
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{row.included ? "Included" : "Excluded from forecast"}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>
                  {row.isScheduled
                    ? "Scheduled payment"
                    : "Existing future transaction"}
                </dd>
                <dt className="text-muted-foreground">Category</dt>
                <dd className="break-words">{category?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Memo</dt>
                <dd className="break-words whitespace-pre-wrap">
                  {row.notes?.trim() ? row.notes : "—"}
                </dd>
              </dl>
            </ResponsiveOverlayBody>
            <ResponsiveOverlayFooter>
              <Button ref={closeRef} variant="outline" onClick={onClose}>
                Close
              </Button>
            </ResponsiveOverlayFooter>
          </>
        )}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
