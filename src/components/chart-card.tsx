import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background transition-opacity duration-150"
        style={{ opacity: 1 }}
      >
        <Card className="flex-1 rounded-none border-0 ring-0">
          {header}
          <CardContent className="flex-1">{children}</CardContent>
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
