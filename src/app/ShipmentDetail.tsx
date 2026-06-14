import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useAppDataStore, useMockStore } from "@/src/store/useMockStore";
import { 
  ArrowRight, 
  Ship, 
  MapPin, 
  Calendar, 
  UserPlus, 
  Users,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  Info,
  Package,
  Anchor,
  FileText,
  Download,
  Trash2,
  Archive,
  ArchiveRestore,
  FileIcon,
  Plus,
  Search,
  FilePlus,
  FileCheck,
  ExternalLink,
  ChevronLeft,
  Edit,
  Settings,
  X,
  Check,
  Copy,
  Link2,
  RefreshCw,
  Save,
  ShieldCheck,
  EyeOff,
  Loader2,
  MessageSquare,
  Send
} from "lucide-react";
import { format, addDays } from "date-fns-jalali";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { downloadBinaryFile } from "@/src/lib/downloads";
import { shipmentApi, type PostExitStatus } from "@/src/lib/shipmentApi";
import {
  DocumentType,
  Shipment,
  ShipmentStatus,
  ShipmentWorkflowBlocker,
  ShipmentWorkflowRoute,
  ShipmentWorkflowStep,
  StepStatus,
  Task,
  TaskStatus,
} from "../types";
import { ShamsiDateTimeField } from "@/src/components/ShamsiDateTimeField";
import { getShipmentProgress } from "@/src/lib/shipmentWorkflow";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { ShipmentWorkflowTimeline } from "@/src/components/shipments/ShipmentWorkflowTimeline";
import { RelatedShipmentTasksPanel } from "@/src/components/shipments/RelatedShipmentTasksPanel";
import { ShipmentDailyStatusPanel } from "@/src/components/shipments/ShipmentDailyStatusPanel";
import { ShipmentProgressBlockerDialog } from "@/src/components/shipments/ShipmentProgressBlockerDialog";
import { ShipmentProgressUpdateDialog } from "@/src/components/shipments/ShipmentProgressUpdateDialog";
import { TaskAssignDialog } from "@/src/components/tasks/TaskAssignDialog";

const POST_EXIT_STATUS_LABELS: Record<PostExitStatus, string> = {
  needs_follow_up: "نیاز به پیگیری",
  in_progress: "در حال پیگیری",
  settled: "تسویه شده",
  closed: "بسته شده",
};

function displayDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

const DocumentView = ({ shipmentId }: { shipmentId: string }) => {
  const documents = useMockStore(state => state.documents);
  const refreshDocuments = useMockStore(state => state.refreshDocuments);
  
  const shipmentDocs = React.useMemo(() => 
    documents.filter(d => d.shipmentId === shipmentId && !d.isArchived),
    [documents, shipmentId]
  );
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentToArchive, setDocumentToArchive] = useState<{ id: string; name: string } | null>(null);
  const [newDoc, setNewDoc] = useState({
    name: "",
    type: "OTHER" as DocumentType,
    visibility: "internal" as "internal" | "customer_visible",
  });

  const filteredDocs = shipmentDocs.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectDocumentFile = (file: File) => {
    setSelectedFile(file);
    setNewDoc(prev => ({ ...prev, name: file.name }));
    toast.info(`فایل "${file.name}" انتخاب شد.`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectDocumentFile(file);
  };

  const handleFileDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsDraggingFile(false);
    }
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectDocumentFile(file);
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
      formData.append("shipmentId", shipmentId);
      formData.append("visibility", newDoc.visibility);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Upload failed.");
      }
      await refreshDocuments();
      setIsAddDocOpen(false);
      setSelectedFile(null);
      setNewDoc({ name: "", type: "OTHER", visibility: "internal" });
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

  const getDocTypeInfo = (type: string) => {
    const info: Record<string, { label: string; color: string; icon: any }> = {
      BILL_OF_LADING: { label: "بارنامه", color: "text-blue-400", icon: FileText },
      INVOICE: { label: "فاکتور", color: "text-emerald-400", icon: FileCheck },
      PACKING_LIST: { label: "لیست عدل‌بندی", color: "text-amber-400", icon: Package },
      CUSTOMS_PERMIT: { label: "پروانه گمرکی", color: "text-purple-400", icon: Info },
      INSURANCE: { label: "بیمه‌نامه", color: "text-rose-400", icon: CheckCircle2 },
      OTHER: { label: "سایر", color: "text-slate-400", icon: FileIcon }
    };
    return info[type] || info.OTHER;
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">مدیریت مستندات</h3>
            <p className="text-[10px] text-muted-foreground font-medium">مجموع اسناد: {shipmentDocs.length} فایل</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input 
              placeholder="جستجو در اسناد..." 
              className="bg-muted/50 border-border pr-9 h-9 text-[11px] w-48 rounded-lg outline-none focus:ring-1 focus:ring-primary"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <Dialog open={isAddDocOpen} onOpenChange={setIsAddDocOpen}>
            <DialogTrigger
              render={
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-bold gap-2 h-9 rounded-lg px-4">
                  <FilePlus className="w-3.5 h-3.5" />
                  بارگذاری مدرک
                </Button>
              }
            />
            <DialogContent className="bg-card border-border text-foreground text-right" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">بارگذاری سند جدید</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">فایل‌های معتبر: PDF, تصویر، Word، Excel، CSV، TXT و RTF (حداکثر ۲۵ مگابایت)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div 
                  className={cn(
                    "bg-muted/50 border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-primary/50 transition-colors",
                    isDraggingFile && "border-primary bg-primary/5"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={handleFileDragOver}
                  onDragOver={handleFileDragOver}
                  onDragLeave={handleFileDragLeave}
                  onDrop={handleFileDrop}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  data-testid="shipment-document-dropzone"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3 group-hover:text-primary transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-foreground/80">
                    {newDoc.name || "انتخاب فایل از سیستم"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">یا فایل را به اینجا بکشید</p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground pr-1">عنوان سند</Label>
                    <Input 
                      placeholder="مثال: بارنامه اصلی"
                      className="bg-muted border-border h-10 text-xs focus:ring-primary" 
                      value={newDoc.name}
                      onChange={e => setNewDoc({...newDoc, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground pr-1">نوع طبقه‌بندی</Label>
                    <select 
                      className="w-full bg-muted border-border rounded-lg h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                      value={newDoc.type}
                      onChange={e => setNewDoc({...newDoc, type: e.target.value as any})}
                    >
                      <option value="BILL_OF_LADING">بارنامه دریایی / هوایی</option>
                      <option value="INVOICE">فاکتور تجاری (Invoice)</option>
                      <option value="PACKING_LIST">لیست عدل‌بندی (Packing List)</option>
                      <option value="CUSTOMS_PERMIT">پروانه سبز گمرکی</option>
                      <option value="INSURANCE">بیمه‌نامه محموله</option>
                      <option value="OTHER">سایر ضمائم</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground pr-1">نمایش برای مشتری</Label>
                    <select
                      className="w-full bg-muted border-border rounded-lg h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                      value={newDoc.visibility}
                      onChange={e => setNewDoc({...newDoc, visibility: e.target.value as any})}
                    >
                      <option value="internal">فقط داخلی</option>
                      <option value="customer_visible">قابل مشاهده برای مشتری</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" className="flex-1 border-border hover:bg-muted text-xs h-11" onClick={() => setIsAddDocOpen(false)}>انصراف</Button>
                <Button disabled={uploading} className="flex-1 bg-primary text-primary-foreground font-extrabold text-xs h-11" onClick={handleAddDoc}>
                  {uploading ? <ActionSkeleton inverted className="w-32" /> : "تایید و نهایی‌سازی"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Compact List View */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/40">
        {filteredDocs.map((doc, index) => {
          const typeInfo = getDocTypeInfo(doc.type);
          const Icon = typeInfo.icon;
          const documentHref = doc.url || `/api/documents/${encodeURIComponent(doc.id)}/download`;

          return (
            <div
              key={doc.id}
              className={cn(
                "group flex flex-col gap-3 p-3 transition-colors hover:bg-muted/35 md:flex-row md:items-center md:justify-between",
                index > 0 && "border-t border-border/50"
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50", typeInfo.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="max-w-full truncate text-sm font-black text-foreground transition-colors group-hover:text-primary">{doc.name}</h4>
                    <Badge variant="outline" className={cn("h-5 border-transparent bg-muted/70 px-2 text-[10px] font-bold", typeInfo.color)}>
                      {typeInfo.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground">
                    <span>{doc.fileSize}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span className="truncate">توسط: {doc.uploadedBy}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span className="font-mono">{doc.createdAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 md:shrink-0 md:justify-end md:border-t-0 md:pt-0">
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-muted-foreground"
                  value={doc.visibility || "internal"}
                  onChange={(event) => handleVisibilityChange(doc.id, event.target.value as any)}
                >
                  <option value="internal">داخلی</option>
                  <option value="customer_visible">مشتری</option>
                </select>

                <div className="flex items-center gap-1">
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                  >
                    <a
                      href={documentHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${doc.name}`}
                      title="Open document"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => handleDownloadDocument(doc)}
                    aria-label={`Download ${doc.name}`}
                    title="Download document"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => setDocumentToArchive({ id: doc.id, name: doc.name })}
                    aria-label={`Archive ${doc.name}`}
                    title="Archive document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredDocs.length === 0 && (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border bg-card/30 py-12 text-center transition-all hover:border-primary/30">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
              <FilePlus className="h-7 w-7" />
            </div>
            <h4 className="text-sm font-bold text-muted-foreground">هنوز سندی بارگذاری نشده است</h4>
            <p className="text-[11px] text-muted-foreground mt-1">برای شروع، اولین مدرک را بارگذاری کنید</p>
            <Button 
              variant="outline" 
              className="mt-6 border-border text-primary text-xs h-9 px-6 rounded-xl hover:bg-primary hover:text-primary-foreground font-bold"
              onClick={() => setIsAddDocOpen(true)}
            >
              افزودن مدرک
            </Button>
          </div>
        )}
      </div>
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
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    IN_TRANSIT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ARRIVED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    CUSTOMS: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    CLEARED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    DELIVERED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    PENDING: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    BOOKED: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    CLOSED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  const labels: Record<string, string> = {
    IN_TRANSIT: "درحال حمل",
    ARRIVED: "رسیده به بندر",
    CUSTOMS: "در انتظار گمرک",
    CLEARED: "ترخیص شده",
    DELIVERED: "تحویل نهایی",
    PENDING: "در انتظار ثبت",
    BOOKED: "رزرو شده",
    CLOSED: "بسته شده",
  };
  return <Badge variant="outline" className={cn(styles[status] || "", "py-0.5 px-2 text-[10px] font-bold")}>{labels[status] || status}</Badge>;
};

type CustomerAccessState = {
  enabled: boolean;
  hasToken: boolean;
  token?: string;
  url?: string;
  publicStatus: {
    label: string;
    description: string;
    isCustomerVisible: boolean;
    lastUpdatedAt?: string | null;
  };
};

const CustomerAccessPanel = ({ shipmentId, trackingNumber }: { shipmentId: string; trackingNumber: string }) => {
  const [access, setAccess] = useState<CustomerAccessState | null>(null);
  const [publicLabel, setPublicLabel] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [rawLink, setRawLink] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadAccess = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/shipments/${shipmentId}/customer-access`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not load access.");
      setAccess(payload.data);
      setRawLink(payload.data.enabled && payload.data.url ? payload.data.url : "");
      setPublicLabel(payload.data.publicStatus?.label || "");
      setPublicDescription(payload.data.publicStatus?.description || "");
      setIsVisible(payload.data.publicStatus?.isCustomerVisible !== false);
    } catch (error) {
      console.error(error);
    }
  }, [shipmentId]);

  React.useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  React.useEffect(() => {
    let cancelled = false;
    if (!rawLink) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(rawLink, { margin: 1, width: 180 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [rawLink]);

  const runAccessAction = async (action: "generate" | "reset" | "disable") => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/shipments/${shipmentId}/customer-access/${action}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Action failed.");
      setAccess(payload.data);
      if (payload.data.url) {
        setRawLink(payload.data.url);
        toast.success(action === "reset" ? "لینک مشتری با موفقیت بازنشانی شد." : "لینک مشتری با موفقیت ساخته شد.");
      } else {
        setRawLink("");
        toast.success("دسترسی مشتری غیرفعال شد.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "انجام عملیات دسترسی مشتری ناموفق بود.");
    } finally {
      setIsLoading(false);
    }
  };

  const savePublicStatus = async () => {
    if (!publicLabel.trim()) {
      toast.error("عنوان وضعیت قابل نمایش برای مشتری الزامی است.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/shipments/${shipmentId}/public-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicLabel,
          publicDescription,
          isCustomerVisible: isVisible,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not save status.");
      toast.success("وضعیت قابل نمایش برای مشتری به روز شد.");
      await loadAccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save public status.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = async () => {
    if (!rawLink) return;
    try {
      await navigator.clipboard.writeText(rawLink);
      toast.success("Customer tracking link copied.");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = rawLink;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (copied) toast.success("Customer tracking link copied.");
      else toast.error("Clipboard access is blocked by the browser.");
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/20 p-4">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-black">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            دسترسی مشتری
          </span>
          <Badge className={cn("rounded-full text-[10px]", access?.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200")}>
            {access?.enabled ? "فعال" : "غیرفعال"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl bg-muted/35 p-3 text-right ring-1 ring-border/40">
          <p className="text-[11px] font-bold text-muted-foreground">شماره رهگیری</p>
          <p className="mt-1 text-sm font-black text-foreground">{trackingNumber}</p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button
            size="sm"
            className="h-9 justify-center gap-1 rounded-xl text-[11px] font-bold"
            disabled={isLoading}
            data-testid="customer-access-generate"
            onClick={() => runAccessAction("generate")}
          >
            {isLoading ? (
              <ActionSkeleton inverted className="w-14" />
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                ساخت لینک
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 justify-center gap-1 rounded-xl text-[11px] font-bold"
            disabled={isLoading || !access?.hasToken}
            data-testid="customer-access-reset"
            onClick={() => runAccessAction("reset")}
          >
            {isLoading ? (
              <ActionSkeleton className="w-14" />
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                بازنشانی
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 justify-center gap-1 rounded-xl text-[11px] font-bold text-red-600 hover:text-red-700"
            disabled={isLoading || !access?.enabled}
            data-testid="customer-access-disable"
            onClick={() => runAccessAction("disable")}
          >
            {isLoading ? (
              <ActionSkeleton className="w-14 bg-red-500/20" />
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                غیرفعال
              </>
            )}
          </Button>
        </div>

        {rawLink ? (
          <div className="rounded-xl bg-blue-50/70 p-3 ring-1 ring-blue-100">
            <div className="flex items-center gap-2">
              <Input value={rawLink} readOnly className="h-9 bg-white text-left text-[11px]" dir="ltr" data-testid="customer-access-link" />
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-white" data-testid="customer-access-copy" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {qrDataUrl && (
              <div className="mt-3 flex justify-center rounded-lg bg-white p-2">
                <img src={qrDataUrl} alt="Customer tracking QR code" className="h-28 w-28" />
              </div>
            )}
            <p className="mt-2 text-[11px] font-medium text-blue-700">
              لینک امن ذخیره می‌شود و تا زمان بازنشانی بعدی ثابت می‌ماند.
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-muted/40 p-3 text-[11px] font-medium leading-5 text-muted-foreground">
            هنوز لینک فعال ذخیره‌شده‌ای برای این محموله وجود ندارد. لینک را بسازید تا بعد از رفرش هم همینجا بماند.
          </p>
        )}

        <div className="space-y-2 rounded-xl bg-muted/25 p-3 ring-1 ring-border/40">
          <Label className="text-[11px] font-black">عنوان وضعیت عمومی</Label>
          <Input
            value={publicLabel}
            onChange={(event) => setPublicLabel(event.target.value)}
            placeholder="محموله در حال بررسی گمرکی است"
            className="h-9 text-xs"
            data-testid="public-status-label"
          />
          <Label className="text-[11px] font-black">توضیح قابل نمایش برای مشتری</Label>
          <Input
            value={publicDescription}
            onChange={(event) => setPublicDescription(event.target.value)}
            placeholder="به روزرسانی امن و قابل نمایش برای مشتری"
            className="h-9 text-xs"
            data-testid="public-status-description"
          />
          <label className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
            <input
              type="checkbox"
              checked={isVisible}
              onChange={(event) => setIsVisible(event.target.checked)}
              data-testid="public-status-visible"
            />
            نمایش این وضعیت در صفحه رهگیری مشتری
          </label>
          <Button
            size="sm"
            variant="secondary"
            className="w-full text-[11px]"
            disabled={isLoading}
            data-testid="public-status-save"
            onClick={savePublicStatus}
          >
            {isLoading ? <ActionSkeleton className="w-32" /> : "ذخیره وضعیت عمومی"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

type ShipmentChatThread = {
  id: string;
  shipmentCode?: string;
};

type ShipmentChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body?: string;
  content?: string;
  createdAt: string;
};

const shipmentChatMessageText = (message: ShipmentChatMessage) => message.body || message.content || "";
const SHIPMENT_CHAT_MESSAGE_PAGE_SIZE = 20;
const SHIPMENT_CHAT_HISTORY_TOP_THRESHOLD_PX = 48;
const SHIPMENT_CHAT_BOTTOM_THRESHOLD_PX = 80;

const ShipmentChatPanel = ({ shipmentId, shipmentCode }: { shipmentId: string; shipmentCode: string }) => {
  const navigate = useNavigate();
  const currentUser = useMockStore((state) => state.currentUser);
  const canUseChat = Boolean(currentUser?.permissions?.includes("chat.use"));
  const [thread, setThread] = React.useState<ShipmentChatThread | null>(null);
  const [messages, setMessages] = React.useState<ShipmentChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [hasMoreMessages, setHasMoreMessages] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const messageListRef = React.useRef<HTMLDivElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const historyLoadingRef = React.useRef(false);
  const historyScrollRestoreRef = React.useRef<{ previousHeight: number; previousTop: number } | null>(null);
  const pendingBottomScrollRef = React.useRef<ScrollBehavior | null>(null);
  const initialBottomScrolledThreadRef = React.useRef("");

  const loadMessages = React.useCallback(async (
    threadId: string,
    options: { before?: string; mode?: "initial" | "history" } = {}
  ) => {
    const params = new URLSearchParams({ limit: String(SHIPMENT_CHAT_MESSAGE_PAGE_SIZE) });
    if (options.before) params.set("before", options.before);
    const response = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not load shipment chat messages.");
    const nextMessages = (payload.data || []) as ShipmentChatMessage[];
    setHasMoreMessages(nextMessages.length === SHIPMENT_CHAT_MESSAGE_PAGE_SIZE);
    if (options.mode === "history") {
      setMessages((items) => {
        const existingIds = new Set(items.map((item) => item.id));
        const olderMessages = nextMessages.filter((message) => !existingIds.has(message.id));
        return olderMessages.length ? [...olderMessages, ...items] : items;
      });
      return nextMessages;
    }
    pendingBottomScrollRef.current = "auto";
    setMessages(nextMessages);
    return nextMessages;
  }, []);

  const isMessageListNearBottom = () => {
    const list = messageListRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= SHIPMENT_CHAT_BOTTOM_THRESHOLD_PX;
  };

  const scrollMessageListToBottom = (behavior: ScrollBehavior) => {
    const applyScroll = () => {
      const list = messageListRef.current;
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      if (!list) return;
      if (behavior === "smooth") {
        list.scrollTo({ top: list.scrollHeight, behavior });
        return;
      }
      list.scrollTop = list.scrollHeight;
    };
    applyScroll();
    window.requestAnimationFrame(() => {
      applyScroll();
      window.requestAnimationFrame(applyScroll);
    });
  };

  const loadOlderMessages = async () => {
    const oldestMessage = messages[0];
    if (!thread?.id || !oldestMessage || !hasMoreMessages || historyLoadingRef.current) return;
    const list = messageListRef.current;
    historyScrollRestoreRef.current = list
      ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop }
      : null;
    historyLoadingRef.current = true;
    try {
      const olderMessages = await loadMessages(thread.id, { before: oldestMessage.id, mode: "history" });
      if (!olderMessages?.length) {
        historyScrollRestoreRef.current = null;
      }
    } catch (nextError) {
      historyScrollRestoreRef.current = null;
      setError(nextError instanceof Error ? nextError.message : "Could not load older shipment chat messages.");
    } finally {
      historyLoadingRef.current = false;
    }
  };

  const handleMessageListScroll = () => {
    const list = messageListRef.current;
    if (!list || list.scrollHeight <= list.clientHeight) return;
    if (list.scrollTop <= SHIPMENT_CHAT_HISTORY_TOP_THRESHOLD_PX) {
      void loadOlderMessages();
    }
  };

  React.useEffect(() => {
    if (!canUseChat) return;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    setMessages([]);
    setHasMoreMessages(false);
    historyLoadingRef.current = false;
    historyScrollRestoreRef.current = null;
    pendingBottomScrollRef.current = "auto";
    initialBottomScrolledThreadRef.current = "";
    fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/chat-thread`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not open shipment chat.");
        if (cancelled) return null;
        setThread(payload.data);
        await loadMessages(payload.data.id);
        if (!cancelled) {
          window.setTimeout(() => scrollMessageListToBottom("auto"), 0);
          window.setTimeout(() => scrollMessageListToBottom("auto"), 150);
        }
        return payload.data;
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Could not open shipment chat.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canUseChat, loadMessages, shipmentId]);

  React.useEffect(() => {
    if (!canUseChat || !thread?.id) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const incoming = JSON.parse(event.data);
      if (incoming.type === "connection.ready") {
        ws.send(JSON.stringify({ type: "thread.join", payload: { threadId: thread.id } }));
        return;
      }
      if (incoming.type === "message.created" && incoming.payload?.threadId === thread.id) {
        const message = incoming.payload as ShipmentChatMessage;
        const shouldScrollToBottom = message.senderId === currentUser?.id || isMessageListNearBottom();
        setMessages((items) => {
          if (items.some((item) => item.id === message.id)) return items;
          if (shouldScrollToBottom) pendingBottomScrollRef.current = "smooth";
          return [...items, message];
        });
        return;
      }
      if (incoming.type === "message.ack") {
        setIsSending(false);
        setDraft("");
        setError("");
        return;
      }
      if (incoming.type === "error") {
        setIsSending(false);
        setError(incoming.error?.message || "Shipment chat action failed.");
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
      setIsSending(false);
    };
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "thread.leave", payload: { threadId: thread.id } }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [canUseChat, currentUser?.id, thread?.id]);

  React.useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list || messages.length === 0) return;
    const restore = historyScrollRestoreRef.current;
    if (restore) {
      list.scrollTop = list.scrollHeight - restore.previousHeight + restore.previousTop;
      historyScrollRestoreRef.current = null;
    }
  }, [messages]);

  React.useEffect(() => {
    if (!thread?.id || messages.length === 0) return;
    if (initialBottomScrolledThreadRef.current !== thread.id) {
      scrollMessageListToBottom("auto");
      pendingBottomScrollRef.current = null;
      initialBottomScrolledThreadRef.current = thread.id;
      return;
    }
    const behavior = pendingBottomScrollRef.current;
    if (!behavior) return;
    scrollMessageListToBottom(behavior);
    pendingBottomScrollRef.current = null;
  }, [messages, thread?.id]);

  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!thread?.id || !lastMessage) return;
    fetch(`/api/chat/threads/${encodeURIComponent(thread.id)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: lastMessage.id }),
    }).catch(() => {});
  }, [messages, thread?.id]);

  if (!canUseChat) return null;

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !thread?.id || isSending) return;
    setIsSending(true);
    setError("");
    const clientMessageId = `shipment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "message.send",
        requestId: clientMessageId,
        payload: { threadId: thread.id, body, clientMessageId },
      }));
      return;
    }
    try {
      const response = await fetch(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, clientMessageId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not send shipment chat message.");
      pendingBottomScrollRef.current = "smooth";
      setMessages((items) => items.some((item) => item.id === payload.data.id) ? items : [...items, payload.data]);
      setDraft("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not send shipment chat message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm" data-testid="shipment-chat-panel">
      <CardHeader className="border-b border-border/50 bg-muted/20 p-4">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-black">
          <span className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">گفتگوی محموله</span>
          </span>
          {thread?.id && (
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-black"
              onClick={() => navigate(`/chat?threadId=${encodeURIComponent(thread.id)}`)}
              data-testid="shipment-chat-full-link"
            >
              مشاهده گفتگوی کامل
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="rounded-xl bg-muted/25 p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold text-muted-foreground">
            <span className="truncate">محموله {thread?.shipmentCode || shipmentCode}</span>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div
            ref={messageListRef}
            className="max-h-48 space-y-2 overflow-y-auto pr-1"
            data-testid="shipment-chat-message-list"
            onScroll={handleMessageListScroll}
          >
            {!isLoading && messages.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">هنوز پیامی ثبت نشده است.</p>
            )}
            {messages.map((message) => {
              const isMine = message.senderId === currentUser?.id;
              return (
                <div key={message.id} className={cn("flex flex-col", isMine ? "items-start" : "items-end")}>
                  {!isMine && <span className="mb-1 text-[10px] font-black text-muted-foreground">{message.senderName}</span>}
                  <div
                    className={cn(
                      "max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[11px] font-bold leading-5 [overflow-wrap:anywhere]",
                      isMine ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground"
                    )}
                    data-testid="shipment-chat-message-bubble"
                  >
                    {shipmentChatMessageText(message)}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!thread?.id || isLoading}
            maxLength={3000}
            placeholder="پیام داخلی محموله..."
            className="h-10 min-w-0 flex-1 rounded-lg text-xs font-bold"
            data-testid="shipment-chat-message-input"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg"
            disabled={!thread?.id || !draft.trim() || isSending || isLoading}
            data-testid="shipment-chat-send-button"
            aria-label="ارسال پیام محموله"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const shipments = useMockStore(state => state.shipments);
  const shipmentSteps = useMockStore(state => state.shipmentSteps);
  const tasks = useMockStore(state => state.tasks);
  const users = useMockStore(state => state.users);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  const documents = useMockStore(state => state.documents);
  const customers = useMockStore(state => state.customers);
  const currentUser = useMockStore(state => state.currentUser);
  const shipmentProgress = useAppDataStore(state => id ? state.shipmentProgressById[id] : null);
  const organizationMembers = useAppDataStore(state => state.organizationMembers);
  const refreshShipmentProgress = useAppDataStore(state => state.refreshShipmentProgress);
  const startShipmentWorkflow = useAppDataStore(state => state.startShipmentWorkflow);
  const updateShipmentWorkflowCurrent = useAppDataStore(state => state.updateShipmentWorkflowCurrent);
  const addShipmentWorkflowBlocker = useAppDataStore(state => state.addShipmentWorkflowBlocker);
  const resolveShipmentWorkflowBlocker = useAppDataStore(state => state.resolveShipmentWorkflowBlocker);
  const fetchOrganizationMembers = useAppDataStore(state => state.fetchOrganizationMembers);
  const refreshTasks = useAppDataStore(state => state.refreshTasks);
  const assignTask = useAppDataStore(state => state.assignTask);
  const updateTaskStatusRemote = useAppDataStore(state => state.updateTaskStatusRemote);
  
  const storeShipment = React.useMemo(() => shipments.find(s => s.id === id), [shipments, id]);
  const [remoteShipmentResult, setRemoteShipmentResult] = useState<{ routeId: string; shipment: Shipment | null } | null>(null);
  const [isShipmentLoading, setIsShipmentLoading] = useState(false);
  const [shipmentLoadError, setShipmentLoadError] = useState("");
  const remoteShipment = remoteShipmentResult?.routeId === id ? remoteShipmentResult.shipment : null;
  const shipment = storeShipment || remoteShipment;
  const steps = React.useMemo(() => 
    shipmentSteps.filter(s => s.shipmentId === id).sort((a, b) => a.order - b.order),
    [shipmentSteps, id]
  );
  const shipmentTasks = React.useMemo(() => 
    tasks.filter(t => t.shipmentId === id),
    [tasks, id]
  );

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState("");
  const [isProgressLoading, setIsProgressLoading] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [progressDialogMode, setProgressDialogMode] = useState<"current" | "complete" | "note">("current");
  const [progressDialogStep, setProgressDialogStep] = useState<ShipmentWorkflowStep | null>(null);
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [blockerDialogStep, setBlockerDialogStep] = useState<ShipmentWorkflowStep | null>(null);
  const [workflowTaskDialogOpen, setWorkflowTaskDialogOpen] = useState(false);
  const [workflowTaskContext, setWorkflowTaskContext] = useState<{
    step?: ShipmentWorkflowStep;
    blocker?: ShipmentWorkflowBlocker;
    task?: Task;
  }>({});
  const [isWorkflowMembersLoading, setIsWorkflowMembersLoading] = useState(false);
  const [workflowMembersError, setWorkflowMembersError] = useState("");
  const [exitedArchiveDialogOpen, setExitedArchiveDialogOpen] = useState(false);
  const [exitedArchiveReason, setExitedArchiveReason] = useState("");
  const [restoreExitedDialogOpen, setRestoreExitedDialogOpen] = useState(false);
  const [postExitDraft, setPostExitDraft] = useState<{
    postExitStatus: PostExitStatus;
    postExitNote: string;
    postExitFollowUpAt: string;
  }>({
    postExitStatus: "needs_follow_up",
    postExitNote: "",
    postExitFollowUpAt: "",
  });
  const [isPostExitSaving, setIsPostExitSaving] = useState(false);
  const [isExitedArchiveSaving, setIsExitedArchiveSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({
    userId: users[0]?.id || "",
    priority: "MEDIUM" as const,
    dueDate: format(addDays(new Date(), 7), "yyyy/MM/dd"),
    deadline: "09:00",
    description: ""
  });

  const loadWorkflowMembers = React.useCallback(async () => {
    setIsWorkflowMembersLoading(true);
    setWorkflowMembersError("");
    try {
      await fetchOrganizationMembers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load organization members.";
      setWorkflowMembersError(message);
      throw error;
    } finally {
      setIsWorkflowMembersLoading(false);
    }
  }, [fetchOrganizationMembers]);

  React.useEffect(() => {
    if (!id) return;
    refreshShipmentProgress(id).catch((error) => {
      console.error("Could not load shipment workflow progress.", error);
    });
    refreshTasks().catch((error) => {
      console.error("Could not refresh shipment tasks.", error);
    });
    loadWorkflowMembers().catch((error) => {
      console.error("Could not load organization members.", error);
    });
  }, [id, refreshShipmentProgress, refreshTasks, loadWorkflowMembers]);

  React.useEffect(() => {
    if (!id) return;
    if (storeShipment) {
      setIsShipmentLoading(false);
      setShipmentLoadError("");
      return;
    }

    let isCancelled = false;
    setIsShipmentLoading(true);
    setShipmentLoadError("");

    shipmentApi.get(id)
      .then((record) => {
        if (isCancelled) return;
        setRemoteShipmentResult({ routeId: id, shipment: record });
      })
      .catch((error) => {
        if (isCancelled) return;
        setRemoteShipmentResult({ routeId: id, shipment: null });
        setShipmentLoadError(error instanceof Error ? error.message : "Could not load shipment.");
      })
      .finally(() => {
        if (!isCancelled) setIsShipmentLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [id, storeShipment]);

  React.useEffect(() => {
    if (!shipment) return;
    setPostExitDraft({
      postExitStatus: shipment.postExitStatus || "needs_follow_up",
      postExitNote: shipment.postExitNote || "",
      postExitFollowUpAt: displayDate(shipment.postExitFollowUpAt),
    });
  }, [shipment?.id, shipment?.postExitStatus, shipment?.postExitNote, shipment?.postExitFollowUpAt]);

  const refreshCurrentShipment = React.useCallback(async () => {
    if (!id) return null;
    const updated = await shipmentApi.get(id);
    setRemoteShipmentResult({ routeId: id, shipment: updated });
    await loadCurrentUserRecords();
    return updated;
  }, [id, loadCurrentUserRecords]);

  const visibleShipments = React.useMemo(() => {
    if (!shipment || shipments.some(s => s.id === shipment.id)) return shipments;
    return [shipment, ...shipments];
  }, [shipments, shipment]);
  const customer = React.useMemo(() => customers.find(c => c.id === shipment?.customerId), [customers, shipment?.customerId]);
  const customerIdentifier = customer?.customerCode || customer?.code || shipment?.customerCode || shipment?.customerId || shipment?.customerName || "";
  const customerShipments = React.useMemo(
    () => visibleShipments.filter(s => s.customerId === shipment?.customerId),
    [visibleShipments, shipment?.customerId]
  );
  const [isCustomerSummaryOpen, setIsCustomerSummaryOpen] = useState(false);

  if (!shipment && id && (isShipmentLoading || !shipmentLoadError)) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-slate-500 font-sans">
        <ActionSkeleton className="mb-4 h-12 w-12 rounded-full" />
        <h2 className="text-xl font-bold">در حال بارگیری محموله...</h2>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-slate-500 font-sans">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <h2 className="text-xl font-bold">محموله مورد نظر یافت نشد.</h2>
        <Button variant="link" onClick={() => navigate("/shipments")} className="text-primary mt-2">
          بازگشت به لیست محموله‌ها
        </Button>
      </div>
    );
  }

  const progress = getShipmentProgress(shipment, steps);
  const completedSteps = progress.completedSteps;
  const progressPercent = progress.percent;
  const canArchiveShipments = Boolean(currentUser?.permissions?.includes("shipments.archive"));
  const canUpdateShipments = Boolean(currentUser?.permissions?.includes("shipments.update"));
  const canMoveToExitedArchive = canArchiveShipments && !shipment.isExitedArchived && ["CLEARED", "DELIVERED", "CLOSED"].includes(shipment.status);

  const handleMoveToExitedArchive = async () => {
    setIsExitedArchiveSaving(true);
    try {
      const updated = await shipmentApi.moveToExitedArchive(shipment.id, {
        reason: exitedArchiveReason.trim() || null,
      });
      setRemoteShipmentResult({ routeId: shipment.id, shipment: updated });
      await loadCurrentUserRecords();
      setExitedArchiveDialogOpen(false);
      setExitedArchiveReason("");
      toast.success("محموله به محموله‌های خروج‌شده منتقل شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "انتقال محموله ناموفق بود.");
    } finally {
      setIsExitedArchiveSaving(false);
    }
  };

  const handleRestoreExitedShipment = async () => {
    setIsExitedArchiveSaving(true);
    try {
      const updated = await shipmentApi.restoreFromExitedArchive(shipment.id);
      setRemoteShipmentResult({ routeId: shipment.id, shipment: updated });
      await loadCurrentUserRecords();
      setRestoreExitedDialogOpen(false);
      toast.success("محموله به لیست فعال برگشت.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بازگردانی محموله ناموفق بود.");
    } finally {
      setIsExitedArchiveSaving(false);
    }
  };

  const handleSavePostExit = async () => {
    setIsPostExitSaving(true);
    try {
      const updated = await shipmentApi.updatePostExit(shipment.id, {
        postExitStatus: postExitDraft.postExitStatus,
        postExitNote: postExitDraft.postExitNote || null,
        postExitFollowUpAt: postExitDraft.postExitFollowUpAt || null,
      });
      setRemoteShipmentResult({ routeId: shipment.id, shipment: updated });
      await loadCurrentUserRecords();
      await refreshCurrentShipment();
      toast.success("پیگیری بعد از خروج ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره پیگیری ناموفق بود.");
    } finally {
      setIsPostExitSaving(false);
    }
  };

  const runProgressMutation = async (action: () => Promise<any>, successMessage: string) => {
    setIsProgressLoading(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow update failed.");
    } finally {
      setIsProgressLoading(false);
    }
  };

  const openProgressDialog = (step: ShipmentWorkflowStep, mode: "current" | "complete" | "note") => {
    setProgressDialogStep(step);
    setProgressDialogMode(mode);
    setProgressDialogOpen(true);
  };

  const handleProgressDialogSubmit = async (body: Record<string, any>) => {
    setIsProgressLoading(true);
    try {
      await updateShipmentWorkflowCurrent(shipment.id, body);
      toast.success("گردش کار به‌روز شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow update failed.");
      throw error;
    } finally {
      setIsProgressLoading(false);
    }
  };

  const handleStartWorkflow = () =>
    runProgressMutation(
      () => startShipmentWorkflow(shipment.id),
      "گردش کار واردات شروع شد."
    );

  const handleRouteSelect = (route: ShipmentWorkflowRoute) =>
    runProgressMutation(
      () => updateShipmentWorkflowCurrent(shipment.id, { stepCode: "039", customsRoute: route }),
      "مسیر گمرکی ثبت شد."
    );

  const handleRevealWorkflowStep = (step: ShipmentWorkflowStep) =>
    runProgressMutation(
      () => updateShipmentWorkflowCurrent(shipment.id, { stepCode: step.code, isVisible: true, isExceptional: true }),
      "مرحله استثنایی نمایش داده شد."
    );

  const handleAddWorkflowBlocker = async (body: Record<string, any>) => {
    setIsProgressLoading(true);
    try {
      await addShipmentWorkflowBlocker(shipment.id, body);
      toast.success("مانع گردش کار ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add workflow blocker.");
      throw error;
    } finally {
      setIsProgressLoading(false);
    }
  };

  const handleResolveWorkflowBlocker = (blocker: ShipmentWorkflowBlocker) =>
    runProgressMutation(
      () => resolveShipmentWorkflowBlocker(shipment.id, { blockerId: blocker.id, status: "resolved" }),
      "مانع برطرف شد."
    );

  const openWorkflowTaskDialog = async (context: { step?: ShipmentWorkflowStep; blocker?: ShipmentWorkflowBlocker; task?: Task }) => {
    let nextContext = context;
    if (context.step || context.blocker) {
      try {
        const latestProgress = await refreshShipmentProgress(shipment.id);
        const refreshedStep = context.step
          ? latestProgress?.steps?.find((step) => step.code === context.step?.code) || context.step
          : undefined;
        const refreshedBlocker = context.blocker
          ? latestProgress?.blockers?.find((blocker) => blocker.id === context.blocker?.id) ||
            latestProgress?.blockers?.find(
              (blocker) =>
                blocker.status === "open" &&
                blocker.blockerCode === context.blocker?.blockerCode &&
                (!context.blocker?.stepCode || blocker.stepCode === context.blocker.stepCode)
            ) ||
            context.blocker
          : undefined;
        nextContext = { ...context, step: refreshedStep, blocker: refreshedBlocker };
      } catch (error) {
        console.error("Could not refresh workflow before task assignment.", error);
      }
    }
    setWorkflowTaskContext(nextContext);
    setWorkflowTaskDialogOpen(true);
    if (!organizationMembers.length) {
      loadWorkflowMembers().catch((error) => {
        console.error("Could not load workflow assignees.", error);
      });
    }
  };

  const handleWorkflowTaskSubmit = async (body: Record<string, any>) => {
    const context = workflowTaskContext;
    try {
      if (context.task) {
        await assignTask(context.task.id, {
          assignedToUserId: body.assignedToUserId,
          dueDate: body.dueDate,
          priority: body.priority,
          assignmentNote: body.assignmentNote,
          status: "assigned",
        });
      } else {
        let workflowInstanceId = shipmentProgress?.workflow?.id || null;
        if (context.step || context.blocker) {
          const progressResponse = await fetch(`/api/shipments/${shipment.id}/progress`, { cache: "no-store" });
          const progressPayload = await progressResponse.json().catch(() => ({}));
          if (progressResponse.ok && progressPayload.ok) {
            workflowInstanceId = progressPayload.data?.workflow?.id || workflowInstanceId;
          }
        }
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: body.title,
            description: body.description,
            assignedToUserId: body.assignedToUserId,
            priority: body.priority,
            dueDate: body.dueDate,
            assignmentNote: body.assignmentNote,
            status: "assigned",
            shipmentId: shipment.id,
            workflowInstanceId,
            workflowStepCode: context.step?.code,
            workflowBlockerId: context.blocker?.id,
            blockerCode: context.blocker?.blockerCode,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error?.message || "Could not assign workflow task.");
        }
      }
      await refreshTasks();
      toast.success("وظیفه ارجاع شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign workflow task.");
      throw error;
    }
  };

  const handleRelatedTaskStatus = async (task: Task, status: TaskStatus) => {
    try {
      await updateTaskStatusRemote(task.id, { status });
      await refreshTasks();
      toast.success("وضعیت وظیفه به‌روز شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update task status.");
    }
  };

  const EMPLOYEE_MANAGED_STEPS = [
    "ثبت سفارش در سامانه جامع تجارت",
    "دریافت مجوزهای لازم از سازمانهای مربوطه",
    "عقد قرارداد حمل‌ونقل بین‌المللی",
    "رزرو وسیله حمل",
    "بارگیری کالا در مبدأ",
    "ارسال اسناد حمل به واردکننده",
    "اظهار کالا در سامانه گمرکی",
    "ارائه و بررسی اسناد توسط کارشناس گمرک",
    "ارزیابی و بازرسی فیزیکی کالا (در صورت نیاز)",
    "پرداخت حقوق و عوارض گمرکی",
    "دریافت پروانه سبز گمرکی",
    "هماهنگی و انجام حمل داخلی",
    "خروج کالا از گمرک و تحویل در مقصد"
  ];

  const patchShipmentStep = async (stepId: string, updates: any) => {
    const response = await fetch(`/api/shipments/${shipment.id}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || "Could not update shipment step.");
    }
    await loadCurrentUserRecords();
    return payload.data;
  };

  const handleAssignTask = async () => {
    const user = users.find(u => u.id === assignForm.userId);
    try {
      const response = await fetch(`/api/shipments/${shipment.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: selectedStep.id,
          stepName: selectedStep.name,
          title: `پیگیری مرحله: ${selectedStep.name} - ${shipment.trackingNumber}`,
          description: assignForm.description || `پیگیری انجام مرحله ${selectedStep.name} برای محموله ${shipment.trackingNumber}`,
          assignedToUserId: assignForm.userId,
          assignedToName: user?.name || "",
          priority: assignForm.priority,
          dueDate: assignForm.dueDate,
          deadline: assignForm.deadline,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Could not assign task.");
      }
      if (selectedStep.status === "PENDING") {
        await patchShipmentStep(selectedStep.id, { status: "IN_PROGRESS" });
      } else {
        await loadCurrentUserRecords();
      }
      toast.success("وظیفه ثبت شد.");
      setIsAssignDialogOpen(false);
      setAssignForm({
        userId: users[0]?.id || "",
        priority: "MEDIUM",
        dueDate: format(addDays(new Date(), 7), "yyyy/MM/dd"),
        deadline: "09:00",
        description: ""
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign task.");
    }
  };

  return (
    <div className="app-page space-y-6 font-sans text-right text-foreground" dir="rtl">
      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3 md:gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 shrink-0 rounded-xl bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/shipments")}
          >
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black leading-tight text-foreground md:text-3xl">{shipment.trackingNumber}</h1>
              <div className="shrink-0 scale-90 md:scale-100 origin-right">
                <StatusBadge status={shipment.status} />
              </div>
              {shipment.isExitedArchived ? (
                <Badge variant="outline" className="h-7 rounded-full border-amber-500/30 bg-amber-500/10 px-3 text-[11px] font-black text-amber-700" data-testid="shipment-exited-badge">
                  خروج‌شده
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground md:gap-3 md:text-xs">
              <span className="flex items-center gap-1 truncate"><UserPlus className="w-3.5 h-3.5" /> {shipment.customerName}</span>
              <span className="w-1 h-1 rounded-full bg-border shrink-0" />
              <span className="flex items-center gap-1 font-mono tracking-wider truncate">{shipment.containerNumber}</span>
            </div>
            <div className="mt-4 max-w-xl rounded-xl bg-muted/35 p-3 ring-1 ring-border/40">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black text-muted-foreground">
                <span>پیشرفت پرونده</span>
                <span dir="ltr">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-bold text-muted-foreground">
                <span className="truncate">{shipment.origin}</span>
                <span className="truncate text-primary">{completedSteps} مرحله تکمیل شده</span>
                <span className="truncate">{shipment.destination}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center xl:justify-end">
          <Dialog open={isCustomerSummaryOpen} onOpenChange={setIsCustomerSummaryOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="border-border bg-muted/50 text-muted-foreground gap-2 font-bold h-10 px-4 md:px-6 rounded-xl hover:bg-primary hover:text-primary-foreground transition-all text-xs">
                  <Users className="w-4 h-4" />
                  خلاصه مشتری
                </Button>
              }
            />
            <DialogContent className="bg-card border-border text-foreground text-right sm:max-w-2xl p-0 overflow-hidden" dir="rtl">
              <div className="p-6">
                <DialogHeader className="relative pr-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                          <Users className="w-6 h-6" />
                       </div>
                       <div>
                          <DialogTitle className="text-xl font-black">{customerIdentifier}</DialogTitle>
                          <DialogDescription className="text-muted-foreground text-xs">شناسه مشتری</DialogDescription>
                       </div>
                    </div>
                    <DialogClose render={
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                        <X className="w-5 h-5" />
                      </Button>
                    } />
                  </div>
                </DialogHeader>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-6">
                <div className="bg-muted/50 p-4 rounded-2xl border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">کل محموله‌ها</p>
                  <p className="text-2xl font-black text-primary">{customerShipments.length}</p>
                </div>
                <div className="bg-card/50 p-4 rounded-2xl border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">در جریان</p>
                  <p className="text-2xl font-black text-amber-400">
                    {customerShipments.filter(s => s.status !== 'DELIVERED' && s.status !== 'CLOSED').length}
                  </p>
                </div>
                <div className="bg-card/50 p-4 rounded-2xl border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">تکمیل شده</p>
                  <p className="text-2xl font-black text-emerald-400">
                    {customerShipments.filter(s => s.status === 'DELIVERED').length}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                 <h4 className="text-sm font-bold text-foreground/80 flex items-center gap-2">
                    <Ship className="w-4 h-4 text-primary" />
                    محموله فعلی: {shipment.trackingNumber}
                 </h4>
                 <div className="bg-muted/20 p-4 rounded-2xl border border-border/20">
                    <div className="flex items-center justify-between mb-4">
                       <span className="text-xs text-muted-foreground">وضعیت فرآیند</span>
                       <StatusBadge status={shipment.status} />
                    </div>
                    <Progress value={progressPercent} className="h-2 bg-muted" />
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground font-bold">
                       <span>{shipment.origin}</span>
                       <span>{progressPercent}% تکمیل شده</span>
                       <span>{shipment.destination}</span>
                    </div>
                 </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <h4 className="text-xs font-bold text-muted-foreground mb-4">سایر محموله‌های اخیر</h4>
                <div className="space-y-2">
                   {customerShipments.filter(s => s.id !== shipment.id).slice(0, 3).map(s => (
                     <div key={s.id} className="flex items-center justify-between p-3 bg-muted/10 rounded-xl hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-background/50 flex items-center justify-center text-muted-foreground">
                              <Package className="w-4 h-4" />
                           </div>
                           <span className="text-xs font-mono font-bold text-foreground/80">{s.trackingNumber}</span>
                        </div>
                        <StatusBadge status={s.status} />
                     </div>
                   ))}
                   {customerShipments.length <= 1 && (
                     <p className="text-xs text-muted-foreground text-center py-4 italic">مورد دیگری یافت نشد.</p>
                   )}
                </div>
              </div>

              <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-3">
                <DialogClose render={
                  <Button 
                    variant="outline" 
                    className="w-full sm:w-auto h-12 border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl font-bold order-2 sm:order-1 px-8"
                  >
                     بستن
                  </Button>
                } />
                <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold h-12 rounded-xl order-1 sm:order-2 shadow-lg shadow-primary/10" onClick={() => navigate(`/customers`)}>
                   مشاهده پرونده کامل مشتری
                </Button>
              </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
          <Button 
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold h-10 px-6 md:px-8 rounded-xl shadow-lg shadow-primary/10 text-xs"
            onClick={() => navigate(`/shipments/${shipment.id}/edit`)}
          >
            <Edit className="w-4 h-4 ml-2" />
            ویرایش بار
          </Button>
          {canMoveToExitedArchive ? (
            <Button
              variant="outline"
              className="h-10 rounded-xl border-primary/30 bg-primary/5 px-4 text-xs font-black text-primary"
              onClick={() => setExitedArchiveDialogOpen(true)}
              data-testid="shipment-move-to-exited"
            >
              <Archive className="ml-2 h-4 w-4" />
              انتقال به محموله‌های خروج‌شده
            </Button>
          ) : null}
          {shipment.isExitedArchived && canArchiveShipments ? (
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4 text-xs font-black"
              onClick={() => setRestoreExitedDialogOpen(true)}
              data-testid="shipment-restore-exited"
            >
              <ArchiveRestore className="ml-2 h-4 w-4" />
              بازگردانی به محموله‌های فعال
            </Button>
          ) : null}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left Column - Details */}
        <div className="order-2 min-w-0 space-y-4 md:space-y-6 lg:order-1">
          {shipment.isExitedArchived ? (
            <Card className="overflow-hidden rounded-2xl border-amber-500/20 bg-amber-500/5 shadow-sm" data-testid="shipment-post-exit-panel">
              <CardHeader className="border-b border-amber-500/15 bg-amber-500/10 p-4">
                <CardTitle className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Archive className="h-4 w-4 text-amber-700" />
                  وضعیت پیگیری بعد از خروج
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 md:grid-cols-[12rem_minmax(0,1fr)_12rem_auto] md:items-end">
                <div>
                  <Label className="text-[11px] font-black text-muted-foreground">وضعیت پیگیری بعد از خروج</Label>
                  <select
                    value={postExitDraft.postExitStatus}
                    onChange={(event) => setPostExitDraft((current) => ({ ...current, postExitStatus: event.target.value as PostExitStatus }))}
                    disabled={!canUpdateShipments || isPostExitSaving}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
                  >
                    {Object.entries(POST_EXIT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[11px] font-black text-muted-foreground">یادداشت پیگیری</Label>
                  <Input
                    value={postExitDraft.postExitNote}
                    onChange={(event) => setPostExitDraft((current) => ({ ...current, postExitNote: event.target.value }))}
                    disabled={!canUpdateShipments || isPostExitSaving}
                    placeholder="یادداشت داخلی پیگیری بعد از خروج"
                    className="mt-1 h-10 rounded-lg text-xs"
                    data-testid="shipment-post-exit-note"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-black text-muted-foreground">تاریخ پیگیری بعدی</Label>
                  <Input
                    type="date"
                    value={postExitDraft.postExitFollowUpAt}
                    onChange={(event) => setPostExitDraft((current) => ({ ...current, postExitFollowUpAt: event.target.value }))}
                    disabled={!canUpdateShipments || isPostExitSaving}
                    className="mt-1 h-10 rounded-lg text-xs"
                    data-testid="shipment-post-exit-follow-up-at"
                  />
                </div>
                <div className="flex gap-2">
                  {canUpdateShipments ? (
                    <Button type="button" className="h-10 rounded-lg text-xs font-black" onClick={() => void handleSavePostExit()} disabled={isPostExitSaving} data-testid="shipment-post-exit-save">
                      {isPostExitSaving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
                      ذخیره
                    </Button>
                  ) : null}
                  {canArchiveShipments ? (
                    <Button type="button" variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={() => setRestoreExitedDialogOpen(true)} disabled={isExitedArchiveSaving} data-testid="shipment-post-exit-restore">
                      <ArchiveRestore className="ml-1 h-4 w-4" />
                      بازگردانی به محموله‌های فعال
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <ShipmentChatPanel shipmentId={shipment.id} shipmentCode={shipment.trackingNumber} />

          <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm" data-testid="shipment-documents-panel">
            <CardContent className="p-4 md:p-6">
              <DocumentView shipmentId={shipment.id} />
            </CardContent>
          </Card>

          <ShipmentWorkflowTimeline
            progress={shipmentProgress}
            isLoading={isProgressLoading}
            onStart={handleStartWorkflow}
            onMarkComplete={(step) => openProgressDialog(step, "complete")}
            onSetCurrent={(step) => openProgressDialog(step, "current")}
            onRouteSelect={handleRouteSelect}
            onRevealStep={handleRevealWorkflowStep}
            onAddBlocker={(step) => {
              setBlockerDialogStep(step || null);
              setBlockerDialogOpen(true);
            }}
            onResolveBlocker={handleResolveWorkflowBlocker}
            onAssignTask={openWorkflowTaskDialog}
          />

          <RelatedShipmentTasksPanel
            tasks={shipmentTasks}
            onCreateTask={() => openWorkflowTaskDialog({})}
            onAssignTask={(task) => openWorkflowTaskDialog({ task })}
            onStatusChange={handleRelatedTaskStatus}
          />

          <ShipmentDailyStatusPanel
            shipmentId={shipment.id}
            shipmentCode={shipment.trackingNumber}
            shipmentStatus={shipment.status}
            customerName={shipment.customerName}
            origin={shipment.origin}
            destination={shipment.destination}
          />
        </div>

        {/* Summary Column */}
        <aside className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2">
          <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20 p-4">
              <CardTitle className="flex items-center justify-between gap-3 text-sm font-black">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  خلاصه پرونده
                </span>
                <StatusBadge status={shipment.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/10">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black text-muted-foreground">
                  <span>پیشرفت</span>
                  <span dir="ltr">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              <div className="space-y-2">
                {[
                  { icon: UserPlus, label: "مشتری", value: shipment.customerName },
                  { icon: Package, label: "کانتینر", value: shipment.containerNumber },
                  { icon: Calendar, label: "زمان تحویل", value: shipment.estimatedDelivery },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl bg-muted/30 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/50">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-muted-foreground">{item.label}</p>
                      <p className="mt-0.5 truncate text-xs font-black text-foreground">{item.value || "ثبت نشده"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <CustomerAccessPanel shipmentId={shipment.id} trackingNumber={shipment.trackingNumber} />

          <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
             <div className="relative overflow-hidden border-b border-border/50 bg-muted/20 p-4">
                <Ship className="absolute -bottom-5 -left-5 h-24 w-24 text-primary/10" />
                <h3 className="font-black text-base md:text-lg">اطلاعات حمل</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground" dir="ltr">Logistic Core Info</p>
             </div>
             <CardContent className="space-y-4 p-4">
                <div className="space-y-2">
                   <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/50">
                         <Anchor className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">بندر بارگیری (POL)</p>
                         <p className="text-[11px] md:text-xs font-bold text-foreground truncate">{shipment.origin}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/50">
                         <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">محل تخلیه (POD)</p>
                         <p className="text-[11px] md:text-xs font-bold text-foreground truncate">{shipment.destination}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/50">
                         <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">فری تایم مقصد</p>
                         <p className="text-[11px] md:text-xs font-bold text-emerald-500">{shipment.freeTimeDays} روز کانتینری</p>
                      </div>
                   </div>
                </div>

                <div className="border-t border-border/60 pt-4">
                  <h4 className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 md:mb-4">تیم عملیاتی</h4>
                  <div className="space-y-2">
                     {users.slice(0, 3).map(user => (
                       <div key={user.id} className="flex items-center gap-3 rounded-xl bg-muted/25 p-2.5">
                          <Avatar className="h-8 w-8 shrink-0 border border-border">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback className="bg-background text-[10px] font-black">{user.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-xs font-black text-foreground">{user.name}</p>
                            <p className="truncate text-[10px] font-bold text-muted-foreground">{user.role}</p>
                          </div>
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                       </div>
                     ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="h-10 w-full gap-2 rounded-xl border-border text-xs font-bold text-muted-foreground hover:bg-muted"
                  disabled={!shipment.customerId}
                  onClick={() => shipment.customerId && navigate(`/customers/${shipment.customerId}`)}
                >
                  <Info className="h-4 w-4" />
                  مشاهده پروفایل مشتری
                </Button>
             </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={exitedArchiveDialogOpen} onOpenChange={(open) => {
        if (!open && !isExitedArchiveSaving) {
          setExitedArchiveDialogOpen(false);
          setExitedArchiveReason("");
        }
      }}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">انتقال به محموله‌های خروج‌شده</DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              این محموله از لیست محموله‌های فعال خارج می‌شود اما حذف نخواهد شد. اطلاعات، اسناد، گفتگوها و سوابق آن برای پیگیری‌های بعد از خروج باقی می‌ماند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-black">دلیل انتقال</Label>
            <Input
              value={exitedArchiveReason}
              onChange={(event) => setExitedArchiveReason(event.target.value)}
              placeholder="مثلاً: خروج از گمرک و شروع پیگیری تسویه"
              className="h-10 rounded-lg text-xs"
              data-testid="shipment-exited-archive-reason"
            />
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setExitedArchiveDialogOpen(false)} disabled={isExitedArchiveSaving} data-testid="shipment-exited-archive-cancel">
              انصراف
            </Button>
            <Button type="button" onClick={() => void handleMoveToExitedArchive()} disabled={isExitedArchiveSaving} data-testid="shipment-exited-archive-confirm">
              {isExitedArchiveSaving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Archive className="ml-1 h-4 w-4" />}
              انتقال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreExitedDialogOpen} onOpenChange={(open) => {
        if (!open && !isExitedArchiveSaving) setRestoreExitedDialogOpen(false);
      }}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">بازگردانی به محموله‌های فعال</DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              این محموله دوباره در لیست محموله‌های فعال و صفحات عملیاتی نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setRestoreExitedDialogOpen(false)} disabled={isExitedArchiveSaving} data-testid="shipment-exited-restore-cancel">
              انصراف
            </Button>
            <Button type="button" onClick={() => void handleRestoreExitedShipment()} disabled={isExitedArchiveSaving} data-testid="shipment-exited-restore-confirm">
              {isExitedArchiveSaving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <ArchiveRestore className="ml-1 h-4 w-4" />}
              بازگردانی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShipmentProgressUpdateDialog
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
        step={progressDialogStep}
        mode={progressDialogMode}
        onSubmit={handleProgressDialogSubmit}
      />

      <ShipmentProgressBlockerDialog
        open={blockerDialogOpen}
        onOpenChange={setBlockerDialogOpen}
        progress={shipmentProgress}
        step={blockerDialogStep}
        onSubmit={handleAddWorkflowBlocker}
      />

      <TaskAssignDialog
        open={workflowTaskDialogOpen}
        onOpenChange={setWorkflowTaskDialogOpen}
        members={organizationMembers}
        title={workflowTaskContext.task ? "ارجاع مجدد وظیفه" : "ارجاع وظیفه از گردش کار"}
        defaultTitle={
          workflowTaskContext.task?.title ||
          (workflowTaskContext.blocker
            ? `${workflowTaskContext.blocker.blockerCode} - ${workflowTaskContext.blocker.labelFa}`
            : workflowTaskContext.step
              ? `${workflowTaskContext.step.code} - ${workflowTaskContext.step.labelFa}`
              : `پیگیری محموله ${shipment.trackingNumber}`)
        }
        defaultDescription={
          workflowTaskContext.task?.description ||
          workflowTaskContext.blocker?.internalNote ||
          (workflowTaskContext.step ? `پیگیری مرحله ${workflowTaskContext.step.labelFa}` : "")
        }
        defaultAssignmentNote={workflowTaskContext.task?.assignmentNote || ""}
        defaultPriority={workflowTaskContext.task?.priority || "MEDIUM"}
        defaultDueDate={workflowTaskContext.task?.dueDate || ""}
        isMembersLoading={isWorkflowMembersLoading}
        membersError={workflowMembersError}
        onRetryMembers={loadWorkflowMembers}
        onSubmit={handleWorkflowTaskSubmit}
      />

      {/* Assign Task Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground text-right sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              ارجاع وظیفه عملیاتی
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs text-right">
              تعریف تسک برای مدیریت مرحله <span className="text-primary font-bold">{selectedStep?.name}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">کارمند مسئول</Label>
                <select 
                  className="w-full bg-muted border-border rounded-xl h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                  value={assignForm.userId}
                  onChange={e => setAssignForm({...assignForm, userId: e.target.value})}
                >
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">اولویت</Label>
                <select 
                   className="w-full bg-muted border-border rounded-xl h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                  value={assignForm.priority}
                  onChange={e => setAssignForm({...assignForm, priority: e.target.value as any})}
                >
                  <option value="LOW">پایین</option>
                  <option value="MEDIUM">متوسط</option>
                  <option value="HIGH">بالا</option>
                  <option value="URGENT">فوری</option>
                </select>
              </div>
            </div>

            <ShamsiDateTimeField
              label="تاریخ و ساعت ددلاین"
              date={assignForm.dueDate}
              time={assignForm.deadline}
              onDateChange={(dueDate) => setAssignForm((current) => ({ ...current, dueDate }))}
              onTimeChange={(deadline) => setAssignForm((current) => ({ ...current, deadline }))}
              triggerClassName="bg-muted border-border h-10 text-xs"
            />

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">توضیحات تکمیلی</Label>
              <textarea 
                className="w-full bg-muted border-border rounded-xl p-3 text-xs min-h-[100px] outline-none focus:ring-1 focus:ring-primary"
                placeholder="جزئیات تسک را اینجا بنویسید..."
                value={assignForm.description}
                onChange={e => setAssignForm({...assignForm, description: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1 border-border hover:bg-muted rounded-xl h-11" onClick={() => setIsAssignDialogOpen(false)}>
              انصراف
            </Button>
            <Button className="flex-1 bg-primary text-primary-foreground font-extrabold rounded-xl h-11" onClick={handleAssignTask}>
              ثبت و ارجاع وظیفه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground text-right sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              ثبت گزارش مرحله
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs text-right">
              یادداشت یا گزارش عملیاتی برای مرحله <span className="text-primary font-bold">{selectedStep?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-[11px] font-bold text-muted-foreground pr-1 mb-2 block">متن یادداشت</Label>
            <textarea 
              className="w-full bg-muted border border-border rounded-xl p-4 text-xs min-h-[120px] outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder="شرح عملیات، مشکلات یا توضیحات تکمیلی را اینجا وارد کنید..."
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1 border-border hover:bg-muted text-xs h-11" onClick={() => setIsNoteDialogOpen(false)}>انصراف</Button>
            <Button 
              className="flex-1 bg-primary text-primary-foreground font-extrabold text-xs h-11"
              onClick={() => {
                if (selectedStep) {
                  patchShipmentStep(selectedStep.id, { notes: editingNote }).catch(error => toast.error(error instanceof Error ? error.message : "Could not update step."));
                }
                setIsNoteDialogOpen(false);
              }}
            >
              ثبت و بروزرسانی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
