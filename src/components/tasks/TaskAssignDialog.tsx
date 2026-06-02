import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShamsiDateTimeField } from "@/src/components/ShamsiDateTimeField";
import type { OrganizationMemberOption, TaskPriority } from "@/src/types";

type TaskAssignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: OrganizationMemberOption[];
  title?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultAssignmentNote?: string;
  defaultPriority?: TaskPriority;
  defaultDueDate?: string;
  isMembersLoading?: boolean;
  membersError?: string;
  onRetryMembers?: () => Promise<void> | void;
  onSubmit: (body: Record<string, any>) => Promise<void>;
};

export function TaskAssignDialog({
  open,
  onOpenChange,
  members,
  title = "ارجاع وظیفه",
  defaultTitle = "",
  defaultDescription = "",
  defaultAssignmentNote = "",
  defaultPriority = "MEDIUM",
  defaultDueDate = "",
  isMembersLoading = false,
  membersError = "",
  onRetryMembers,
  onSubmit,
}: TaskAssignDialogProps) {
  const activeMembers = members.filter((member) => member.active);
  const [isSaving, setIsSaving] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [form, setForm] = React.useState({
    title: defaultTitle,
    description: defaultDescription,
    assignedToUserId: activeMembers[0]?.userId || "",
    priority: defaultPriority,
    dueDate: defaultDueDate,
    assignmentNote: defaultAssignmentNote,
  });
  const selectedMember = activeMembers.find((member) => member.userId === form.assignedToUserId);
  const selfAssignmentOnly = activeMembers.length === 1;

  React.useEffect(() => {
    if (!open) return;
    setSubmitError("");
    setForm({
      title: defaultTitle,
      description: defaultDescription,
      assignedToUserId: activeMembers[0]?.userId || "",
      priority: defaultPriority,
      dueDate: defaultDueDate,
      assignmentNote: defaultAssignmentNote,
    });
  }, [open, defaultTitle, defaultDescription, defaultAssignmentNote, defaultPriority, defaultDueDate, members.length]);

  const submit = async () => {
    if (!form.title.trim() || !form.assignedToUserId) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not assign task.");
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
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">عنوان وظیفه</Label>
            <Input data-testid="task-assign-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground">مسئول</Label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                data-testid="task-assign-assignee"
                value={form.assignedToUserId}
                onChange={(event) => setForm({ ...form, assignedToUserId: event.target.value })}
                disabled={isMembersLoading || !activeMembers.length}
              >
                {activeMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} - {member.roleName}
                  </option>
                ))}
              </select>
              {selfAssignmentOnly && (
                <p className="text-[11px] font-bold text-muted-foreground">این وظیفه برای خود شما ثبت می‌شود.</p>
              )}
              {isMembersLoading && <p className="text-[11px] font-bold text-muted-foreground">در حال دریافت لیست کارکنان...</p>}
              {!isMembersLoading && !activeMembers.length && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] font-bold leading-5 text-amber-800">
                  هیچ کارمند فعالی برای ارجاع یافت نشد.
                </div>
              )}
              {membersError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] font-bold leading-5 text-rose-700">
                  {membersError}
                  {onRetryMembers && (
                    <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 text-[11px]" onClick={() => onRetryMembers()}>
                      تلاش مجدد
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground">اولویت</Label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                data-testid="task-assign-priority"
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}
              >
                <option value="LOW">کم</option>
                <option value="MEDIUM">عادی</option>
                <option value="HIGH">بالا</option>
                <option value="URGENT">فوری</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <ShamsiDateTimeField
              label="مهلت"
              value={form.dueDate}
              onChange={(dueDate) => setForm({ ...form, dueDate })}
              triggerClassName="h-10 text-sm"
            />
            <input type="hidden" data-testid="task-assign-due-date" value={form.dueDate} readOnly />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">شرح وظیفه</Label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
              data-testid="task-assign-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground">یادداشت ارجاع</Label>
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
              data-testid="task-assign-note"
              value={form.assignmentNote}
              onChange={(event) => setForm({ ...form, assignmentNote: event.target.value })}
            />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] font-bold leading-6 text-muted-foreground">
            <p>
              {selfAssignmentOnly
                ? "این وظیفه برای خود شما ثبت می‌شود."
                : `مسئول: ${selectedMember?.displayName || "انتخاب نشده"}`}
            </p>
            <p>اولویت: {form.priority}{form.dueDate ? ` / مهلت: ${form.dueDate}` : ""}</p>
            {form.assignmentNote && <p>یادداشت: {form.assignmentNote}</p>}
          </div>
          {submitError && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-700">
              {submitError}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button data-testid="task-assign-submit" onClick={submit} disabled={isSaving || isMembersLoading || !activeMembers.length || !form.title.trim()}>
            ثبت ارجاع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
