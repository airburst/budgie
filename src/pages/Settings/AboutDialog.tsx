import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs text-center">
        <DialogHeader>
          <DialogTitle>Budgie</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Version {__APP_VERSION__}
        </p>
        <div className="mt-2 border-t pt-3">
          <Button
            variant="link"
            className="h-auto px-0"
            onClick={() =>
              void window.api.openExternal(
                "https://github.com/airburst/budgie/blob/main/CHANGELOG.md",
              )
            }
          >
            See what's changed in this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
