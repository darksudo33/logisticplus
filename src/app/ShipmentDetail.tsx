import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useMockStore } from "@/src/store/useMockStore";
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent 
} from "@/components/ui/tabs";
import { 
  ArrowRight, 
  Ship, 
  MapPin, 
  Calendar, 
  Truck, 
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
  ShieldCheck,
  EyeOff
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
import { ShipmentStatus, StepStatus, TaskStatus, DocumentType } from "../types";

const DocumentView = ({ shipmentId }: { shipmentId: string }) => {
  const documents = useMockStore(state => state.documents);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  
  const shipmentDocs = React.useMemo(() => 
    documents.filter(d => d.shipmentId === shipmentId && !d.isArchived),
    [documents, shipmentId]
  );
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({
    name: "",
    type: "OTHER" as DocumentType,
    visibility: "internal" as "internal" | "customer_visible",
  });

  const filteredDocs = shipmentDocs.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setNewDoc(prev => ({ ...prev, name: file.name }));
      toast.info(`فایل "${file.name}" انتخاب شد.`);
    }
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
      await loadCurrentUserRecords();
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
      toast.error(payload.error?.message || "بایگانی سند ناموفق بود.");
      return;
    }
    await loadCurrentUserRecords();
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
    await loadCurrentUserRecords();
    toast.success("دسترسی سند بروزرسانی شد.");
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
                  className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
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

      {/* Grid View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredDocs.map(doc => {
          const typeInfo = getDocTypeInfo(doc.type);
          const Icon = typeInfo.icon;
          return (
            <div key={doc.id} className="bg-muted/20 p-4 rounded-2xl border border-border/20 hover:border-primary/40 hover:bg-muted/40 transition-all group relative">
              <div className="flex flex-col h-full justify-between gap-4">
                <div className="flex items-start justify-between">
                  <div className={cn("w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center", typeInfo.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                      onClick={() => handleArchiveDoc(doc.id)}
                      aria-label={`Archive ${doc.name}`}
                      title="Archive document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors line-clamp-1">{doc.name}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={cn("bg-transparent border-none p-0 text-[10px] font-bold", typeInfo.color)}>
                      {typeInfo.label}
                    </Badge>
                    <span className="w-1 h-1 rounded-full bg-muted" />
                    <span className="text-[10px] text-muted-foreground font-medium">{doc.fileSize}</span>
                  </div>
                  <select
                    className="mt-3 h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-muted-foreground"
                    value={doc.visibility || "internal"}
                    onChange={(event) => handleVisibilityChange(doc.id, event.target.value as any)}
                  >
                    <option value="internal">داخلی</option>
                    <option value="customer_visible">مشتری</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-border/20 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="w-2 h-2 text-muted-foreground" />
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate">توسط: {doc.uploadedBy}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono">{doc.createdAt}</span>
                </div>
              </div>
              
              <div className="absolute top-2 right-2 opacity-100 transition-opacity">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                >
                  <a
                    href={doc.url || `/api/documents/${encodeURIComponent(doc.id)}/download`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${doc.name}`}
                    title="Open document"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>
          );
        })}

        {filteredDocs.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-card/30 border-2 border-dashed border-border rounded-3xl group cursor-pointer hover:border-primary/30 transition-all">
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mb-4 group-hover:scale-110 transition-transform">
              <FilePlus className="w-10 h-10" />
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
    <Card className="rounded-xl border-border/80 bg-card shadow-sm">
      <CardHeader className="p-4 pb-2">
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
      <CardContent className="space-y-4 p-4 pt-2">
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-right">
          <p className="text-[11px] font-bold text-muted-foreground">شماره رهگیری</p>
          <p className="mt-1 text-sm font-black text-foreground">{trackingNumber}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" className="gap-1 text-[11px]" disabled={isLoading} onClick={() => runAccessAction("generate")}>
            {isLoading ? (
              <ActionSkeleton inverted className="w-14" />
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                ساخت لینک
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-[11px]" disabled={isLoading || !access?.hasToken} onClick={() => runAccessAction("reset")}>
            {isLoading ? (
              <ActionSkeleton className="w-14" />
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                بازنشانی
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-[11px] text-red-600 hover:text-red-700" disabled={isLoading || !access?.enabled} onClick={() => runAccessAction("disable")}>
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
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
            <div className="flex items-center gap-2">
              <Input value={rawLink} readOnly className="h-9 bg-white text-left text-[11px]" dir="ltr" />
              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-white" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {qrDataUrl && (
              <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
                <img src={qrDataUrl} alt="Customer tracking QR code" className="h-36 w-36" />
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

        <div className="space-y-2 rounded-xl border border-border/80 p-3">
          <Label className="text-[11px] font-black">عنوان وضعیت عمومی</Label>
          <Input value={publicLabel} onChange={(event) => setPublicLabel(event.target.value)} placeholder="محموله در حال بررسی گمرکی است" className="h-9 text-xs" />
          <Label className="text-[11px] font-black">توضیح قابل نمایش برای مشتری</Label>
          <Input value={publicDescription} onChange={(event) => setPublicDescription(event.target.value)} placeholder="به روزرسانی امن و قابل نمایش برای مشتری" className="h-9 text-xs" />
          <label className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
            <input type="checkbox" checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} />
            نمایش این وضعیت در صفحه رهگیری مشتری
          </label>
          <Button size="sm" variant="secondary" className="w-full text-[11px]" disabled={isLoading} onClick={savePublicStatus}>
            {isLoading ? <ActionSkeleton className="w-32" /> : "ذخیره وضعیت عمومی"}
          </Button>
        </div>
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
  
  const shipment = React.useMemo(() => shipments.find(s => s.id === id), [shipments, id]);
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
  const [assignForm, setAssignForm] = useState({
    userId: users[0]?.id || "",
    priority: "MEDIUM" as const,
    dueDate: format(addDays(new Date(), 7), "yyyy/MM/dd"),
    deadline: "12:00",
    description: ""
  });

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

  const completedSteps = steps.filter(s => s.status === "COMPLETED").length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

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
        deadline: "12:00",
        description: ""
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign task.");
    }
  };

  const customer = React.useMemo(() => customers.find(c => c.id === shipment?.customerId), [customers, shipment?.customerId]);
  const customerShipments = React.useMemo(() => shipments.filter(s => s.customerId === shipment?.customerId), [shipments, shipment?.customerId]);
  const [isCustomerSummaryOpen, setIsCustomerSummaryOpen] = useState(false);

  return (
    <div className="app-page space-y-5 font-sans text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4 truncate">
          <Button 
            variant="ghost" 
            size="icon" 
            className="bg-muted text-muted-foreground hover:text-foreground rounded-xl h-10 w-10 shrink-0"
            onClick={() => navigate("/shipments")}
          >
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 md:mb-1">
              <h1 className="text-xl md:text-2xl font-black text-foreground truncate">{shipment.trackingNumber}</h1>
              <div className="shrink-0 scale-90 md:scale-100 origin-right">
                <StatusBadge status={shipment.status} />
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 text-muted-foreground text-[10px] md:text-xs">
              <span className="flex items-center gap-1 truncate"><UserPlus className="w-3.5 h-3.5" /> {shipment.customerName}</span>
              <span className="w-1 h-1 rounded-full bg-border shrink-0" />
              <span className="flex items-center gap-1 font-mono tracking-wider truncate">{shipment.containerNumber}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
                          <DialogTitle className="text-xl font-black">{customer?.name || shipment.customerName}</DialogTitle>
                          <DialogDescription className="text-muted-foreground text-xs">{customer?.company || "شرکت بازرگانی مربوطه"}</DialogDescription>
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <Card className="bg-card border-border rounded-xl shadow-sm border-t-4 border-t-primary overflow-hidden">
            <CardContent className="p-4 md:p-6">
              <DocumentView shipmentId={shipment.id} />
            </CardContent>
          </Card>

          <Tabs defaultValue="steps" className="w-full">
            <TabsContent value="steps" className="space-y-4 md:space-y-6 focus-visible:outline-none">
              {/* Progress Overview */}
              <Card className="bg-card border-border rounded-xl overflow-hidden shadow-sm border-t-2 border-t-primary/20">
                <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    <h3 className="font-bold text-xs md:text-base text-foreground/90">پیشرفت لجستیک</h3>
                  </div>
                  <TabsList className="bg-muted p-0.5 rounded-lg h-8">
                    <TabsTrigger value="steps" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 h-7 text-[9px] md:text-xs font-black">
                      مراحل
                    </TabsTrigger>
                    <TabsTrigger value="info" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 h-7 text-[9px] md:text-xs font-black">
                      جزییات
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="p-4 md:p-6 focus-visible:outline-none">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-muted-foreground">درصد تکمیل فرآیند</span>
                    <span className="text-xl md:text-2xl font-black text-primary">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2 md:h-3 bg-muted" />
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6 md:mt-8">
                    <div className="bg-muted/30 p-2 md:p-3 rounded-xl border border-border/30">
                      <p className="text-[8px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1 uppercase tracking-wider">مبداء</p>
                      <p className="text-[10px] md:text-sm font-bold truncate">{shipment.origin}</p>
                    </div>
                    <div className="bg-muted/30 p-2 md:p-3 rounded-xl border border-border/30">
                      <p className="text-[8px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1 uppercase tracking-wider">مقصد</p>
                      <p className="text-[10px] md:text-sm font-bold truncate">{shipment.destination}</p>
                    </div>
                    <div className="bg-muted/30 p-2 md:p-3 rounded-xl border border-border/30">
                      <p className="text-[8px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1 uppercase tracking-wider">ثبت</p>
                      <p className="text-[10px] md:text-sm font-bold truncate">{shipment.createdAt}</p>
                    </div>
                    <div className="bg-muted/30 p-2 md:p-3 rounded-xl border border-border/30 ring-1 ring-primary/20">
                      <p className="text-[8px] md:text-[10px] text-primary mb-0.5 md:mb-1 uppercase tracking-wider font-black">زمان تحویل</p>
                      <p className="text-[10px] md:text-sm font-bold truncate text-primary">{shipment.estimatedDelivery}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Shipment Timeline / Steps */}
              <Card className="bg-card border-border rounded-xl shadow-sm">
                <CardHeader className="p-4 border-b border-border/50">
                  <CardTitle className="text-sm md:text-lg font-bold flex items-center gap-2 text-foreground">
                    <Package className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                    فرآیند حمل و ترخیص
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  <div className="relative">
                    {/* Vertical Line */}
                    <div className="absolute top-0 bottom-0 right-[13px] md:right-4 w-0.5 bg-border" />
                    
                    <div className="space-y-6 md:space-y-8 relative">
                      {steps.map((step, index) => {
                        const linkedTasks = shipmentTasks.filter(t => t.title.includes(step.name));
                        return (
                          <div key={step.id} className="flex gap-3 md:gap-6">
                            <div className="relative flex flex-col items-center">
                              <div className={cn(
                                "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center z-10 border-4 border-card shrink-0",
                                step.status === "COMPLETED" ? "bg-emerald-500 text-white" : 
                                step.status === "IN_PROGRESS" ? "bg-primary text-primary-foreground animate-pulse" : 
                                "bg-muted text-muted-foreground"
                              )}>
                                {step.status === "COMPLETED" ? <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> : 
                                 step.status === "IN_PROGRESS" ? <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" /> : 
                                 <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                              </div>
                            </div>
                            <div className="flex-1 bg-muted/30 rounded-2xl p-2.5 md:p-4 border border-border/20 hover:border-primary/30 transition-all group">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 md:gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 md:gap-2 mb-1">
                                    <h4 className={cn(
                                      "font-black text-[10px] md:text-sm truncate",
                                      step.status === "COMPLETED" ? "text-foreground" : 
                                      step.status === "IN_PROGRESS" ? "text-primary" : 
                                      "text-muted-foreground"
                                    )}>
                                      {step.name}
                                    </h4>
                                    {step.completedAt && (
                                      <span className="text-[8px] md:text-[10px] text-muted-foreground font-mono shrink-0">{step.completedAt}</span>
                                    )}
                                  </div>
                                  <p className="text-[9px] md:text-xs text-muted-foreground group-hover:text-foreground/80 leading-relaxed max-w-lg transition-colors">
                                    {step.notes || `فرآیند عملیاتی مربوط به مرحله ${step.name} در محموله لجستیکی.`}
                                  </p>
                                  
                                  {linkedTasks.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {linkedTasks.map(task => (
                                        <Badge key={task.id} variant="outline" className="bg-background/50 text-[7px] md:text-[10px] gap-1 py-0 px-1 md:px-2 border-border rounded-md">
                                          <div className={cn("w-1 h-1 md:w-1.5 md:h-1.5 rounded-full", task.status === "DONE" ? "bg-emerald-500" : "bg-primary")} />
                                          {task.assignedToName}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                
                                   <div className="flex items-center justify-start sm:justify-end gap-1.5 shrink-0 border-t border-border/50 sm:border-t-0 pt-2.5 sm:pt-0">
                                     <Button 
                                       variant="ghost" 
                                       size="icon" 
                                       className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground hover:text-primary rounded-lg"
                                       onClick={() => {
                                         setSelectedStep(step);
                                         setEditingNote(step.notes || "");
                                         setIsNoteDialogOpen(true);
                                       }}
                                     >
                                       <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                     </Button>

                                     {step.status !== "COMPLETED" ? (
                                       <Button 
                                         variant="ghost" 
                                         size="sm" 
                                         className="h-6 md:h-8 text-[8px] md:text-[11px] font-black text-emerald-500 hover:bg-emerald-500/10 px-2 md:px-3 rounded-lg border border-emerald-500/20"
                                         onClick={() => patchShipmentStep(step.id, { 
                                           status: "COMPLETED", 
                                           completedAt: new Date().toLocaleDateString("fa-IR") 
                                         }).catch(error => toast.error(error instanceof Error ? error.message : "Could not update step."))}
                                       >
                                         <Check className="w-3 md:w-3.5 h-3 md:h-3.5 ml-1 md:ml-1.5" />
                                         تکمیل مرحله
                                       </Button>
                                     ) : (
                                       <Button 
                                         variant="ghost" 
                                         size="sm" 
                                         className="h-6 md:h-8 text-[8px] md:text-[11px] font-black text-muted-foreground hover:bg-muted/50 px-2 md:px-3 rounded-lg"
                                         onClick={() => patchShipmentStep(step.id, { status: "IN_PROGRESS" }).catch(error => toast.error(error instanceof Error ? error.message : "Could not update step."))}
                                       >
                                         <Clock className="w-3 md:w-3.5 h-3 md:h-3.5 ml-1 md:ml-1.5" />
                                         بازنشانی
                                       </Button>
                                     )}
                                     
                                     {EMPLOYEE_MANAGED_STEPS.includes(step.name) && step.status !== "COMPLETED" && (
                                     <Button 
                                       variant="ghost" 
                                       size="sm" 
                                       className="h-6 md:h-8 text-[8px] md:text-[11px] font-black text-primary hover:bg-primary/10 px-2 md:px-3 rounded-lg"
                                       onClick={() => {
                                         setSelectedStep(step);
                                         setIsAssignDialogOpen(true);
                                       }}
                                     >
                                       <UserPlus className="w-3 md:w-3.5 h-3 md:h-3.5 ml-1 md:ml-1.5" />
                                       ارجاع
                                     </Button>
                                   )}
                                   <Button variant="ghost" size="icon" className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground hover:text-foreground rounded-lg">
                                     <MoreVertical className="w-3 h-3 md:w-4 md:h-4" />
                                   </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="info" className="focus-visible:outline-none">
              <Card className="bg-card border-border rounded-xl shadow-sm border-t-2 border-t-primary/20 ">
                <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    <h3 className="font-bold text-xs md:text-base text-foreground/90">اطلاعات تکمیلی بار</h3>
                  </div>
                  <TabsList className="bg-muted p-0.5 rounded-lg h-8">
                    <TabsTrigger value="steps" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 h-7 text-[9px] md:text-xs font-black">
                      مراحل
                    </TabsTrigger>
                    <TabsTrigger value="info" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 h-7 text-[9px] md:text-xs font-black">
                      جزییات
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-4">
                      <h4 className="text-xs md:text-sm font-bold text-primary border-r-2 border-primary pr-3">مشخصات کانتینر</h4>
                      <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-muted/20 p-2.5 md:p-3 rounded-xl border border-border/20">
                          <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1">نوع کانتینر</p>
                          <p className="text-[11px] md:text-xs font-bold text-foreground">40ft High Cube</p>
                        </div>
                        <div className="bg-muted/20 p-2.5 md:p-3 rounded-xl border border-border/20">
                          <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1">تعداد واحد</p>
                          <p className="text-[11px] md:text-xs font-bold text-foreground">۲ دستگاه</p>
                        </div>
                        <div className="bg-muted/20 p-2.5 md:p-3 rounded-xl border border-border/20">
                          <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1">وزن کل</p>
                          <p className="text-[11px] md:text-xs font-bold text-foreground">۱۲,۴۰۰ کیلوگرم</p>
                        </div>
                        <div className="bg-muted/20 p-2.5 md:p-3 rounded-xl border border-border/20">
                          <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5 md:mb-1">حجم (CBM)</p>
                          <p className="text-[11px] md:text-xs font-bold text-foreground">۱۲۰ متر مکعب</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-xs md:text-sm font-bold text-primary border-r-2 border-primary pr-3">اطلاعات گمرکی</h4>
                      <div className="space-y-2 md:space-y-3">
                        <div className="flex items-center justify-between p-2.5 md:p-3 bg-muted/20 rounded-xl border border-border/20">
                          <span className="text-[11px] md:text-xs text-muted-foreground">کد تعرفه (HS)</span>
                          <span className="text-[11px] md:text-xs font-mono font-bold text-foreground">8471.30.00</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 md:p-3 bg-muted/20 rounded-xl border border-border/20">
                          <span className="text-[11px] md:text-xs text-muted-foreground">کشور سازنده</span>
                          <span className="text-[11px] md:text-xs font-bold text-foreground">چین</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 md:p-3 bg-muted/20 rounded-xl border border-border/20">
                          <span className="text-[11px] md:text-xs text-muted-foreground">ارزش اظهاری</span>
                          <span className="text-[11px] md:text-xs font-bold text-emerald-500">$۴۵,۰۰۰ USD</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - Info Bar */}
        <div className="space-y-4 md:space-y-6">
          <CustomerAccessPanel shipmentId={shipment.id} trackingNumber={shipment.trackingNumber} />

          <Card className="bg-card border-border rounded-xl shadow-sm overflow-hidden">
             <div className="bg-primary p-4 md:p-5 text-primary-foreground h-20 md:h-24 relative overflow-hidden">
                < Ship className="w-24 md:w-32 h-24 md:h-32 absolute -bottom-6 md:-bottom-8 -left-6 md:-left-8 opacity-10" />
                <h3 className="font-black text-base md:text-lg">اطلاعات حمل</h3>
                <p className="text-[9px] md:text-[11px] opacity-70 font-bold uppercase tracking-widest">Logistic Core Info</p>
             </div>
             <CardContent className="p-4 md:p-6 space-y-4 md:space-y-6">
                <div className="space-y-3 md:space-y-4">
                   <div className="flex items-start gap-3">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                         <Anchor className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">بندر بارگیری (POL)</p>
                         <p className="text-[11px] md:text-xs font-bold text-foreground truncate">{shipment.origin}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                         <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">بندر تخلیه (POD)</p>
                         <p className="text-[11px] md:text-xs font-bold text-foreground truncate">{shipment.destination}</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-3">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                         <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-[9px] md:text-[10px] text-muted-foreground mb-0.5">فری تایم مقصد</p>
                         <p className="text-[11px] md:text-xs font-bold text-emerald-500">{shipment.freeTimeDays} روز کانتینری</p>
                      </div>
                   </div>
                </div>

                <div className="pt-4 md:pt-6 border-t border-border">
                  <h4 className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 md:mb-4">تیم عملیاتی</h4>
                  <div className="space-y-2.5 md:space-y-3">
                     {users.slice(0, 3).map(user => (
                       <div key={user.id} className="flex items-center gap-3">
                          <Avatar className="w-7 h-7 md:w-8 md:h-8 border border-border shrink-0">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback className="bg-muted text-[9px]">{user.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] md:text-xs font-bold text-foreground/90 truncate">{user.name}</p>
                            <p className="text-[8px] md:text-[9px] text-muted-foreground truncate">{user.role}</p>
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                       </div>
                     ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-border hover:bg-muted text-muted-foreground text-[10px] md:text-xs font-bold gap-2 rounded-xl h-10 md:h-14"
                  disabled={!shipment.customerId}
                  onClick={() => shipment.customerId && navigate(`/customers/${shipment.customerId}`)}
                >
                  <Info className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  مشاهده پروفایل مشتری
                </Button>
             </CardContent>
          </Card>
        </div>
      </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">تاریخ سررسید</Label>
                <input 
                  type="text"
                  placeholder="۱۴۰۳/۰۵/۰۱"
                  className="w-full bg-muted border-border rounded-xl h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                  value={assignForm.dueDate}
                  onChange={e => setAssignForm({...assignForm, dueDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">ساعت ددلاین</Label>
                <input 
                  type="text"
                  placeholder="۱۲:۰۰"
                  className="w-full bg-muted border-border rounded-xl h-10 text-xs px-3 outline-none focus:ring-1 focus:ring-primary"
                  value={assignForm.deadline}
                  onChange={e => setAssignForm({...assignForm, deadline: e.target.value})}
                />
              </div>
            </div>

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
