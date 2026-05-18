import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  itemName?: string;
  confirmLabel?: string;
  pendingLabel?: string;
}

export const DeleteConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "تایید حذف",
  description = "آیا از حذف این مورد اطمینان دارید؟ این مورد به مدت ۷ روز در سطل زباله باقی می‌ماند و سپس به طور دائمی حذف خواهد شد.",
  itemName,
  confirmLabel = "تایید و انتقال به سطل زباله",
  pendingLabel = "در حال انتقال...",
}: DeleteConfirmDialogProps) => {
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (isOpen) setErrorMessage("");
  }, [isOpen]);

  const handleConfirm = async () => {
    if (isConfirming) return;
    setErrorMessage("");
    setIsConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "حذف ناموفق بود. دوباره تلاش کنید.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isConfirming) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border text-foreground rtl">
        <DialogHeader className="text-right">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle className="text-lg font-black">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground font-medium">
            {description}
            {itemName && (
              <span className="block mt-2 font-black text-foreground">
                مورد: {itemName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {errorMessage ? (
          <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-right text-xs font-bold text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter className="flex flex-row-reverse gap-2 mt-4">
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isConfirming}
            className="flex-1 font-black"
          >
            {isConfirming ? (
              <ActionSkeleton className="w-36 bg-destructive/25" />
            ) : (
              <>
                <Trash2 className="w-4 h-4 ml-2" />
                {confirmLabel}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isConfirming}
            className="flex-1 border-border hover:bg-accent text-muted-foreground font-bold"
          >
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
