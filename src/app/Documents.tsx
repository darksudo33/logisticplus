import React, { useState } from "react";
import { useAppDataStore, useMockStore } from "@/src/store/useMockStore";
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
  Archive,
  Eye,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Trash2
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
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { DOCUMENT_TYPE_ALL, DOCUMENT_TYPE_FILTERS, DOCUMENT_TYPE_OPTIONS, getDocumentTypeFilterValue, getDocumentTypeLabel } from "@/src/shared/document-types";
import { downloadBinaryFile } from "@/src/lib/downloads";

type ChatMediaAttachment = {
  id: string;
  messageId: string;
  threadId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  fileSize: string;
  attachmentType: "image" | "document";
  createdAt: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  downloadUrl?: string;
  previewUrl?: string;
  uploadedBy?: string;
  uploadedById?: string | null;
  threadType?: "DM" | "GROUP" | "SHIPMENT";
  threadName?: string;
  shipment?: {
    id: string;
    code: string;
    status?: string;
    customerName?: string;
    detailUrl?: string;
  } | null;
};

export default function Documents() {
  const navigate = useNavigate();
  const currentUser = useMockStore(state => state.currentUser);
  const canViewChatMedia = Boolean(currentUser?.permissions?.includes("chat.media.view"));
  const canDeleteChatMedia = Boolean(currentUser?.permissions?.includes("chat.media.delete"));
  const documents = useAppDataStore(state => state.documents);
  const shipments = useAppDataStore(state => state.shipments);
  const refreshDocumentRecords = useAppDataStore(state => state.refreshDocuments);

  const [activeSection, setActiveSection] = useState<"documents" | "chatMedia">("documents");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(DOCUMENT_TYPE_ALL);
  const [chatMediaTypeFilter, setChatMediaTypeFilter] = useState<"ALL" | "image" | "document">("ALL");
  const [chatMedia, setChatMedia] = useState<ChatMediaAttachment[]>([]);
  const [isChatMediaLoading, setIsChatMediaLoading] = useState(false);
  const [chatMediaError, setChatMediaError] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentToArchive, setDocumentToArchive] = useState<{ id: string; name: string } | null>(null);
  const [chatAttachmentToDelete, setChatAttachmentToDelete] = useState<ChatMediaAttachment | null>(null);
  const [newDoc, setNewDoc] = useState({
    name: "",
    type: "MISC" as DocumentType,
    shipmentId: "",
    note: "",
    visibility: "internal" as "internal" | "customer_visible"
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadChatMedia = React.useCallback(async () => {
    if (!canViewChatMedia) return;
    setIsChatMediaLoading(true);
    setChatMediaError("");
    try {
      const response = await fetch("/api/chat/media?includeDeleted=true&limit=100");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Could not load chat media.");
      }
      setChatMedia(payload.data || []);
    } catch (error: any) {
      setChatMediaError(error?.message || "Could not load chat media.");
    } finally {
      setIsChatMediaLoading(false);
    }
  }, [canViewChatMedia]);

  React.useEffect(() => {
    if (!canViewChatMedia && activeSection === "chatMedia") {
      setActiveSection("documents");
    }
  }, [activeSection, canViewChatMedia]);

  React.useEffect(() => {
    if (canViewChatMedia) void loadChatMedia();
  }, [canViewChatMedia, loadChatMedia]);

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
      const matchesType = typeFilter === DOCUMENT_TYPE_ALL || getDocumentTypeFilterValue(doc.type) === typeFilter;
      return isNotArchived && matchesSearch && matchesType;
    });
  }, [documents, searchTerm, typeFilter]);

  const filteredChatMedia = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return chatMedia.filter(item => {
      const matchesType = chatMediaTypeFilter === "ALL" || item.attachmentType === chatMediaTypeFilter;
      const searchable = [
        item.filename,
        item.uploadedBy,
        item.threadName,
        item.threadType,
        item.shipment?.code,
        item.shipment?.customerName,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      return matchesType && matchesSearch;
    });
  }, [chatMedia, chatMediaTypeFilter, searchTerm]);

  const resetDocumentFilters = () => {
    setSearchTerm("");
    setTypeFilter(DOCUMENT_TYPE_ALL);
    setChatMediaTypeFilter("ALL");
  };
  const activeDocs = documents.filter(doc => !doc.isArchived);
  const documentStats = [
    { label: "کل اسناد", value: activeDocs.length, icon: FileText, tone: "text-primary bg-primary/10" },
    { label: "متصل به محموله", value: activeDocs.filter(doc => doc.shipmentId).length, icon: Ship, tone: "text-blue-600 bg-blue-500/10" },
    { label: "انواع سند", value: new Set(activeDocs.map(doc => getDocumentTypeFilterValue(doc.type))).size, icon: FileIcon, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "آرشیو شده", value: documents.filter(doc => doc.isArchived).length, icon: Archive, tone: "text-amber-600 bg-amber-500/10" },
  ];
  const chatMediaStats = [
    { label: "رسانه‌های گفتگو", value: chatMedia.length, icon: MessageSquare, tone: "text-primary bg-primary/10" },
    { label: "تصاویر", value: chatMedia.filter(item => item.attachmentType === "image").length, icon: ImageIcon, tone: "text-blue-600 bg-blue-500/10" },
    { label: "فایل‌ها", value: chatMedia.filter(item => item.attachmentType === "document").length, icon: FileIcon, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "حذف‌شده", value: chatMedia.filter(item => item.deletedAt).length, icon: Archive, tone: "text-amber-600 bg-amber-500/10" },
  ];

  const refreshDocuments = async () => {
    await refreshDocumentRecords();
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
      if (newDoc.note.trim()) formData.append("note", newDoc.note.trim());
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
      setNewDoc({ name: "", type: "MISC", shipmentId: "", note: "", visibility: "internal" });
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
      throw new Error(payload.error?.message || "بایگانی سند ناموفق بود.");
    }
    await refreshDocuments();
    toast.success("سند با موفقیت بایگانی شد.");
    setDocumentToArchive(null);
  };

  const handleDeleteChatAttachment = async (attachment: ChatMediaAttachment) => {
    const response = await fetch(
      `/api/chat/messages/${encodeURIComponent(attachment.messageId)}/attachments/${encodeURIComponent(attachment.id)}`,
      { method: "DELETE" }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || "حذف فایل گفتگو ناموفق بود.");
    }
    await loadChatMedia();
    toast.success("فایل گفتگو حذف شد.");
    setChatAttachmentToDelete(null);
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

  const handleDownloadDocument = async (doc: { id: string; name: string; url?: string }) => {
    try {
      await downloadBinaryFile(doc.url || `/api/documents/${encodeURIComponent(doc.id)}/download`, doc.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document download failed.");
    }
  };

  const getChatThreadTypeLabel = (type?: string) => {
    if (type === "SHIPMENT") return "محموله";
    if (type === "DM") return "مستقیم";
    return "گروه";
  };

  const formatChatMediaDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
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
                    {DOCUMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
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
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">یادداشت سند</Label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                  placeholder="توضیح داخلی یا نکته مربوط به این سند..."
                  value={newDoc.note}
                  onChange={e => setNewDoc({ ...newDoc, note: e.target.value })}
                />
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

      {canViewChatMedia && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm" data-testid="documents-section-tabs">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-9 rounded-lg px-4 text-xs font-black", activeSection === "documents" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            onClick={() => setActiveSection("documents")}
            data-testid="documents-tab"
          >
            <FileText className="ml-2 h-4 w-4" />
            اسناد
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-9 rounded-lg px-4 text-xs font-black", activeSection === "chatMedia" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            onClick={() => setActiveSection("chatMedia")}
            data-testid="chat-media-tab"
          >
            <MessageSquare className="ml-2 h-4 w-4" />
            رسانه‌ها و فایل‌های گفتگو
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(activeSection === "chatMedia" ? chatMediaStats : documentStats).map((stat) => (
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

      {activeSection === "documents" ? (
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
            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end" data-testid="document-type-filters">
               {DOCUMENT_TYPE_FILTERS.map(filter => (
                 <Button 
                  key={filter.value}
                  variant="ghost" 
                  size="sm" 
                  className={cn("h-8 text-xs px-3 rounded-lg whitespace-nowrap", typeFilter === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setTypeFilter(filter.value)}
                 >
                   {filter.label}
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
                             <div className="min-w-0">
                               <span className="block truncate text-xs font-bold text-foreground">{doc.name}</span>
                               {doc.note ? (
                                <span className="mt-1 block max-w-64 truncate text-[10px] font-bold text-muted-foreground">{doc.note}</span>
                               ) : null}
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <Badge variant="outline" className="bg-muted/50 border-border text-[11px] px-2 py-0.5">
                             {getDocumentTypeLabel(doc.type)}
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
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleDownloadDocument(doc)}
                              aria-label={`Download ${doc.name}`}
                              title="Download document"
                             >
                              <Download className="w-4 h-4" />
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
                              onClick={() => setDocumentToArchive({ id: doc.id, name: doc.name })}
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
      ) : (
      <Card className="bg-card border-border rounded-xl shadow-sm overflow-hidden" data-testid="chat-media-library">
        <CardHeader className="border-b border-border/50 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجو در فایل‌های گفتگو..."
                className="h-10 rounded-xl border-border bg-background pr-10 text-xs"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
              {[
                { value: "ALL", label: "همه" },
                { value: "image", label: "تصاویر" },
                { value: "document", label: "فایل‌ها" },
              ].map(filter => (
                <Button
                  key={filter.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 rounded-lg px-4 text-xs", chatMediaTypeFilter === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setChatMediaTypeFilter(filter.value as typeof chatMediaTypeFilter)}
                >
                  {filter.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg px-4 text-xs"
                onClick={() => void loadChatMedia()}
                disabled={isChatMediaLoading}
              >
                {isChatMediaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "بروزرسانی"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-5">
          {chatMediaError && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
              {chatMediaError}
            </div>
          )}
          {isChatMediaLoading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : filteredChatMedia.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="فایلی در گفتگوها پیدا نشد"
              description="با تغییر جستجو یا فیلتر نوع فایل، رسانه‌های گفتگو را بررسی کنید."
              primaryAction={resetFiltersAction(resetDocumentFilters)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="chat-media-list">
              {filteredChatMedia.map(item => {
                const isDeleted = Boolean(item.deletedAt);
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-background p-3 shadow-sm" data-testid="chat-media-item">
                    <div className="flex min-w-0 items-start gap-3">
                      {item.attachmentType === "image" && item.previewUrl && !isDeleted ? (
                        <a href={item.previewUrl} target="_blank" rel="noreferrer" className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          <img src={item.previewUrl} alt={item.filename} className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                          {item.attachmentType === "image" ? <ImageIcon className="h-6 w-6" /> : <FileIcon className="h-6 w-6" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-md text-[10px]">
                            {item.attachmentType === "image" ? "تصویر" : "فایل"}
                          </Badge>
                          <Badge variant="secondary" className="rounded-md text-[10px]">
                            {getChatThreadTypeLabel(item.threadType)}
                          </Badge>
                          {isDeleted && (
                            <Badge variant="destructive" className="rounded-md text-[10px]">
                              حذف‌شده
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 truncate text-xs font-black text-foreground">{item.filename}</p>
                        <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                          {item.fileSize} · {item.uploadedBy || "کاربر"}
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                          {item.shipment?.code ? `محموله ${item.shipment.code}` : item.threadName || "گفتگوی داخلی"}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-muted-foreground">{formatChatMediaDate(item.createdAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
                      <div className="flex items-center gap-1">
                        {item.previewUrl && !isDeleted && (
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                            <a href={item.previewUrl} target="_blank" rel="noreferrer" aria-label="Preview chat media">
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {item.downloadUrl && !isDeleted && (
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                            <a href={item.downloadUrl} target="_blank" rel="noreferrer" aria-label="Download chat media">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {item.shipment?.detailUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => navigate(item.shipment?.detailUrl || "")}
                            aria-label="Open shipment"
                          >
                            <Ship className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {canDeleteChatMedia && !isDeleted && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-3 text-xs text-destructive hover:text-destructive"
                          onClick={() => setChatAttachmentToDelete(item)}
                        >
                          <Trash2 className="ml-1 h-4 w-4" />
                          حذف
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}
      <DeleteConfirmDialog
        isOpen={Boolean(documentToArchive)}
        onClose={() => setDocumentToArchive(null)}
        onConfirm={() => documentToArchive ? handleArchiveDoc(documentToArchive.id) : undefined}
        title="بایگانی سند"
        description="این سند از فهرست فعال خارج می‌شود و از بخش بایگانی قابل بازیابی خواهد بود."
        itemName={documentToArchive?.name}
        confirmLabel="انتقال به بایگانی"
        pendingLabel="در حال بایگانی..."
      />
      <DeleteConfirmDialog
        isOpen={Boolean(chatAttachmentToDelete)}
        onClose={() => setChatAttachmentToDelete(null)}
        onConfirm={() => chatAttachmentToDelete ? handleDeleteChatAttachment(chatAttachmentToDelete) : undefined}
        title="حذف فایل گفتگو"
        description="این فایل فقط از گفتگوی داخلی و کتابخانه رسانه گفتگو حذف می‌شود و اسناد رسمی محموله دست‌نخورده می‌مانند."
        itemName={chatAttachmentToDelete?.filename}
        confirmLabel="حذف فایل گفتگو"
        pendingLabel="در حال حذف..."
      />
    </div>
  );
}
