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
      </DialogContent>
    </Dialog>
  );
}
