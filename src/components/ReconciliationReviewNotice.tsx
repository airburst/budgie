import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAccounts } from "@/hooks/useAccounts";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { TriangleAlertIcon } from "lucide-react";
import { Link } from "react-router";

function ReviewList({ publicIds }: { publicIds: string[] }) {
  const { accounts } = useAccounts();
  const flagged = accounts.filter(
    (account) => account.publicId && publicIds.includes(account.publicId),
  );
  if (flagged.length === 0) return null;
  return (
    <Alert
      className="rounded-none border-x-0 border-t-0"
      data-testid="reconciliation-review-notice"
    >
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>Review reconciliation</AlertTitle>
      <AlertDescription>
        A sync changed transactions you had already reconciled, so{" "}
        {flagged.length === 1
          ? "this account no longer adds up"
          : "these accounts no longer add up"}
        :{" "}
        {flagged.map((account, index) => (
          <span key={account.id}>
            {index > 0 && ", "}
            <Link
              to={`/accounts/${account.id}`}
              className="inline-flex min-h-11 items-center font-medium md:min-h-0"
            >
              {account.name}
            </Link>
          </span>
        ))}
        . Nothing was changed for you.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown on every page (it sits in `Layout`) while sync reports accounts whose
 * reconciled total no longer matches their latest reconciliation (SY-043).
 * Nothing is stored: the list is recomputed on each status read, so the notice
 * goes by itself once the account is reconciled again or a sync fixes it.
 */
export function ReconciliationReviewNotice() {
  const { status } = useSyncStatus();
  const ids = status?.reconciliationReview ?? [];
  if (ids.length === 0) return null;
  return <ReviewList publicIds={ids} />;
}
