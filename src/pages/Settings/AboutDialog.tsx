import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Content-sized information drawer on phones, dialog from `md`. */
export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent
        initialFocus={closeRef}
        dialogClassName="sm:max-w-xs text-center"
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Budgie</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Version {__APP_VERSION__}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <div className="border-t px-4 pt-3 md:px-0">
          <Button
            variant="link"
            className="h-auto min-h-11 px-0 md:min-h-0"
            onClick={() =>
              void window.api.openExternal(
                "https://github.com/airburst/budgie/blob/main/CHANGELOG.md",
              )
            }
          >
            See what's changed in this version
          </Button>
        </div>
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
