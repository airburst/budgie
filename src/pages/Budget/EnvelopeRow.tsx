import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDownIcon,
  ArrowUpIcon,
  EditIcon,
  GripVertical,
  MoreHorizontalIcon,
  PencilIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { formatMoney } from "./money";

type Props = {
  envelopeId: number;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  underfunded: boolean;
  categoryNames: string[];
  /** Zero-based position in the list, for the Move up / Move down bounds. */
  index: number;
  count: number;
  /** Rejects when the allocation could not be saved. */
  onAssignedChange: (value: number) => Promise<unknown>;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
};

function indicatorColor(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct >= 80) return "bg-amber-500";
  return "bg-green-600";
}

export function EnvelopeRow({
  envelopeId,
  name,
  assigned,
  activity,
  available,
  underfunded,
  categoryNames,
  index,
  count,
  onAssignedChange,
  onEdit,
  onMove,
}: Props) {
  const compact = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(String(assigned));
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: envelopeId });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const spent = Math.abs(activity);
  const pct = assigned > 0 ? (spent / assigned) * 100 : activity < 0 ? 100 : 0;
  const inputId = `envelope-assigned-${envelopeId}`;

  function startEditing() {
    setDraft(String(assigned));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(String(assigned));
    setSaveError(null);
    setEditing(false);
  }

  async function commit() {
    // Guards Enter + blur / double taps before `saving` re-renders.
    if (submittingRef.current) return;
    const parsed = parseFloat(draft);
    if (isNaN(parsed)) {
      if (compact) {
        setSaveError("Enter an amount, for example 250.00.");
        return;
      }
      setEditing(false);
      return;
    }
    if (parsed === assigned) {
      setSaveError(null);
      setEditing(false);
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    // Desktop blur-save closes the inline input straight away, as before.
    if (!compact) setEditing(false);
    try {
      await onAssignedChange(parsed);
      setEditing(false);
    } catch {
      setSaveError("Couldn't save the assigned amount. Please try again.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  const phoneEditing = editing && compact;

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-slot="envelope-card"
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-center gap-y-2 rounded-lg border bg-card px-3 py-3 md:px-4",
        isDragging && "z-20 opacity-90 shadow-md",
      )}
    >
      {/* Phone: the wrapper dissolves so name and categories sit on their own
          grid rows. lg: it is one block, with categories under the name. */}
      <div className="contents lg:col-start-1 lg:row-start-1 lg:block lg:min-w-0">
        <div className="col-start-1 row-start-1 min-w-0">
          <h3 className="font-medium break-words">{name}</h3>
          {underfunded && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              Underfunded
              <span className="sr-only">
                : scheduled transactions this month exceed the assigned amount
              </span>
            </p>
          )}
        </div>
        <p
          data-slot="envelope-categories"
          className="col-span-3 row-start-2 text-xs break-words text-muted-foreground lg:mt-0.5"
        >
          <span className="sr-only">Categories: </span>
          {categoryNames.length > 0
            ? categoryNames.join(" · ")
            : "No categories"}
        </p>
      </div>

      <p
        data-slot="envelope-available"
        className={cn(
          "col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums lg:col-start-5",
          available < 0
            ? "text-destructive"
            : "text-green-700 dark:text-green-500",
        )}
      >
        <span className="block text-xs font-normal text-muted-foreground lg:sr-only">
          Available
        </span>
        {formatMoney(available)}
      </p>

      <Progress
        value={Math.min(pct, 100)}
        aria-label={`${name} spending`}
        className="col-span-3 row-start-3 lg:col-span-1 lg:col-start-3 lg:row-start-1"
      >
        <ProgressTrack className="h-2">
          <ProgressIndicator className={cn("h-full", indicatorColor(pct))} />
        </ProgressTrack>
      </Progress>

      <div
        data-slot="envelope-assigned"
        className={cn(
          "col-start-1 row-start-4 min-w-0 lg:col-start-2 lg:row-start-1",
          phoneEditing && "col-span-3",
        )}
      >
        {phoneEditing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void commit();
            }}
          >
            <label
              htmlFor={inputId}
              className="text-xs text-muted-foreground"
            >
              Assigned amount for {name}
            </label>
            <Input
              id={inputId}
              ref={inputRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              className="h-11 tabular-nums"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditing();
              }}
              aria-invalid={saveError != null && isNaN(parseFloat(draft))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void commit()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            {/* Hidden submit button so pressing Enter in the input saves */}
            <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
          </form>
        ) : (
          <>
            <span className="block text-xs text-muted-foreground lg:sr-only">
              Assigned
            </span>
            {editing ? (
              <input
                id={inputId}
                ref={inputRef}
                type="number"
                step="0.01"
                aria-label={`Assigned amount for ${name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") inputRef.current?.blur();
                  if (e.key === "Escape") cancelEditing();
                }}
                className="h-8 w-24 rounded border bg-background px-2 text-sm tabular-nums"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Edit assigned amount for ${name}, currently ${formatMoney(assigned)}`}
                className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-8"
              >
                {formatMoney(assigned)}
                <PencilIcon
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            )}
          </>
        )}
      </div>

      {!phoneEditing && (
        <p
          data-slot="envelope-spent"
          className="col-start-2 row-start-4 text-right text-sm tabular-nums lg:col-start-4 lg:row-start-1"
        >
          <span className="block text-xs text-muted-foreground lg:sr-only">
            Spent
          </span>
          {formatMoney(spent)}
        </p>
      )}

      {/* Phone: menu sits beside the name, handle at the end of the stats row.
          lg: one aligned action cell. */}
      <div className="contents lg:col-start-6 lg:row-start-1 lg:flex lg:items-center lg:justify-end lg:gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          aria-label={`Edit ${name}`}
          title="Edit envelope"
          onClick={onEdit}
        >
          <EditIcon className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="col-start-3 row-start-1 size-11 justify-self-end md:size-8"
                aria-label={`More actions for ${name}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="min-h-11 md:min-h-8 lg:hidden"
              onClick={onEdit}
            >
              <EditIcon />
              Edit envelope
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUpIcon />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDownIcon />
              Move down
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!phoneEditing && (
          <button
            {...attributes}
            {...listeners}
            type="button"
            className={cn(
              "col-start-3 row-start-4 inline-flex size-11 cursor-grab touch-none items-center justify-center justify-self-end rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing md:size-8",
            )}
            aria-label={`Drag to reorder ${name}`}
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </div>

      {saveError && (
        <p
          role="alert"
          className="col-span-full text-sm text-destructive"
        >
          {saveError}
        </p>
      )}
    </li>
  );
}
