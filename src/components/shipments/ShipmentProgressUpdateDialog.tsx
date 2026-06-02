import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ShipmentWorkflowStep } from "@/src/types";

type ShipmentProgressUpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: ShipmentWorkflowStep | null;
  mode: "current" | "complete" | "note";
  onSubmit: (body: Record<string, any>) => Promise<void>;
};

export function ShipmentProgressUpdateDialog({
  open,
  onOpenChange,
  step,
  mode,
  onSubmit,
}: ShipmentProgressUpdateDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [internalNote, setInternalNote] = React.useState("");
  const [publicNote, setPublicNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setInternalNote(step?.internalNote || "");
    setPublicNote(step?.publicNote || "");
  }, [open, step?.code]);

  const title =
    mode === "complete"
      ? "تکمیل مرحله"
      : mode === "note"
        ? "ثبت یادداشت مرحله"
        : "تنظیم مرحله فعال";

  const submit = async () => {
    if (!step) return;
    setIsSaving(true);
    try {
      await onSubmit({
        stepCode: step.code,
        status: mode === "complete" ? "completed" : mode === "current" ? "active" : undefined,
        internalNote,
        publicNote,
        publicVisible: Boolean(publicNote.trim()),
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-right text-foreground sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-black text-muted-foreground">{step?.code}</p>
            <p className="mt-1 text-sm font-black text-foreground">{step?.labelFa}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{step?.labelEn}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">یادداشت داخلی</Label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">یادداشت قابل نمایش برای مشتری</Label>
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={publicNote}
              onChange={(event) => setPublicNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={isSaving || !step}>
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
