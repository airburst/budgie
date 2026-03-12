import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  name: string;
  assigned: number;
  activity: number;
  available: number;
  underfunded: boolean;
  categoryNames: string[];
  onAssignedChange: (value: number) => void;
};

function indicatorColor(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct >= 80) return "bg-amber-500";
  return "bg-green-600";
}

export function EnvelopeRow({
  name,
  assigned,
  activity,
  available,
  underfunded,
  categoryNames,
  onAssignedChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(assigned));
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-[140px]">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            {underfunded && <AlertTriangle className="size-4 text-amber-500" />}
          </div>
          <p className="text-muted-foreground text-xs">
            {categoryNames.join(" · ") || "No categories"}
          </p>
        </div>

        <div className="flex items-center gap-1 min-w-[120px]">
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
              className="w-20 rounded border bg-background px-1 py-0.5 text-sm"
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setDraft(String(assigned));
                setEditing(true);
              }}
              className="text-sm font-medium hover:underline"
            >
              £{assigned.toFixed(2)}
            </button>
          )}
        </div>

        <div className="flex-1">
          <Progress value={Math.min(pct, 100)}>
            <ProgressTrack className="h-2">
              <ProgressIndicator className={cn("h-full", indicatorColor(pct))} />
            </ProgressTrack>
          </Progress>
        </div>

        <div className="text-right min-w-[100px]">
          <span className="text-sm">
            £{spent.toFixed(2)} / £{assigned.toFixed(2)}
          </span>
        </div>

        <div className="text-right min-w-[80px]">
          <span
            className={cn(
              "text-sm font-medium",
              available < 0 ? "text-destructive" : "text-green-600",
            )}
          >
            £{available.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
