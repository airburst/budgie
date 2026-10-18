import { Amount } from "@/components/ui/amount";
import type { Account, Category, ScheduledTransaction } from "@/types/electron";
import { frequencyLabel, scheduleStatusText } from "./scheduled-display";

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type ScheduledDetailsProps = {
  scheduled: ScheduledTransaction;
  accounts: Account[];
  category?: Category | null;
};

/** Read-only summary shown before an explicit Edit or Record payment. No inputs. */
export function ScheduledDetails({
  scheduled: s,
  accounts,
  category,
}: ScheduledDetailsProps) {
  const account = accounts.find((a) => a.id === s.accountId);
  const transferTo = s.transferToAccountId
    ? accounts.find((a) => a.id === s.transferToAccountId)
    : null;
  const status = scheduleStatusText(s);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold break-words">{s.payee}</p>
          <p className="text-sm text-muted-foreground">
            {[account?.name, ...(status.length ? status : ["Active"])]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          <Amount value={s.amount} />
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Next due</dt>
        <dd>
          {s.nextDueDate ? (
            <time dateTime={s.nextDueDate}>
              {LONG_DATE.format(new Date(`${s.nextDueDate}T00:00:00Z`))}
            </time>
          ) : (
            "Not set"
          )}
        </dd>
        <dt className="text-muted-foreground">Repeats</dt>
        <dd>{frequencyLabel(s.rrule)}</dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{category?.name ?? "Uncategorised"}</dd>
        {transferTo && (
          <>
            <dt className="text-muted-foreground">Transfer to</dt>
            <dd>{transferTo.name}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Auto-post</dt>
        <dd>
          {s.autoPost
            ? s.daysInAdvance
              ? `On, ${s.daysInAdvance} ${s.daysInAdvance === 1 ? "day" : "days"} in advance`
              : "On"
            : "Off"}
        </dd>
        <dt className="text-muted-foreground">Notes</dt>
        <dd className="break-words whitespace-pre-wrap">
          {s.notes?.trim() ? (
            s.notes
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </dd>
      </dl>
      {!s.active && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This schedule is paused. It won&apos;t auto-post or count towards the
          due-soon totals.
        </p>
      )}
    </div>
  );
}
