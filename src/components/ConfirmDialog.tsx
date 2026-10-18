import { Button } from "@/components/ui/button";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  /** Destructive by default; use "default" for reversible-ish actions like Skip. */
  confirmVariant?: "destructive" | "default";
};

/**
 * Confirmation (destructive unless `confirmVariant` says otherwise): bottom drawer on phones, centered dialog from `md`.
 * Cancel takes initial focus at every width so Enter never confirms by accident
 * and no keyboard opens. Dismissal (swipe, Escape, backdrop) is a Cancel.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
  confirmVariant = "destructive",
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={(next) => onOpenChange(next)}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-sm"
        initialFocus={cancelRef}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>{title}</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {description}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <ResponsiveOverlayFooter>
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
