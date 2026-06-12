import React from "react";
import { CalendarClock, CheckCircle2, Clock, ListTodo, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/src/types";

const statusLabels: Record<string, string> = {
  TODO: "باز",
  ASSIGNED: "ارجاع شده",
  IN_PROGRESS: "در حال انجام",
  WAITING: "در انتظار",
  BLOCKED: "مسدود",
  DONE: "انجام شده",
  CANCELLED: "لغو شده",
};

const statusClasses: Record<string, string> = {
  TODO: "border-border bg-muted text-muted-foreground",
  ASSIGNED: "border-blue-500/20 bg-blue-500/10 text-blue-600",
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  WAITING: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  BLOCKED: "border-rose-500/20 bg-rose-500/10 text-rose-600",
  DONE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-500",
};

type RelatedShipmentTasksPanelProps = {
  tasks: Task[];
  onCreateTask: () => void;
  onAssignTask: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void | Promise<void>;
};

export function RelatedShipmentTasksPanel({
  tasks,
  onCreateTask,
  onAssignTask,
  onStatusChange,
}: RelatedShipmentTasksPanelProps) {
  return (
    <Card className="rounded-2xl border-border/70 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 bg-muted/15 p-4">
        <CardTitle className="flex items-center gap-2 text-sm font-black">
          <ListTodo className="h-4 w-4 text-primary" />
          وظایف مرتبط با محموله
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px] font-bold" onClick={onCreateTask}>
          ارجاع وظیفه
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {tasks.length ? (
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/30"
              data-testid={`related-shipment-task-${task.id}`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-black text-foreground">{task.title}</h4>
                    <Badge variant="outline" className={cn("text-[10px]", statusClasses[task.status] || statusClasses.TODO)}>
                      {statusLabels[task.status] || task.status}
                    </Badge>
                    {task.workflowStepCode && (
                      <Badge variant="outline" className="border-slate-300 bg-muted text-[10px]">
                        مرحله {task.workflowStepCode}
                      </Badge>
                    )}
                    {task.blockerCode && (
                      <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-700">
                        مانع {task.blockerCode}
                      </Badge>
                    )}
                  </div>
                  {task.description && <p className="mt-1 line-clamp-2 text-xs font-medium leading-6 text-muted-foreground">{task.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserRound className="h-3 w-3" />
                      {task.assignedToName || "بدون مسئول"}
                    </span>
                    {task.dueDate && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {task.dueDate}
                      </span>
                    )}
                    {task.completedAt && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        تکمیل شده
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-[11px] font-bold"
                    data-testid={`related-task-reassign-${task.id}`}
                    onClick={() => onAssignTask(task)}
                  >
                    ارجاع مجدد
                  </Button>
                  {task.status !== "DONE" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 text-[11px] font-bold"
                      data-testid={`related-task-done-${task.id}`}
                      onClick={() => onStatusChange(task, "DONE")}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      انجام شد
                    </Button>
                  )}
                  {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 text-[11px] font-bold"
                      data-testid={`related-task-start-${task.id}`}
                      onClick={() => onStatusChange(task, "IN_PROGRESS")}
                    >
                      <Clock className="h-3 w-3" />
                      شروع
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
            <ListTodo className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-black text-foreground">هنوز وظیفه‌ای برای این محموله ثبت نشده است.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
