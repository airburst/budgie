import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
};

export function ChartCard({ title, badge, children }: Props) {
  const [maximised, setMaximised] = useState(false);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && maximised) setMaximised(false);
    },
    [maximised],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {title}
        {badge}
      </CardTitle>
      <CardAction>
        {maximised ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMaximised(false)}
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMaximised(true)}
          >
            <Maximize2 className="size-4" />
          </Button>
        )}
      </CardAction>
    </CardHeader>
  );

  if (maximised) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <Card className="flex-1 flex flex-col rounded-none border-0 ring-0 h-full">
          {header}
          <CardContent className="flex-1 min-h-0 **:data-[slot=chart]:aspect-auto **:data-[slot=chart]:max-h-none **:data-[slot=chart]:h-full">
            {children}
          </CardContent>
        </Card>
      </div>,
      document.body,
    );
  }

  return (
    <Card>
      {header}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
