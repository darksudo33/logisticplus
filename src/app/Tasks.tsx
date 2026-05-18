import React, { useState, useMemo } from "react";
import { useMockStore } from "../store/useMockStore";
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
  Trash
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

const TaskListItem = ({ 
  task, 
  onEdit, 
  onDelete 
}: { 
  task: Task, 
  onEdit: (task: Task) => void,
  onDelete: (id: string) => void,
  key?: React.Key
}) => {
  const users = useMockStore(state => state.users);
  const shipments = useMockStore(state => state.shipments);
  
  const assignedUser = React.useMemo(() => users.find(u => u.id === task.assignedToUserId), [users, task.assignedToUserId]);
  const linkedShipment = React.useMemo(() => shipments.find(s => s.id === task.shipmentId), [shipments, task.shipmentId]);

  const statusConfig = {
    TODO: { label: "در انتظار", color: "text-muted-foreground bg-muted border-border" },
    IN_PROGRESS: { label: "در حال انجام", color: "text-primary bg-primary/10 border-primary/20" },
    DONE: { label: "تکمیل شده", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" }
  };

  const extendedStatusConfig = {
    ...statusConfig,
    BLOCKED: { label: "Blocked", color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
    CANCELLED: { label: "Cancelled", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" }
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
  const allTasks = useMockStore(state => state.tasks);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  const softDelete = useMockStore(state => state.softDelete);
  const users = useMockStore(state => state.users);
  const shipments = useMockStore(state => state.shipments);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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

  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;
      const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [allTasks, searchTerm, priorityFilter, statusFilter]);
  const resetTaskFilters = () => {
    setSearchTerm("");
    setPriorityFilter("ALL");
    setStatusFilter("ALL");
  };

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      priority: "MEDIUM",
      assignedToUserId: users[0]?.id || "",
      dueDate: format(addDays(new Date(), 15), "yyyy/MM/dd"),
      deadline: "12:00",
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
      dueDate: task.dueDate || "",
      deadline: task.deadline || "",
      status: task.status,
      shipmentId: task.shipmentId || ""
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title) return;
    const assignedUser = users.find(u => u.id === formData.assignedToUserId);
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
      await loadCurrentUserRecords();
      toast.success(editingTask ? "Task updated" : "Task created");
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task.");
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
          <Button onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-10 px-5 rounded-xl shadow-sm transition-all active:scale-95 text-xs">
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
              { id: "IN_PROGRESS", label: "در حال انجام" },
              { id: "DONE", label: "تکمیل شده" }
            ].concat([
              { id: "BLOCKED", label: "Blocked" },
              { id: "CANCELLED", label: "Cancelled" }
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
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">تاریخ ددلاین</Label>
                <Input 
                  className="bg-background border-border h-10 md:h-12 text-sm rounded-xl md:rounded-2xl shadow-inner" 
                  value={formData.dueDate}
                  onChange={e => setFormData({...formData, dueDate: e.target.value})}
                  placeholder="۱۴۰۳/۰۵/۱۵"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">ساعت دقیق</Label>
                <Input 
                  className="bg-background border-border h-10 md:h-12 text-sm rounded-xl md:rounded-2xl shadow-inner" 
                  value={formData.deadline}
                  onChange={e => setFormData({...formData, deadline: e.target.value})}
                  placeholder="۱۲:۰۰"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">وضعیت کنونی</Label>
              <select 
                className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="TODO">در انتظار</option>
                <option value="IN_PROGRESS">در حال انجام</option>
                <option value="DONE">تکمیل شده</option>
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
                  <option key={s.id} value={s.id}>{s.trackingNumber} - {s.customerName}</option>
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
