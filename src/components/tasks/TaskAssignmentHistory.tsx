import React from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TaskEvent } from "@/src/types";

type TaskAssignmentHistoryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle?: string;
  events: TaskEvent[];
  isLoading?: boolean;
};

function eventLabel(eventType: string) {
  if (eventType === "task.created") return "ایجاد وظیفه";
  if (eventType === "task.reassigned") return "ارجاع مجدد";
  if (eventType === "task.status_changed") return "تغییر وضعیت";
  return eventType;
}

function formatEventDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function TaskAssignmentHistory({
  open,
  onOpenChange,
  taskTitle,
  events,
  isLoading = false,
}: TaskAssignmentHistoryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-right text-foreground sm:max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <History className="h-5 w-5 text-primary" />
            تاریخچه ارجاع
          </DialogTitle>
        </DialogHeader>
        {taskTitle && <p className="text-sm font-bold text-muted-foreground">{taskTitle}</p>}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          {isLoading ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm font-bold text-muted-foreground">در حال بارگذاری...</div>
          ) : events.length ? (
            events.map((event) => (
              <div key={event.id} className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                    {eventLabel(event.eventType)}
                  </Badge>
                  <span className="text-[11px] font-bold text-muted-foreground">{formatEventDate(event.createdAt)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  {event.actorName && <p>اقدام‌کننده: <span className="font-black">{event.actorName}</span></p>}
                  {(event.fromAssigneeName || event.toAssigneeName) && (
                    <p>
                      ارجاع: <span className="font-black">{event.fromAssigneeName || "ثبت نشده"}</span>
                      {" "}←{" "}
                      <span className="font-black">{event.toAssigneeName || "ثبت نشده"}</span>
                    </p>
                  )}
                  {(event.fromStatus || event.toStatus) && (
                    <p>
                      وضعیت: <span className="font-black">{event.fromStatus || "-"}</span>
                      {" "}←{" "}
                      <span className="font-black">{event.toStatus || "-"}</span>
                    </p>
                  )}
                  {event.workflowStepCode && <p>مرحله: <span className="font-black">{event.workflowStepCode}</span></p>}
                  {event.blockerCode && <p>مانع: <span className="font-black">{event.blockerCode}</span></p>}
                </div>
                {event.note && <p className="mt-2 rounded-lg bg-muted/50 p-2 text-xs font-medium leading-6 text-muted-foreground">{event.note}</p>}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm font-bold text-muted-foreground">
              هنوز تاریخچه‌ای برای این وظیفه ثبت نشده است.
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>بستن</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
