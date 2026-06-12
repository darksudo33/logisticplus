import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Archive, 
  Ship, 
  CreditCard, 
  FileText, 
  Search, 
  ArrowLeft,
  Filter,
  Calendar,
  Layers,
  History,
  MoreVertical,
  RotateCcw,
  Trash2,
  ExternalLink,
  Trash
} from "lucide-react";
import { useMockStore } from "../store/useMockStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { QUOTATIONS_UI_ENABLED } from "@/src/config/features";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { differenceInDays, parseISO, addDays } from "date-fns-jalali";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";

export default function ArchivePage() {
  const { 
    shipments, 
    cheques, 
    documents, 
    deletedItems,
    restoreItem,
    permanentDelete,
    unarchiveShipment, 
    unarchiveCheque, 
    unarchiveDocument, 
    permanentDeleteShipment, 
    permanentDeleteCheque, 
    permanentDeleteDocument 
  } = useMockStore();
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  const [apiArchiveItems, setApiArchiveItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"archives" | "trash">("archives");

  const archivedShipments = shipments.filter(s => s.isArchived);
  const archivedCheques = cheques.filter(c => c.status === "ARCHIVED");
  const archivedDocuments = documents.filter(d => d.isArchived);
  const filterDisabledDeletedItems = (items: typeof deletedItems) =>
    QUOTATIONS_UI_ENABLED ? items : items.filter((item) => String(item.entityType || "").toUpperCase() !== "QUOTE");
  const visibleDeletedItems = filterDisabledDeletedItems(deletedItems);

  React.useEffect(() => {
    fetch("/api/archive")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok) {
          setApiArchiveItems((payload.data || []).filter((item: any) => (
            QUOTATIONS_UI_ENABLED || String(item.entityType || item.type || "").toLowerCase() !== "quotation"
          )));
        }
      })
      .catch(() => setApiArchiveItems([]));
  }, []);

  const restoreArchivedItem = async (item: any) => {
    const entityType = String(item.entityType || item.type || "").toLowerCase();
    const entityId = item.entityId || item.id;
    const response = await fetch(`/api/archive/${entityType}/${entityId}/restore`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || "Restore failed.");
    setApiArchiveItems((items) => items.filter((archiveItem) => archiveItem.id !== item.id));
    await loadCurrentUserRecords();
  };

  const deleteArchivedItem = async (item: any) => {
    const entityType = String(item.entityType || item.type || "").toLowerCase();
    const entityId = item.entityId || item.id;
    const response = await fetch(`/api/archive/${entityType}/${entityId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || "Delete failed.");
    setApiArchiveItems((items) => items.filter((archiveItem) => archiveItem.id !== item.id));
    await loadCurrentUserRecords();
  };

  const getFilteredItems = () => {
    const term = searchTerm.toLowerCase();
    
    if (viewMode === "archives") {
      if (apiArchiveItems.length) {
        return apiArchiveItems.filter(item =>
          `${item.title || ""} ${item.name || ""} ${item.customerName || ""} ${item.entityId || ""}`.toLowerCase().includes(term)
        );
      }
      const s = archivedShipments.filter(item => 
        item.trackingNumber.toLowerCase().includes(term) ||
        item.customerName.toLowerCase().includes(term)
      ).map(item => ({ ...item, type: "SHIPMENT" }));

      const c = archivedCheques.filter(item => 
        item.bankName.toLowerCase().includes(term) ||
        item.chequeNumber.includes(term)
      ).map(item => ({ ...item, type: "CHEQUE" }));

      const d = archivedDocuments.filter(item => 
        item.name.toLowerCase().includes(term)
      ).map(item => ({ ...item, type: "DOCUMENT" }));

      return [...s, ...c, ...d].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      return visibleDeletedItems
        .filter(item => {
          const itemData = item.data;
          const searchIn = (itemData.trackingNumber || itemData.name || itemData.bankName || "").toLowerCase();
          return searchIn.includes(term);
        })
        .map(item => {
          const deletionDate = parseISO(item.deletedAt);
          const expiryDate = addDays(deletionDate, 7);
          const daysLeft = Math.max(0, differenceInDays(expiryDate, new Date()));
          
          return {
            ...item.data,
            id: item.id,
            type: item.entityType,
            deletedAt: item.deletedAt,
            daysLeft,
            isFromTrash: true
          };
        })
        .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
    }
  };

  const filteredItems = getFilteredItems();
  const resetArchiveFilters = () => setSearchTerm("");
  const archiveStats = [
    { label: "کل آرشیو", value: archivedShipments.length + archivedCheques.length + archivedDocuments.length, icon: Archive, tone: "text-amber-600 bg-amber-500/10" },
    { label: "محموله‌ها", value: archivedShipments.length, icon: Ship, tone: "text-blue-600 bg-blue-500/10" },
    { label: "اسناد", value: archivedDocuments.length, icon: FileText, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "سطل زباله", value: visibleDeletedItems.length, icon: Trash2, tone: "text-red-600 bg-red-500/10" },
  ];

  return (
    <div className="app-page min-h-full text-foreground font-sans pb-20 space-y-5" dir="rtl">
      {/* 1. Hero Section */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 md:p-5 shadow-sm">
        <div className="absolute top-0 left-0 w-full h-full opacity-0 pointer-events-none">
          <div className={cn(
            "absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-all duration-500",
            viewMode === "archives" ? "bg-amber-500" : "bg-red-500"
          )} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto space-y-4">
          <motion.div 
            key={viewMode}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "p-3 rounded-xl border shadow-none w-fit mb-2 transition-all duration-500",
              viewMode === "archives" ? "bg-amber-500/10 border-amber-500/20 shadow-amber-500/5 text-amber-500" : "bg-red-500/10 border-red-500/20 shadow-red-500/5 text-red-500"
            )}
          >
            {viewMode === "archives" ? <Archive className="w-6 h-6" /> : <Trash className="w-6 h-6" />}
          </motion.div>

          <div className="space-y-4">
            <motion.h1 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-xl md:text-2xl font-black text-foreground leading-tight tracking-tight"
            >
              {viewMode === "archives" ? "بایگانی" : "سطل زباله"} <span className={viewMode === "archives" ? "text-amber-500" : "text-red-500"}>مرکزی</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground text-xs md:text-sm max-w-2xl font-medium leading-6"
            >
              {viewMode === "archives" 
                ? "مدیریت و دسترسی سریع به تمامی اطلاعات، چک‌ها و اسناد بایگانی شده" 
                : "آیتم‌های حذف شده به مدت ۷ روز نگهداری می‌شوند و سپس به طور خودکار حذف خواهند شد"}
            </motion.p>
          </div>

          <div className="flex flex-wrap justify-start gap-2">
            <Button 
              onClick={() => setViewMode("archives")}
              className={cn(
                "rounded-xl h-10 px-4 font-black gap-2 transition-all text-xs",
                viewMode === "archives" ? "bg-amber-500 text-black hover:bg-amber-600 shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Archive className="w-4 h-4" />
              آرشیو اسناد
            </Button>
            <Button 
              onClick={() => setViewMode("trash")}
              className={cn(
                "rounded-xl h-10 px-4 font-black gap-2 transition-all text-xs",
                viewMode === "trash" ? "bg-red-500 text-white hover:bg-red-600 shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Trash2 className="w-4 h-4" />
              سطل زباله
              {visibleDeletedItems.length > 0 && (
                <Badge className="bg-red-600 border-none mr-2">{visibleDeletedItems.length}</Badge>
              )}
            </Button>
          </div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="relative group w-full"
          >
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
            <Input 
              placeholder="جستجو در این لیست..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-background border-border h-11 rounded-xl pr-11 text-sm focus:ring-2 focus:ring-amber-500/20 transition-all font-bold placeholder:text-muted-foreground/60"
            />
          </motion.div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-1 md:px-0 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {archiveStats.map((stat) => (
            <Card key={stat.label} className="bg-card border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-black text-foreground mt-1">{stat.value}</p>
                </div>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.tone)}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-3 text-xs font-black text-muted-foreground px-4 py-2 bg-card rounded-xl border border-border shadow-sm">
            <History className="w-4 h-4 text-amber-500" />
            <span>تعداد موارد: {filteredItems.length}</span>
            <div className="w-1 h-1 bg-border rounded-full mx-1" />
            <span>نمایش: {viewMode === "archives" ? "بایگانی شده" : "حذف شده‌های موقت"}</span>
          </div>

          <div className="w-full">
            <div className="flex flex-col gap-4 pb-20">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item: any) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Card className="bg-card border-border hover:border-amber-500/30 transition-all rounded-xl overflow-hidden group shadow-sm flex items-center p-3 md:p-4 relative">
                      <div className={cn(
                        "absolute right-0 top-0 bottom-0 w-1.5",
                        viewMode === "trash" ? "bg-red-500/40" :
                        item.type === "SHIPMENT" ? "bg-amber-500/40" : 
                        item.type === "CHEQUE" ? "bg-emerald-500/40" : "bg-blue-500/40"
                      )} />
                      
                      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 flex-1 w-full">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-inner",
                          viewMode === "trash" ? "bg-red-500/5 border-red-500/10 text-red-500" :
                          item.type === "SHIPMENT" ? "bg-amber-500/5 border-amber-500/10 text-amber-500" :
                          item.type === "CHEQUE" ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-500" :
                          "bg-blue-500/5 border-blue-500/10 text-blue-500"
                        )}>
                          {item.type === "SHIPMENT" && <Ship className="w-6 h-6" />}
                          {item.type === "CHEQUE" && <CreditCard className="w-6 h-6" />}
                          {(item.type === "DOCUMENT" || item.type === "TASK") && <FileText className="w-6 h-6" />}
                        </div>

                        <div className="text-center md:text-right flex-1 min-w-0">
                          <h3 className="text-lg font-black text-foreground truncate flex items-center justify-center md:justify-start gap-3">
                            {item.trackingNumber || item.bankName || item.name || item.title}
                            <Badge variant="outline" className="hidden sm:inline-flex text-[11px] font-black border-border text-muted-foreground py-0 px-2 h-5">
                              {item.type === "SHIPMENT" ? "محموله" : item.type === "CHEQUE" ? "چک" : item.type === "TASK" ? "وظیفه" : "سند"}
                            </Badge>
                          </h3>
                          <p className="text-xs text-muted-foreground font-bold mt-1.5">
                            {item.customerName || `شناسه: ${item.id}`}
                          </p>
                        </div>

                        <div className="hidden lg:flex flex-row items-center gap-10 text-muted-foreground font-bold shrink-0">
                           {viewMode === "trash" ? (
                             <div className="flex flex-col items-center gap-1">
                               <span className="text-[11px] text-red-400 uppercase tracking-widest font-black">حذف خودکار در</span>
                               <span className="text-sm text-red-500 font-black">{item.daysLeft} روز</span>
                             </div>
                           ) : (
                             <div className="flex flex-col items-center gap-1">
                               <span className="text-[11px] text-muted-foreground/60 uppercase tracking-widest">تاریخ ثبت</span>
                               <span className="text-xs">{item.createdAt?.split('T')[0]}</span>
                             </div>
                           )}
                        </div>

                        <div className="flex items-center gap-2 border-t md:border-t-0 md:border-r border-border/50 pt-4 md:pt-0 md:pr-4 w-full md:w-auto justify-center md:justify-end">
                           {viewMode === "trash" ? (
                             <>
                               <Button 
                                 variant="ghost" 
                                 size="sm"
                                 className="h-10 px-4 rounded-2xl bg-emerald-500/10 text-emerald-500 font-black hover:bg-emerald-500 hover:text-white transition-all"
                                 onClick={() => {
                                   restoreItem(item.id);
                                   toast.success("مورد با موفقیت بازیابی شد");
                                 }}
                               >
                                 <RotateCcw className="w-4 h-4 ml-2" />
                                 بازیابی
                               </Button>
                               <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 className="h-10 w-10 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                 onClick={() => {
                                   if (window.confirm("حذف دائمی غیرقابل بازگشت است. ادامه می‌دهید؟")) {
                                     permanentDelete(item.id);
                                     toast.error("آیتم به طور کامل حذف شد");
                                   }
                                 }}
                               >
                                 <Trash2 className="w-5 h-5" />
                               </Button>
                             </>
                           ) : (
                             <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-10 w-10 rounded-2xl hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors" 
                                onClick={() => {
                                  if (item.entityType) restoreArchivedItem(item);
                                  else if (item.type === "SHIPMENT") unarchiveShipment(item.id);
                                  else if (item.type === "CHEQUE") unarchiveCheque(item.id, "CLEARED");
                                  else if (item.type === "DOCUMENT") unarchiveDocument(item.id);
                                  toast.success("مورد بازگردانی شد");
                                }}
                              >
                                <RotateCcw className="w-5 h-5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-10 w-10 rounded-2xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors" 
                                onClick={() => {
                                  if (!window.confirm("حذف دائمی غیرقابل بازگشت است؟")) return;
                                  const runDelete = item.entityType
                                    ? deleteArchivedItem(item)
                                    : Promise.resolve().then(() => {
                                        if (item.type === "SHIPMENT") permanentDeleteShipment(item.id);
                                        else if (item.type === "CHEQUE") permanentDeleteCheque(item.id);
                                        else if (item.type === "DOCUMENT") permanentDeleteDocument(item.id);
                                      });
                                  runDelete
                                    .then(() => toast.error("حذف شد"))
                                    .catch((error) => toast.error(error instanceof Error ? error.message : "حذف ناموفق بود"));
                                }}
                              >
                                <Trash2 className="w-5 h-5" />
                              </Button>
                             </>
                           )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {filteredItems.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-4"
              >
                <EmptyState
                  icon={viewMode === "archives" ? Archive : Trash2}
                  title={viewMode === "archives" ? "بایگانی هنوز خالی است" : "سطل زباله خالی است"}
                  description={searchTerm ? "عبارت جستجو را پاک کنید تا همه موارد موجود نمایش داده شوند." : "بعد از بایگانی یا حذف موقت رکوردها، موارد قابل بازیابی در این صفحه قرار می‌گیرند."}
                  primaryAction={searchTerm ? resetFiltersAction(resetArchiveFilters) : { label: "بازگشت به محموله‌ها", to: "/shipments", icon: Ship, variant: "outline" }}
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
