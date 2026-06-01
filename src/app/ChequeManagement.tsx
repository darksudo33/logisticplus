import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  CreditCard, 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  User, 
  Trash2, 
  Edit3, 
  Archive, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  Filter,
  ArrowLeft,
  DollarSign,
  Briefcase
} from "lucide-react";
import { format } from "date-fns-jalali";
import { useMockStore } from "@/src/store/useMockStore";
import { Cheque, ChequeStatus } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";
import { combineShamsiDateTime, parseShamsiDateTimeValue, ShamsiDateTimeField } from "@/src/components/ShamsiDateTimeField";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";

const statusMeta: Record<ChequeStatus, { label: string; color: string; bar: string }> = {
  ACTIVE: { label: "در جریان", color: "text-blue-600 border-blue-200 bg-blue-50", bar: "bg-blue-600" },
  CLEARED: { label: "پاس شده", color: "text-emerald-600 border-emerald-200 bg-emerald-50", bar: "bg-emerald-500" },
  RETURNED: { label: "برگشتی", color: "text-rose-600 border-rose-200 bg-rose-50", bar: "bg-rose-500" },
  ARCHIVED: { label: "بایگانی", color: "text-slate-500 border-slate-200 bg-slate-50", bar: "bg-slate-300" },
};

// Reuse the timer component pattern
const ChequeTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const calculate = () => {
      try {
        const targetTime = parseShamsiDateTimeValue(targetDate)?.getTime() || 0;
        const nowTime = new Date().getTime();
        setTimeLeft(Math.max(0, Math.floor((targetTime - nowTime) / 1000)));
      } catch (e) {
        setTimeLeft(0);
      }
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft <= 0) return <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-100 text-[10px] font-black">زمان سپری شده</Badge>;

  const days = Math.floor(timeLeft / (24 * 3600));
  const hours = Math.floor((timeLeft % (24 * 3600)) / 3600);

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
      <Clock className="w-3 h-3" />
      <span>{days} روز و {hours} ساعت تا موعد</span>
    </div>
  );
};

export default function ChequeManagement() {
  const { cheques, loadCurrentUserRecords } = useMockStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<ChequeStatus | "ALL">("ALL");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);
  const [chequeToArchive, setChequeToArchive] = useState<Cheque | null>(null);

  const [formData, setFormData] = useState({
    bankName: "",
    chequeNumber: "",
    amount: "",
    dueDate: combineShamsiDateTime(format(new Date(), "yyyy/MM/dd")),
    location: "",
    receiver: "",
    status: "ACTIVE" as ChequeStatus,
    description: ""
  });

  const filteredCheques = cheques.filter(c => {
    const matchesSearch = 
      c.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.chequeNumber.includes(searchTerm) ||
      c.receiver.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === "ALL" ? c.status !== "ARCHIVED" : c.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });
  const resetChequeFilters = () => {
    setSearchTerm("");
    setFilterStatus("ALL");
  };

  const chequeStats = React.useMemo(() => {
    const activeCheques = cheques.filter(c => c.status === "ACTIVE");
    const currentMonth = format(new Date(), "yyyy/MM");
    const currentMonthDue = cheques.filter(c => c.status !== "ARCHIVED" && c.dueDate.startsWith(currentMonth)).length;
    const activeAmount = activeCheques.reduce((acc, c) => acc + c.amount, 0);
    const returned = cheques.filter(c => c.status === "RETURNED").length;

    return [
      { label: "چک های در جریان", val: activeCheques.length, helper: "نیازمند پایش سررسید", icon: CreditCard, tone: "blue" },
      { label: "سررسید ماه جاری", val: currentMonthDue, helper: currentMonth, icon: CalendarIcon, tone: "amber" },
      { label: "مبلغ در جریان", val: `${(activeAmount / 1000000).toLocaleString()} م`, helper: "میلیون ریال", icon: DollarSign, tone: "emerald" },
      { label: "چک های برگشتی", val: returned, helper: "نیازمند پیگیری فوری", icon: AlertCircle, tone: "rose" },
    ];
  }, [cheques]);

  const handleOpenAdd = () => {
    setEditingCheque(null);
    setFormData({
      bankName: "",
      chequeNumber: "",
      amount: "",
      dueDate: combineShamsiDateTime(format(new Date(), "yyyy/MM/dd")),
      location: "",
      receiver: "",
      status: "ACTIVE",
      description: ""
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (chq: Cheque) => {
    setEditingCheque(chq);
    setFormData({
      bankName: chq.bankName,
      chequeNumber: chq.chequeNumber,
      amount: chq.amount.toString(),
      dueDate: chq.dueDate,
      location: chq.location,
      receiver: chq.receiver,
      status: chq.status,
      description: chq.description || ""
    });
    setIsDialogOpen(true);
  };

  const saveCheque = async (url: string, options: RequestInit) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || "Cheque request failed.");
    }
    await loadCurrentUserRecords();
    return payload?.data;
  };

  const handleSubmit = async () => {
    if (!formData.bankName || !formData.chequeNumber || !formData.amount) {
      toast.error("لطفا فیلدهای ضروری را پر کنید.");
      return;
    }

    const data = {
      ...formData,
      amount: parseInt(formData.amount),
    };

    if (editingCheque) {
      await saveCheque(`/api/cheques/${editingCheque.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      toast.success("اطلاعات چک با موفقیت بروزرسانی شد.");
    } else {
      await saveCheque("/api/cheques", {
        method: "POST",
        body: JSON.stringify(data),
      });
      toast.success("چک جدید با موفقیت ثبت شد.");
    }

    setIsDialogOpen(false);
  };

  const handleArchiveCheque = async () => {
    if (!chequeToArchive) return;
    await saveCheque(`/api/cheques/${chequeToArchive.id}/archive`, { method: "POST" });
    toast.success("چک به بایگانی منتقل شد.");
    setChequeToArchive(null);
  };

  return (
    <div className="app-page space-y-5 min-h-full text-foreground font-sans pb-20" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight">مدیریت چک‌های صادره</h1>
              <p className="text-muted-foreground text-xs md:text-sm font-bold mt-1 leading-6">سامانه پایش سررسید، مکان فیزیکی و وضعیت بازگشت چک‌ها</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            data-testid="open-cheque-dialog"
            onClick={handleOpenAdd}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl h-11 px-5 shadow-sm shadow-primary/20 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5 ml-2" />
            ثبت چک جدید
          </Button>
        </div>
      </div>

      {/* Stats Quick Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {chequeStats.map((stat) => (
          <Card key={stat.label} className="bg-card border-border shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-black text-foreground">{stat.val}</p>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">{stat.helper}</p>
              </div>
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                stat.tone === "blue" && "bg-blue-50 text-blue-600",
                stat.tone === "amber" && "bg-amber-50 text-amber-600",
                stat.tone === "emerald" && "bg-emerald-50 text-emerald-600",
                stat.tone === "rose" && "bg-rose-50 text-rose-600"
              )}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content: Filter & List */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="relative flex-1 group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="جستجو در نام بانک، شماره چک، گیرنده یا محل نگهداری..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-muted border-border pr-11 h-11 rounded-xl text-sm focus:ring-1 focus:ring-primary/30 shadow-none"
            />
          </div>
          
          <div className="flex gap-3">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-full md:w-[190px] bg-muted border-border h-11 rounded-xl text-xs font-bold">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="فیلتر وضعیت" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-foreground">
                <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
                <SelectItem value="ACTIVE">در جریان (فعال)</SelectItem>
                <SelectItem value="CLEARED">پاس شده</SelectItem>
                <SelectItem value="RETURNED">منجر به برگشت</SelectItem>
                <SelectItem value="ARCHIVED">بایگانی شده</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {filteredCheques.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title={cheques.length === 0 ? "هنوز چکی ثبت نشده" : "چکی با این فیلترها پیدا نشد"}
                description={cheques.length === 0 ? "اولین چک صادره را ثبت کنید تا سررسیدها و وضعیت وصول در همین صفحه پیگیری شوند." : "عبارت جستجو یا وضعیت انتخاب‌شده را تغییر دهید."}
                primaryAction={cheques.length === 0 ? { label: "ثبت چک جدید", onClick: handleOpenAdd, icon: Plus } : resetFiltersAction(resetChequeFilters)}
              />
            ) : filteredCheques.map((chq) => (
              <motion.div
                key={chq.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="bg-card border-border hover:border-primary/30 transition-all rounded-xl overflow-hidden group shadow-sm flex items-center p-3 md:p-4 relative">
                  {/* Status Indicator Bar */}
                  <div className={cn(
                    "absolute right-0 top-0 bottom-0 w-1 md:w-1.5",
                    statusMeta[chq.status].bar
                  )} />
                  
                  <div className="flex items-center gap-3 md:gap-5 flex-1 w-full text-right overflow-hidden">
                    {/* Icon Container - Smaller on mobile */}
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-muted rounded-xl flex items-center justify-center text-primary border border-border shrink-0">
                      <Briefcase className="w-4 h-4 md:w-6 md:h-6" />
                    </div>

                    {/* Bank and Main Info */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm md:text-base font-black text-foreground group-hover:text-primary transition-colors truncate">
                          {chq.bankName}
                        </h3>
                        <div className="hidden md:block">
                          <Select 
                            value={chq.status} 
                            onValueChange={async (v) => {
                              await saveCheque(`/api/cheques/${chq.id}/status`, {
                                method: "POST",
                                body: JSON.stringify({ status: v as ChequeStatus }),
                              });
                              toast.success("وضعیت چک بروزرسانی شد.");
                            }}
                          >
                            <SelectTrigger className={cn(
                              "h-7 w-28 text-[9px] font-black px-2 py-0.5 rounded-lg border bg-transparent",
                              chq.status === "ACTIVE" && "text-blue-500 border-blue-500/20 hover:bg-blue-500/5",
                              chq.status === "CLEARED" && "text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/5",
                              chq.status === "RETURNED" && "text-rose-500 border-rose-500/20 hover:bg-rose-500/5",
                              chq.status === "ARCHIVED" && "text-muted-foreground border-border hover:bg-muted"
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border text-foreground">
                              <SelectItem value="ACTIVE">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                  <span>در جریان</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="CLEARED">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span>پاس شده</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="RETURNED">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                                  <span>برگشتی</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="ARCHIVED">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                                  <span>بایگانی</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[8px] md:text-xs text-muted-foreground font-bold truncate tracking-wider">ش.چک: {chq.chequeNumber}</p>
                        <div className="flex items-center gap-1 md:hidden">
                           <Clock className="w-2.5 h-2.5 text-amber-500" />
                           <span className="text-[8px] font-bold text-amber-500">{chq.dueDate}</span>
                        </div>
                      </div>
                    </div>

                    {/* Amount & Status (Mobile) */}
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                       <span className="text-[10px] md:text-lg font-black text-foreground">{chq.amount.toLocaleString()} <span className="text-[7px] md:text-xs font-medium text-muted-foreground/60">ریال</span></span>
                       <div className="md:hidden">
                          <Badge className={cn(
                            "text-[7px] font-black h-3.5 px-1 bg-transparent border",
                            chq.status === "ACTIVE" ? "text-primary border-primary/20" : 
                            chq.status === "CLEARED" ? "text-emerald-500 border-emerald-500/20" : 
                            chq.status === "RETURNED" ? "text-rose-500 border-rose-500/20" : "text-muted-foreground border-border"
                          )}>
                             {chq.status === "ACTIVE" ? "در جریان" : chq.status === "CLEARED" ? "پاس شده" : chq.status === "RETURNED" ? "برگشتی" : "بایگانی"}
                          </Badge>
                       </div>
                    </div>

                    {/* Due Date & Timer (Desktop) */}
                    <div className="hidden md:flex flex-col items-end gap-2 shrink-0 border-r border-border pr-4 w-40">
                        <div className="flex items-center gap-2">
                           <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                           <span className="text-xs font-mono font-bold text-muted-foreground">{chq.dueDate}</span>
                        </div>
                        {chq.status === "ACTIVE" && <ChequeTimer targetDate={chq.dueDate} />}
                        {chq.status === "CLEARED" && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-none text-[8px] font-black">تسویه شده</Badge>}
                        {chq.status === "RETURNED" && <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-none text-[8px] font-black">برگشت خورده</Badge>}
                    </div>

                    {/* Desktop Only Information */}
                    <div className="hidden lg:flex flex-row items-center gap-8 text-muted-foreground font-bold shrink-0">
                       <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
                         <span className="text-[8px] text-muted-foreground/60 uppercase tracking-widest">گیرنده</span>
                         <span className="text-[10px] truncate max-w-[80px]">{chq.receiver}</span>
                       </div>
                       <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
                         <span className="text-[8px] text-muted-foreground/60 uppercase tracking-widest">محل</span>
                         <span className="text-[10px] truncate max-w-[80px]">{chq.location}</span>
                       </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 md:gap-2 shrink-0 pr-1">
                      {(chq.status === "CLEARED" || chq.status === "RETURNED") && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-2xl hover:bg-amber-500/10 hover:text-amber-500" 
                          onClick={() => setChequeToArchive(chq)}
                          aria-label={`Archive cheque ${chq.id}`}
                          title="انتقال به بایگانی"
                        >
                          <Archive className="w-4 h-4 md:w-5 md:h-5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-2xl hover:bg-primary/10 hover:text-primary" onClick={() => handleOpenEdit(chq)}>
                         <Edit3 className="w-4 h-4 md:w-5 md:h-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-2xl hover:bg-rose-500/10 hover:text-rose-500" onClick={() => setChequeToArchive(chq)} aria-label={`Delete cheque ${chq.id}`} title="حذف / بایگانی چک">
                         <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-popover border-border text-foreground sm:max-w-xl rounded-2xl p-0 overflow-hidden shadow-xl flex flex-col max-h-[90vh]" dir="rtl">
          <DialogHeader className="p-5 md:p-6 border-b border-border shrink-0">
            <DialogTitle className="text-lg md:text-xl font-black flex items-center gap-3">
              <div className="p-2 md:p-3 bg-primary/10 rounded-xl shrink-0">
                {editingCheque ? <Edit3 className="w-5 h-5 md:w-6 md:h-6 text-primary" /> : <Plus className="w-5 h-5 md:w-6 md:h-6 text-primary" />}
              </div>
              <div className="flex flex-col text-right">
                <span>{editingCheque ? "ویرایش اطلاعات چک" : "ثبت چک جدید"}</span>
                <span className="text-[9px] md:text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest leading-none">Financial Control System</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">بانک صادرکننده</Label>
                <Input 
                  className="bg-muted border-border h-11 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl shadow-none" 
                  value={formData.bankName}
                  onChange={e => setFormData({...formData, bankName: e.target.value})}
                  placeholder="مثلا: بانک ملت شعبه مرکزی"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">شماره صیادی / چک</Label>
                <Input 
                  className="bg-muted border-border h-11 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl shadow-none font-mono text-center" 
                  value={formData.chequeNumber}
                  onChange={e => setFormData({...formData, chequeNumber: e.target.value})}
                  placeholder="12345/6789"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">مبلغ چک (ریال)</Label>
                <div className="relative">
                  <Input 
                    type="number"
                    className="bg-muted border-border h-11 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl shadow-none pl-12" 
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                  />
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <ShamsiDateTimeField
                  label="تاریخ و ساعت سررسید"
                  value={formData.dueDate}
                  onChange={(dueDate) => setFormData({ ...formData, dueDate })}
                  triggerClassName="bg-muted border-border h-11 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">محل نگهداری فیزیکی</Label>
                <Input 
                  className="bg-muted border-border h-11 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl shadow-none" 
                  value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  placeholder="مثلا: گاوصندوق شرکت هوپاد"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">در وجه / گیرنده</Label>
                <Input 
                  className="bg-muted border-border h-11 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl shadow-none" 
                  value={formData.receiver}
                  onChange={e => setFormData({...formData, receiver: e.target.value})}
                  placeholder="مثلا: سازمان بنادر و دریانوردی"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">وضعیت کنونی</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v as ChequeStatus})}>
                  <SelectTrigger className="bg-muted border-border h-11 rounded-xl shadow-none text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="ACTIVE">در جریان (فعال)</SelectItem>
                    <SelectItem value="CLEARED">پاس شده</SelectItem>
                    <SelectItem value="RETURNED">برگشت خورده</SelectItem>
                    <SelectItem value="ARCHIVED">بایگانی</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">توضیحات تکمیلی</Label>
                <textarea 
                  className="w-full bg-muted border border-border rounded-xl p-4 text-sm min-h-[100px] outline-none focus:ring-1 focus:ring-primary/50 resize-none shadow-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-5 md:p-6 border-t border-border bg-muted/50 gap-3 shrink-0 flex-row">
            <Button variant="ghost" className="flex-1 text-muted-foreground hover:text-foreground rounded-xl md:rounded-2xl h-12 md:h-14 font-bold" onClick={() => setIsDialogOpen(false)}>انصراف</Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-11 flex-[2] rounded-xl shadow-sm shadow-primary/10" onClick={handleSubmit}>
              {editingCheque ? "بروزرسانی" : "تایید و ثبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        isOpen={Boolean(chequeToArchive)}
        onClose={() => setChequeToArchive(null)}
        onConfirm={handleArchiveCheque}
        title="بایگانی چک"
        description="این چک از لیست فعال خارج می‌شود و در بخش بایگانی قابل بازیابی خواهد بود."
        itemName={chequeToArchive ? `${chequeToArchive.bankName} - ${chequeToArchive.chequeNumber}` : undefined}
        confirmLabel="انتقال به بایگانی"
        pendingLabel="در حال بایگانی..."
      />
    </div>
  );
}
