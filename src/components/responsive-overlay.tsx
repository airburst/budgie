import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { createContext, useContext, type ComponentProps } from "react";

/**
 * Why the overlay asked to close. Explicit buttons inside the overlay call the
 * parent's close handler directly; everything routed through `onOpenChange`
 * is an implicit dismissal (swipe, Escape, outside press, close button).
 */
export type OverlayDismissReason = DrawerPrimitive.Root.ChangeEventReason;

type ResponsiveOverlayContextValue = { compact: boolean };

const ResponsiveOverlayContext =
  createContext<ResponsiveOverlayContextValue | null>(null);

function useResponsiveOverlay() {
  const context = useContext(ResponsiveOverlayContext);
  if (!context) {
    throw new Error(
      "ResponsiveOverlay parts must be rendered inside <ResponsiveOverlay>.",
    );
  }
  return context;
}

/**
 * Base UI returns focus to the opener when an overlay closes (including a
 * menu item that opened it). When the opener no longer exists (a deleted card,
 * a re-created row) focus would be dropped to <body>; park it on the page
 * heading instead so keyboard and screen-reader users keep their place.
 */
function restoreFocusToPageHeading() {
  // Completion is reported while the popup is still mounted, before Base UI
  // has moved focus out of it; check once that has settled.
  window.setTimeout(focusPageHeadingIfFocusLost, 50);
}

function focusPageHeadingIfFocusLost() {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const heading =
    document.querySelector<HTMLElement>("main h1") ??
    document.querySelector<HTMLElement>("h1");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

type ResponsiveOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean, reason: OverlayDismissReason) => void;
  children: React.ReactNode;
};

/**
 * Bottom drawer on phones, centered dialog from the `md` breakpoint up.
 * Both share the same controlled `open` state; keep draft/form state in the
 * component that renders this so a viewport change cannot reset it.
 */
function ResponsiveOverlay({
  open,
  onOpenChange,
  children,
}: ResponsiveOverlayProps) {
  const compact = useIsMobile();

  return (
    <ResponsiveOverlayContext.Provider value={{ compact }}>
      {compact ? (
        <Drawer
          open={open}
          onOpenChange={(next, details) => onOpenChange(next, details.reason)}
          onOpenChangeComplete={(isOpen) => {
            if (!isOpen) restoreFocusToPageHeading();
          }}
          showSwipeHandle
        >
          {children}
        </Drawer>
      ) : (
        <Dialog
          open={open}
          onOpenChange={(next, details) => onOpenChange(next, details.reason)}
          onOpenChangeComplete={(isOpen) => {
            if (!isOpen) restoreFocusToPageHeading();
          }}
        >
          {children}
        </Dialog>
      )}
    </ResponsiveOverlayContext.Provider>
  );
}

type ResponsiveOverlayContentProps = {
  /** `auto` sizes to content; `expanded` fills almost the whole phone viewport. */
  size?: "auto" | "expanded";
  className?: string;
  /** Desktop dialog classes, e.g. a max width. */
  dialogClassName?: string;
  initialFocus?: DrawerPrimitive.Popup.Props["initialFocus"];
  children: React.ReactNode;
};

function ResponsiveOverlayContent({
  size = "auto",
  className,
  dialogClassName,
  initialFocus,
  children,
}: ResponsiveOverlayContentProps) {
  const { compact } = useResponsiveOverlay();

  if (!compact) {
    return (
      <DialogContent
        initialFocus={initialFocus}
        className={cn(className, dialogClassName)}
      >
        {children}
      </DialogContent>
    );
  }

  return (
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerContent
        data-size={size}
        initialFocus={initialFocus}
        className={cn(
          "data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)]",
          size === "expanded" &&
            "[--drawer-content-height:calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)]",
          className,
        )}
      >
        {children}
      </DrawerContent>
    </DrawerPrimitive.VirtualKeyboardProvider>
  );
}

function ResponsiveOverlayHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  const { compact } = useResponsiveOverlay();
  return compact ? (
    <DrawerHeader
      className={cn(
        "pb-2 group-data-[swipe-axis=y]/drawer-popup:text-left",
        className,
      )}
      {...props}
    />
  ) : (
    <DialogHeader className={className} {...props} />
  );
}

function ResponsiveOverlayTitle({
  className,
  ...props
}: ComponentProps<typeof DialogTitle>) {
  const { compact } = useResponsiveOverlay();
  // Titles may receive programmatic initial focus; they are not interactive.
  return compact ? (
    <DrawerTitle className={cn("outline-none", className)} {...props} />
  ) : (
    <DialogTitle className={cn("outline-none", className)} {...props} />
  );
}

function ResponsiveOverlayDescription({
  className,
  ...props
}: ComponentProps<typeof DialogDescription>) {
  const { compact } = useResponsiveOverlay();
  return compact ? (
    <DrawerDescription className={cn("text-left", className)} {...props} />
  ) : (
    <DialogDescription className={className} {...props} />
  );
}

/**
 * Scrollable region between a fixed header and footer on phones. It is a
 * shrinkable flex item so long forms scroll inside the drawer instead of
 * pushing actions off-screen.
 */
function ResponsiveOverlayBody({ className, ...props }: ComponentProps<"div">) {
  const { compact } = useResponsiveOverlay();
  return (
    <div
      data-slot="overlay-body"
      className={cn(
        compact &&
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}

function ResponsiveOverlayFooter({
  className,
  onMouseDown,
  ...props
}: ComponentProps<"div">) {
  const { compact } = useResponsiveOverlay();
  return compact ? (
    <DrawerFooter
      className={cn(
        // VirtualKeyboardProvider publishes the software-keyboard height on the
        // drawer viewport; lifting the footer by it keeps Save reachable while
        // typing, and the scrolling body shrinks to make room.
        "mb-(--drawer-keyboard-inset,0px) grid auto-cols-fr grid-flow-col border-t pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
      onMouseDown={(event) => {
        // Pressing a footer button would otherwise move focus off the field,
        // dismiss the keyboard and drop the footer before the click lands, so
        // the first tap misses. Keeping focus put keeps the button in place.
        if ((event.target as Element).closest("button")) {
          event.preventDefault();
        }
        onMouseDown?.(event);
      }}
      {...props}
    />
  ) : (
    <DialogFooter
      className={className}
      onMouseDown={onMouseDown}
      {...props}
    />
  );
}

export {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  useResponsiveOverlay,
};
