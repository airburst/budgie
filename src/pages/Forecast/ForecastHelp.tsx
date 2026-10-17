import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Content-sized information drawer on phones, dialog from `md`. */
export function ForecastHelp({ open, onOpenChange }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent initialFocus={closeRef}>
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Forecast Help</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            How to use the balance forecast.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <ResponsiveOverlayBody className="space-y-3 text-sm">
          <p>
            The forecast projects your account balance from today to the chosen
            end date.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Green line</strong> —
              projected running balance over time.
            </li>
            <li>
              <strong className="text-foreground">Red dashed line</strong> —
              zero balance reference; dips below indicate a negative balance.
            </li>
            <li>
              <strong className="text-foreground">Italic cards</strong> —
              projected transactions from your scheduled payments.
            </li>
            <li>
              <strong className="text-foreground">Tapping a card</strong> —
              includes or excludes it from the forecast calculation. This never
              changes the real transaction.
            </li>
            <li>
              <strong className="text-foreground">Details</strong> — shows the
              full category and memo of a projected transaction.
            </li>
            <li>
              <strong className="text-foreground">Refresh</strong> — apply a new
              end date and reset all inclusions.
            </li>
          </ul>
        </ResponsiveOverlayBody>
        <ResponsiveOverlayFooter>
          <Button
            ref={closeRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
