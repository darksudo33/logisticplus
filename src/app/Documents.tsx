import React, { useState } from "react";
import { useMockStore } from "@/src/store/useMockStore";
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  FileIcon, 
  Plus,
  Ship,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Archive
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DocumentType } from "../types";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";

export default function Documents() {
  const navigate = useNavigate();
  const documents = useMockStore(state => state.documents);
  const shipments = useMockStore(state => state.shipments);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({
    name: "",
    type: "OTHER" as DocumentType,
    shipmentId: "",
    visibility: "internal" as "internal" | "customer_visible"
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setNewDoc(prev => ({ ...prev, name: file.name }));
    }
  };

  const filteredDocs = React.useMemo(() => {
    return documents.filter(doc => {
      const isNotArchived = !doc.isArchived;
      const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "ALL" || doc.type === typeFilter;
      return isNotArchived && matchesSearch && matchesType;
    });
  }, [documents, searchTerm, typeFilter]);
  const resetDocumentFilters = () => {
    setSearchTerm("");
    setTypeFilter("ALL");
  };
  const activeDocs = documents.filter(doc => !doc.isArchived);
  const documentStats = [
    { label: "کل اسناد", value: activeDocs.length, icon: FileText, tone: "text-primary bg-primary/10" },
    { label: "متصل به محموله", value: activeDocs.filter(doc => doc.shipmentId).length, icon: Ship, tone: "text-blue-600 bg-blue-500/10" },
    { label: "انواع سند", value: new Set(activeDocs.map(doc => doc.type)).size, icon: FileIcon, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "آرشیو شده", value: documents.filter(doc => doc.isArchived).length, icon: Archive, tone: "text-amber-600 bg-amber-500/10" },
  ];

  const refreshDocuments = async () => {
    await loadCurrentUserRecords();
  };

  const handleAddDoc = async () => {
    if (!selectedFile || !newDoc.name) {
      toast.error("لطفا فایل و عنوان سند را انتخاب کنید.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", newDoc.name);
      formData.append("type", newDoc.type);
      formData.append("visibility", newDoc.visibility);
      if (newDoc.shipmentId) formData.append("shipmentId", newDoc.shipmentId);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Upload failed.");
      }
      await refreshDocuments();
      setIsAddDialogOpen(false);
      setSelectedFile(null);
      setNewDoc({ name: "", type: "OTHER", shipmentId: "", visibility: "internal" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("سند با موفقیت بارگذاری شد.");
    } catch (error: any) {
      toast.error(error?.message || "بارگذاری سند ناموفق بود.");
    } finally {
      setUploading(false);
    }
  };

  const handleArchiveDoc = async (id: string) => {
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}/archive`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      toast.error(payload.error?.message || "بایگانی سند ناموفق بود.");
      return;
    }
    await refreshDocuments();
    toast.success("سند با موفقیت بایگانی شد.");
  };

  const handleVisibilityChange = async (id: string, visibility: "internal" | "customer_visible") => {
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      toast.error(payload.error?.message || "تغییر دسترسی سند ناموفق بود.");
      return;
    }
    await refreshDocuments();
    toast.success("دسترسی سند بروزرسانی شد.");
  };

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      BILL_OF_LADING: "بارنامه",
      INVOICE: "فاکتور",
      PACKING_LIST: "لیست عدل‌بندی",
      CUSTOMS_PERMIT: "پروانه گمرکی",
      INSURANCE: "بیمه‌نامه",
      OTHER: "سایر"
    };
    return labels[type] || type;
  };

  return (
    <div className="app-page space-y-5 font-sans text-right" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 md:p-5 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground">مدیریت اسناد</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1 leading-6">آرشیو مرکزی تمام فایل‌ها و مدارک شرکت</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold h-10 px-5 rounded-xl shadow-sm gap-2">
                <Plus className="w-4 h-4" />
                افزودن سند جدید
              </Button>
            }
          />
          <DialogContent className="bg-popover border-border text-foreground text-right" dir="rtl">
            <DialogHeader>
              <DialogTitle>آپلود سند جدید</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-4">
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileChange}
                />
                <div 
                  className="border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-foreground">برای انتخاب فایل کلیک کنید</p>
                    <p className="text-[10px] text-muted-foreground mt-1">PDF, image, Word, Excel, CSV, TXT, RTF - max 25 MB</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">نام فایل انتخابی</Label>
                  <Input 
                    className="bg-muted border-border" 
                    placeholder="انتخاب فایل..."
                    value={newDoc.name}
                    onChange={e => setNewDoc({...newDoc, name: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">نوع سند</Label>
                  <select 
                    className="w-full bg-muted border-border rounded-md h-10 text-xs px-2"
                    value={newDoc.type}
                    onChange={e => setNewDoc({...newDoc, type: e.target.value as any})}
                  >
                    <option value="BILL_OF_LADING">بارنامه</option>
                    <option value="INVOICE">فاکتور</option>
                    <option value="PACKING_LIST">لیست عدل‌بندی</option>
                    <option value="CUSTOMS_PERMIT">پروانه گمرکی</option>
                    <option value="INSURANCE">بیمه‌نامه</option>
                    <option value="OTHER">سایر</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">اتصال به محموله (اختیاری)</Label>
                  <select 
                    className="w-full bg-muted border-border rounded-md h-10 text-xs px-2"
                    value={newDoc.shipmentId}
                    onChange={e => setNewDoc({...newDoc, shipmentId: e.target.value})}
                  >
                    <option value="">بدون اتصال</option>
                    {shipments.map(s => <option key={s.id} value={s.id}>{s.trackingNumber}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">نمایش برای مشتری</Label>
                <select
                  className="w-full bg-muted border-border rounded-md h-10 text-xs px-2"
                  value={newDoc.visibility}
                  onChange={e => setNewDoc({...newDoc, visibility: e.target.value as any})}
                >
                  <option value="internal">فقط داخلی</option>
                  <option value="customer_visible">قابل مشاهده برای مشتری</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={uploading} className="bg-primary text-primary-foreground w-full font-bold" onClick={handleAddDoc}>
                {uploading ? <ActionSkeleton inverted className="w-28" /> : "ذخیره سند"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {documentStats.map((stat) => (
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

      <Card className="bg-card border-border rounded-xl shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 p-4 md:p-5">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="جستجو در اسناد..." 
                className="bg-background border-border pr-10 text-xs h-10 rounded-xl"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
               <Button 
                variant="ghost" 
                size="sm" 
                className={cn("h-8 text-xs px-4 rounded-lg", typeFilter === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                onClick={() => setTypeFilter("ALL")}
               >
                 همه
               </Button>
               {["BILL_OF_LADING", "INVOICE", "PACKING_LIST", "CUSTOMS_PERMIT", "INSURANCE", "OTHER"].map(type => (
                 <Button 
                  key={type}
                  variant="ghost" 
                  size="sm" 
                  className={cn("h-8 text-xs px-4 rounded-lg whitespace-nowrap", typeFilter === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setTypeFilter(type)}
                 >
                   {getDocTypeLabel(type)}
                 </Button>
               ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-right">
             <thead className="bg-muted/50 border-b border-border/30">
                <tr>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">نام فایل</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">نوع</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">محموله مرتبط</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">حجم</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">توسط</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">تاریخ</th>
                   <th className="px-6 py-4 text-xs uppercase tracking-wide text-muted-foreground font-bold">عملیات</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-border/30">
                {filteredDocs.map(doc => {
                  const linkedShipment = shipments.find(s => s.id === doc.shipmentId);
                  return (
                    <tr key={doc.id} className="hover:bg-muted/20 transition-colors group">
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-primary">
                                <FileIcon className="w-4 h-4" />
                             </div>
                             <span className="text-xs font-bold text-foreground">{doc.name}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <Badge variant="outline" className="bg-muted/50 border-border text-[11px] px-2 py-0.5">
                             {getDocTypeLabel(doc.type)}
                          </Badge>
                       </td>
                       <td className="px-6 py-4">
                          {linkedShipment ? (
                             <Button 
                              variant="link" 
                              className="p-0 h-auto text-primary text-xs font-mono group-hover:underline"
                              onClick={() => navigate(`/shipments/${linkedShipment.id}`)}
                             >
                                <Ship className="w-3 h-3 ml-1" />
                                {linkedShipment.trackingNumber}
                             </Button>
                          ) : (
                             <span className="text-xs text-muted-foreground">---</span>
                          )}
                       </td>
                       <td className="px-6 py-4 text-[11px] text-muted-foreground">{doc.fileSize}</td>
                       <td className="px-6 py-4 text-xs text-foreground">{doc.uploadedBy}</td>
                       <td className="px-6 py-4 text-[11px] text-muted-foreground font-mono">{doc.createdAt}</td>
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-1 opacity-100 transition-opacity">
                             <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                             >
                              <a
                                href={doc.url || `/api/documents/${encodeURIComponent(doc.id)}/download`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Download ${doc.name}`}
                                title="Download document"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                             </Button>
                             <select
                              className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-muted-foreground"
                              value={doc.visibility || "internal"}
                              onChange={(event) => handleVisibilityChange(doc.id, event.target.value as any)}
                             >
                              <option value="internal">داخلی</option>
                              <option value="customer_visible">مشتری</option>
                             </select>
                             <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleArchiveDoc(doc.id)}
                              aria-label={`Archive ${doc.name}`}
                              title="Archive document"
                             >
                                <Archive className="w-4 h-4" />
                             </Button>
                          </div>
                       </td>
                    </tr>
                  );
                })}
             </tbody>
          </table>
          {filteredDocs.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={FileText}
                title={activeDocs.length === 0 ? "هنوز سندی بارگذاری نشده" : "سندی با این فیلترها پیدا نشد"}
                description={activeDocs.length === 0 ? "اولین سند عملیاتی را بارگذاری کنید و در صورت نیاز آن را به محموله وصل کنید." : "نوع سند یا عبارت جستجو را تغییر دهید تا اسناد موجود نمایش داده شوند."}
                primaryAction={activeDocs.length === 0 ? { label: "افزودن سند", onClick: () => setIsAddDialogOpen(true), icon: Plus } : resetFiltersAction(resetDocumentFilters)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
