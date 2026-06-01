import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ShipmentWorkflowProgress, ShipmentWorkflowStep } from "@/src/types";

type ShipmentProgressBlockerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: ShipmentWorkflowProgress | null | undefined;
  step?: ShipmentWorkflowStep | null;
  onSubmit: (body: Record<string, any>) => Promise<void>;
};

export function ShipmentProgressBlockerDialog({
  open,
  onOpenChange,
  progress,
  step,
  onSubmit,
}: ShipmentProgressBlockerDialogProps) {
  const blockers = progress?.definition.blockers || [];
  const [isSaving, setIsSaving] = React.useState(false);
  const [blockerCode, setBlockerCode] = React.useState(blockers[0]?.code || "");
  const [internalNote, setInternalNote] = React.useState("");
  const [publicNote, setPublicNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setBlockerCode(blockers[0]?.code || "");
    setInternalNote("");
    setPublicNote("");
  }, [open, blockers.length]);

  const submit = async () => {
    if (!blockerCode) return;
    setIsSaving(true);
    try {
      await onSubmit({
        stepCode: step?.code,
        blockerCode,
        internalNote,
        publicNote,
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
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            ثبت مانع گردش کار
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {step && (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-xs font-black text-muted-foreground">{step.code}</p>
              <p className="mt-1 text-sm font-black text-foreground">{step.labelFa}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">نوع مانع</Label>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={blockerCode}
              onChange={(event) => setBlockerCode(event.target.value)}
            >
              {blockers.map((blocker) => (
                <option key={blocker.code} value={blocker.code}>
                  {blocker.code} - {blocker.labelFa} / {blocker.labelEn}
                </option>
              ))}
            </select>
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
            <Label className="text-xs font-bold text-muted-foreground">پیام عمومی امن</Label>
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={publicNote}
              onChange={(event) => setPublicNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={isSaving || !blockerCode}>
            ثبت مانع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
