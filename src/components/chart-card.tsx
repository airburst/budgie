import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Maximize2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
};

// Undefined outside of a maximised ChartCard, so charts fall back to their
// default fixed aspect ratio.
const ChartFillHeightContext = createContext<number | undefined>(undefined);

/** The pixel height available to a chart when its card is maximised. */
export function useChartFillHeight() {
  return useContext(ChartFillHeightContext);
}

export function ChartCard({ title, badge, children }: Props) {
  const [maximised, setMaximised] = useState(false);
  const [fillHeight, setFillHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!maximised) {
      setFillHeight(undefined);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(([entry]) => {
      const height =
        entry?.contentBoxSize?.[0]?.blockSize ?? entry?.contentRect.height;
      if (height) setFillHeight(height);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [maximised]);

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
          <CardContent ref={contentRef} className="flex-1 min-h-0 flex">
            {fillHeight === undefined ? null : (
              // Mounting the chart only once its final size is known means it
              // paints (and animates in) at full size instead of snapping to
              // it right after an initial small-then-large resize.
              <ChartFillHeightContext.Provider value={fillHeight}>
                {children}
              </ChartFillHeightContext.Provider>
            )}
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
