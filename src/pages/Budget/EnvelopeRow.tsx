import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  envelopeId: number;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  underfunded: boolean;
  categoryNames: string[];
  onAssignedChange: (value: number) => void;
  editButton?: React.ReactNode;
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
  onAssignedChange,
  editButton,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(assigned));
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: envelopeId });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const spent = Math.abs(activity);
  const pct = assigned > 0 ? (spent / assigned) * 100 : activity < 0 ? 100 : 0;

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed !== assigned) {
      onAssignedChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") {
      setDraft(String(assigned));
      setEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card rounded-lg border p-4"
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-35">
          <Tooltip>
            <TooltipTrigger className="font-medium cursor-default">
              {name}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {categoryNames.length > 0
                ? categoryNames.join(" · ")
                : "No categories"}
            </TooltipContent>
          </Tooltip>
          {underfunded && <AlertTriangle className="size-4 text-amber-500" />}
          {editButton}
        </div>

        <div className="flex items-center gap-1 min-w-35">
          <span className="text-muted-foreground text-xs">Assigned:</span>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-24 h-6 rounded border bg-background px-2 text-sm"
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setDraft(String(assigned));
                setEditing(true);
              }}
              className="w-24 h-6 text-left text-sm font-medium hover:underline px-2"
            >
              £{assigned.toFixed(2)}
            </button>
          )}
        </div>

        <div className="flex-1">
          <Progress value={Math.min(pct, 100)}>
            <ProgressTrack className="h-2">
              <ProgressIndicator
                className={cn("h-full", indicatorColor(pct))}
              />
            </ProgressTrack>
          </Progress>
        </div>

        <div className="text-right min-w-25">
          <span className="text-sm">
            £{spent.toFixed(2)} / £{assigned.toFixed(2)}
          </span>
        </div>

        <div className="text-right min-w-20">
          <span
            className={cn(
              "text-sm font-medium",
              available < 0 ? "text-destructive" : "text-green-600",
            )}
          >
            £{available.toFixed(2)}
          </span>
        </div>

        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      </div>
    </div>
  );
}
