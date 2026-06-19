import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { 
  DndContext, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Calendar, 
  AlertCircle, 
  GripVertical, 
  Search, 
  Trash2, 
  Edit2, 
  Clock,
  User as UserIcon,
  Ship,
  TrendingUp,
  CheckCircle,
  Layout,
  Filter,
  Trash,
  History
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Task, TaskStatus } from "../types";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns-jalali";
import { motion, AnimatePresence } from "motion/react";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { toast } from "sonner";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";
import { getShamsiDatePart, getTehranTimePart, ShamsiDateTimeField } from "@/src/components/ShamsiDateTimeField";
import { TaskAssignmentHistory } from "@/src/components/tasks/TaskAssignmentHistory";
import type { TaskEvent } from "@/src/types";

const PriorityBadge = ({ priority }: { priority: string }) => {
  const styles: Record<string, string> = {
    LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    URGENT: "bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
  };
  const labels: Record<string, string> = {
    LOW: "عادی",
    MEDIUM: "متوسط",
    HIGH: "مهم",
    URGENT: "فوری",
  };
  return (
    <Badge variant="outline" className={cn(styles[priority] || "", "text-[11px] font-black px-2 py-0.5 h-5 border leading-none")}>
      {labels[priority] || priority}
    </Badge>
  );
};

function shipmentCustomerCode(shipment: any) {
  return shipment?.customerCode || shipment?.customerId || shipment?.customerName || "";
}

const TaskListItem = ({ 
  task, 
  onEdit, 
  onDelete,
  onStatusChange,
  onHistory,
}: { 
  task: Task, 
  onEdit: (task: Task) => void,
  onDelete: (id: string) => void,
  onStatusChange: (task: Task, status: TaskStatus) => void,
  onHistory: (task: Task) => void,
  key?: React.Key
}) => {
  const users = useAppStore(state => state.users);
  const shipments = useAppStore(state => state.shipments);
  
  const assignedUser = React.useMemo(() => users.find(u => u.id === task.assignedToUserId), [users, task.assignedToUserId]);
  const linkedShipment = React.useMemo(() => shipments.find(s => s.id === task.shipmentId), [shipments, task.shipmentId]);

  const statusConfig = {
    TODO: { label: "در انتظار", color: "text-muted-foreground bg-muted border-border" },
    ASSIGNED: { label: "ارجاع شده", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
    IN_PROGRESS: { label: "در حال انجام", color: "text-primary bg-primary/10 border-primary/20" },
    WAITING: { label: "در انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
    DONE: { label: "تکمیل شده", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" }
  };

  const extendedStatusConfig = {
    ...statusConfig,
    BLOCKED: { label: "مسدود", color: "text-rose-600 bg-rose-500/10 border-rose-500/20" },
    CANCELLED: { label: "لغو شده", color: "text-slate-500 bg-slate-100 border-slate-300" }
  };

  const config = extendedStatusConfig[task.status] || extendedStatusConfig.TODO;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="group"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-card border border-border hover:border-primary/30 hover:bg-muted/40 p-4 rounded-xl transition-all shadow-sm">
        {/* Title & Description Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h4 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {task.title}
            </h4>
            <Badge variant="outline" className={cn("text-[11px] font-black px-2 py-0.5 h-5 border leading-none shrink-0", config.color)}>
              {config.label}
            </Badge>
          </div>
          {task.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 opacity-80 leading-relaxed font-medium">
              {task.description}
            </p>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 lg:flex lg:items-center gap-4 lg:gap-8 shrink-0">
          {/* Shipment Link */}
          {linkedShipment && (
            <div className="flex flex-col lg:w-24">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">رهگیری بار</span>
              <div className="flex items-center gap-1.5 text-primary">
                <Ship className="w-3 h-3" />
                <span className="text-xs font-bold font-mono">{linkedShipment.trackingNumber}</span>
              </div>
            </div>
          )}

          {/* Priority */}
          <div className="flex flex-col lg:w-20">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">اولویت</span>
            <PriorityBadge priority={task.priority} />
          </div>

          {/* Assigned User */}
          <div className="flex flex-col lg:w-32">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">مسئول</span>
            <div className="flex items-center gap-2">
              <Avatar className="w-5 h-5 border border-border/50">
                <AvatarImage src={assignedUser?.avatar} />
                <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                  {assignedUser?.name?.[0] || '؟'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-bold text-foreground truncate">{assignedUser?.name || "بدون مشخص"}</span>
            </div>
          </div>

          {/* Deadline */}
          <div className="flex flex-col lg:w-28">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">مهلت نهایی</span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span className="text-xs font-mono font-bold tracking-tight">{task.dueDate}</span>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-1.5 text-rose-500">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs font-bold tracking-tight">{task.deadline}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 justify-end">
            {task.status !== "DONE" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                onClick={() => onStatusChange(task, "DONE")}
              >
                <CheckCircle className="w-4 h-4" />
              </Button>
            )}
            {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => onStatusChange(task, "IN_PROGRESS")}
              >
                <Clock className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => onHistory(task)}
            >
              <History className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => onEdit(task)}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function Tasks() {
  const allTasks = useAppStore(state => state.tasks);
  const currentUser = useAppStore(state => state.currentUser);
  const softDelete = useAppStore(state => state.softDelete);
  const users = useAppStore(state => state.users);
  const shipments = useAppStore(state => state.shipments);
  const organizationMembers = useAppStore(state => state.organizationMembers);
  const refreshTasks = useAppStore(state => state.refreshTasks);
  const fetchOrganizationMembers = useAppStore(state => state.fetchOrganizationMembers);
  const updateTaskStatusRemote = useAppStore(state => state.updateTaskStatusRemote);
  const fetchTaskEvents = useAppStore(state => state.fetchTaskEvents);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [taskScope, setTaskScope] = useState<"all" | "assignedToMe" | "assignedByMe" | "overdue" | "shipment" | "blocked">("all");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [historyEvents, setHistoryEvents] = useState<TaskEvent[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as const,
    assignedToUserId: "",
    dueDate: "",
    deadline: "",
    status: "TODO" as TaskStatus,
    shipmentId: ""
  });

  useEffect(() => {
    refreshTasks().catch((error) => {
      console.error("Could not refresh tasks.", error);
    });
    fetchOrganizationMembers().catch((error) => {
      console.error("Could not load organization members.", error);
    });
  }, [refreshTasks, fetchOrganizationMembers]);

  const assigneeOptions = useMemo(() => {
    if (organizationMembers.length) {
      return organizationMembers
        .filter((member) => member.active)
        .map((member) => ({
          id: member.userId,
          name: member.displayName,
          role: member.roleName,
        }));
    }
    return users.map((user) => ({ id: user.id, name: user.name, role: user.role }));
  }, [organizationMembers, users]);

  const isTaskOverdue = (task: Task) => {
    if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED") return false;
    const parsed = new Date(String(task.dueDate).replace(/\//g, "-"));
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() < Date.now();
  };

  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;
      const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchesScope =
        taskScope === "all" ||
        (taskScope === "assignedToMe" && t.assignedToUserId === currentUser?.id) ||
        (taskScope === "assignedByMe" && t.assignedByUserId === currentUser?.id) ||
        (taskScope === "overdue" && isTaskOverdue(t)) ||
        (taskScope === "shipment" && Boolean(t.shipmentId)) ||
        (taskScope === "blocked" && t.status === "BLOCKED");
      return matchesSearch && matchesPriority && matchesStatus && matchesScope;
    });
  }, [allTasks, searchTerm, priorityFilter, statusFilter, taskScope, currentUser?.id]);
  const resetTaskFilters = () => {
    setSearchTerm("");
    setPriorityFilter("ALL");
    setStatusFilter("ALL");
    setTaskScope("all");
  };

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      priority: "MEDIUM",
      assignedToUserId: assigneeOptions[0]?.id || "",
      dueDate: format(addDays(new Date(), 15), "yyyy/MM/dd"),
      deadline: "09:00",
      status: "TODO",
      shipmentId: ""
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      priority: task.priority as any,
      assignedToUserId: task.assignedToUserId || "",
      dueDate: getShamsiDatePart(task.dueDate) || "",
      deadline: task.deadline || getTehranTimePart(task.dueDate),
      status: task.status,
      shipmentId: task.shipmentId || ""
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title) return;
    const assignedUser = assigneeOptions.find(u => u.id === formData.assignedToUserId);
    const finalData = {
      ...formData,
      assignedToName: assignedUser?.name || "",
      assignedByName: "مدیر سیستم"
    };
    try {
      const response = await fetch(editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks", {
        method: editingTask ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Could not save task.");
      }
      await refreshTasks();
      toast.success(editingTask ? "Task updated" : "Task created");
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task.");
    }
  };

  const handleTaskStatusChange = async (task: Task, status: TaskStatus) => {
    try {
      await updateTaskStatusRemote(task.id, { status });
      await refreshTasks();
      toast.success("Task status updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update task status.");
    }
  };

  const handleOpenHistory = async (task: Task) => {
    setHistoryTask(task);
    setHistoryEvents([]);
    setIsHistoryLoading(true);
    try {
      const events = await fetchTaskEvents(task.id);
      setHistoryEvents(events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load task history.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const stats = [
    { label: "کل فعالیت‌ها", value: allTasks.length, icon: Layout, color: "text-muted-foreground", bg: "bg-muted" },
    { label: "در جریان", value: allTasks.filter(t => t.status === "IN_PROGRESS").length, icon: TrendingUp, color: "text-primary", bg: "bg-primary/5" },
    { label: "تکمیل شده", value: allTasks.filter(t => t.status === "DONE").length, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/5" },
    { label: "اولویت بالا", value: allTasks.filter(t => t.priority === "HIGH" || t.priority === "URGENT").length, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-500/5" },
  ];

  return (
    <div className="app-page min-h-full flex flex-col gap-5 font-sans" dir="rtl">
      {/* Header & Stats Dashboard */}
      <div className="flex flex-col gap-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 md:p-5 shadow-sm">
          <div className="space-y-1.5">
            <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">لیست وظایف عملیاتی</h1>
            <p className="text-muted-foreground text-xs md:text-sm font-medium">پایش و مدیریت هوشمند تمام وظایف پرسنل در یک نگاه.</p>
          </div>
          <Button data-testid="open-task-dialog" onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-10 px-5 rounded-xl shadow-sm transition-all active:scale-95 text-xs">
            <Plus className="w-5 h-5 ml-2 stroke-[3]" />
            ثبت فعالیت جدید
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
            >
              <Card className="bg-card border-border rounded-xl p-4 relative overflow-hidden group hover:bg-muted/40 transition-all shadow-sm">
                <div className={cn("absolute -right-4 -bottom-4 opacity-5 scale-150 transition-all group-hover:scale-125 group-hover:rotate-12", stat.color)}>
                  <stat.icon className="w-20 h-20" />
                </div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className={cn("p-2.5 rounded-2xl", stat.bg)}>
                    <stat.icon className={cn("w-5 h-5", stat.color)} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-black text-foreground">{stat.value}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 shrink-0 px-1">
        <div className="relative flex-1 group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="جستجوی در عنوان یا شرح وظایف..." 
            className="bg-card border-border h-12 pr-12 focus:ring-2 focus:ring-primary/20 rounded-2xl w-full text-sm" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-card p-1.5 rounded-xl border border-border shadow-sm">
          <div className="flex gap-1 border-l border-border pl-2">
            {[
              { id: "ALL", label: "همه وضعیت‌ها" },
              { id: "TODO", label: "در انتظار" },
              { id: "ASSIGNED", label: "ارجاع شده" },
              { id: "IN_PROGRESS", label: "در حال انجام" },
              { id: "WAITING", label: "در انتظار" },
              { id: "DONE", label: "تکمیل شده" }
            ].concat([
              { id: "BLOCKED", label: "مسدود" },
              { id: "CANCELLED", label: "لغو شده" }
            ]).map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id as any)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                  statusFilter === s.id 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mr-auto">
            {["ALL", "LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                  priorityFilter === p 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "ALL" ? "همه اولویت‌ها" : p === "LOW" ? "عادی" : p === "MEDIUM" ? "متوسط" : p === "HIGH" ? "مهم" : "فوری"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
        {[
          { id: "all", label: "همه وظایف" },
          { id: "assignedToMe", label: "وظایف ارجاع شده به من" },
          { id: "assignedByMe", label: "وظایفی که من ارجاع داده‌ام" },
          { id: "overdue", label: "وظایف عقب‌افتاده" },
          { id: "shipment", label: "وظایف مرتبط با محموله" },
          { id: "blocked", label: "وظایف مسدود" },
        ].map((scope) => (
          <button
            key={scope.id}
            onClick={() => setTaskScope(scope.id as typeof taskScope)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-black transition-colors",
              taskScope === scope.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {scope.label}
          </button>
        ))}
      </div>

      {/* Task List Content */}
      <div className="flex-1">
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {filteredTasks.length > 0 ? (
              filteredTasks.map(task => (
                <TaskListItem 
                  key={task.id} 
                  task={task} 
                  onEdit={handleEdit} 
                  onDelete={(id) => {
                    setTaskToDelete(id);
                    setIsDeleteDialogOpen(true);
                  }}
                  onStatusChange={handleTaskStatusChange}
                  onHistory={handleOpenHistory}
                />
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-card rounded-xl"
              >
                <EmptyState
                  icon={Layout}
                  title={allTasks.length === 0 ? "هنوز وظیفه‌ای تعریف نشده" : "وظیفه‌ای با این فیلترها پیدا نشد"}
                  description={allTasks.length === 0 ? "اولین فعالیت عملیاتی را برای پیگیری ترخیص، اسناد، تماس یا تحویل بسازید." : "وضعیت، اولویت یا عبارت جستجو را تغییر دهید تا وظایف موجود نمایش داده شوند."}
                  primaryAction={allTasks.length === 0 ? { label: "تعریف وظیفه جدید", onClick: handleOpenAdd, icon: Plus } : resetFiltersAction(resetTaskFilters)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>


      {/* Edit/Create Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-md rounded-xl p-5 md:p-6 shadow-lg max-h-[92vh] overflow-y-auto custom-scrollbar" dir="rtl">
          <DialogHeader className="mb-4 md:mb-6">
            <DialogTitle className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 bg-primary/10 rounded-xl md:rounded-2xl">
                {editingTask ? <Edit2 className="w-5 h-5 md:w-6 md:h-6 text-primary" /> : <Plus className="w-5 h-5 md:w-6 md:h-6 text-primary" />}
              </div>
              <div className="flex flex-col text-right">
                <span>{editingTask ? "ویرایش فعالیت" : "تعریف جدید"}</span>
                <span className="text-[11px] font-bold text-muted-foreground mt-0.5 md:mt-1 uppercase tracking-wide leading-none">Ops Management System</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 md:gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">عنوان فعالیت</Label>
              <Input 
                className="bg-background border-border h-10 md:h-12 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl md:rounded-2xl shadow-inner" 
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">توضیحات تکمیلی</Label>
              <textarea 
                className="w-full bg-background border-border border rounded-xl md:rounded-2xl p-4 text-sm min-h-[80px] md:min-h-[100px] outline-none focus:ring-1 focus:ring-primary/50 resize-none shadow-inner"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">اولویت</Label>
                <select 
                  className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: e.target.value as any})}
                >
                  <option value="LOW">عادی</option>
                  <option value="MEDIUM">متوسط</option>
                  <option value="HIGH">مهم</option>
                  <option value="URGENT">فوری</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">مسئول انجام</Label>
                <select 
                  className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                  value={formData.assignedToUserId}
                  onChange={e => setFormData({...formData, assignedToUserId: e.target.value})}
                >
                  {assigneeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <ShamsiDateTimeField
              label="تاریخ و ساعت ددلاین"
              date={formData.dueDate}
              time={formData.deadline}
              onDateChange={(dueDate) => setFormData((current) => ({ ...current, dueDate }))}
              onTimeChange={(deadline) => setFormData((current) => ({ ...current, deadline }))}
              triggerClassName="h-10 md:h-12 rounded-xl md:rounded-2xl text-sm"
            />

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">وضعیت کنونی</Label>
              <select 
                className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="TODO">در انتظار</option>
                <option value="ASSIGNED">ارجاع شده</option>
                <option value="IN_PROGRESS">در حال انجام</option>
                <option value="WAITING">در انتظار</option>
                <option value="BLOCKED">مسدود</option>
                <option value="DONE">تکمیل شده</option>
                <option value="CANCELLED">لغو شده</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">ارجاع به بارنامه</Label>
              <select 
                className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                value={formData.shipmentId}
                onChange={e => setFormData({...formData, shipmentId: e.target.value})}
              >
                <option value="">بدون ارجاع</option>
                {shipments.map(s => (
                  <option key={s.id} value={s.id}>{s.trackingNumber} - {shipmentCustomerCode(s)}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-6 md:mt-8">
            <Button variant="ghost" className="flex-1 text-muted-foreground hover:text-foreground h-10 md:h-12" onClick={() => setIsDialogOpen(false)}>انصراف</Button>
            <Button className="flex-[2] bg-primary text-primary-foreground font-black h-12 md:h-14 rounded-xl md:rounded-2xl shadow-xl shadow-primary/10" onClick={handleSubmit}>
              {editingTask ? "بروزرسانی نهایی" : "تایید و ثبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskAssignmentHistory
        open={Boolean(historyTask)}
        onOpenChange={(open) => {
          if (!open) setHistoryTask(null);
        }}
        taskTitle={historyTask?.title}
        events={historyEvents}
        isLoading={isHistoryLoading}
      />

      <DeleteConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (taskToDelete) {
            softDelete(taskToDelete, "TASK");
            toast.message("وظیفه به سطل زباله منتقل شد", {
              description: "می‌توانید تا ۷ روز آینده آن را از بخش بایگانی بازیابی کنید.",
              icon: <Trash className="w-4 h-4 text-red-500" />
            });
          }
        }}
        itemName={allTasks.find(t => t.id === taskToDelete)?.title}
      />
    </div>
  );
}
