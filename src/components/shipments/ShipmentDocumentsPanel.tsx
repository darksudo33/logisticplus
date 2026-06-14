import React, { useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck,
  FileIcon,
  FilePlus,
  FileText,
  Info,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { DOCUMENT_TYPE_ALL, DOCUMENT_TYPE_FILTERS, DOCUMENT_TYPE_OPTIONS, getDocumentTypeFilterValue, getDocumentTypeLabel } from "@/src/shared/document-types";
import { downloadBinaryFile } from "@/src/lib/downloads";
import { useMockStore } from "@/src/store/useMockStore";
import type { DocumentType } from "@/src/types";

function ShipmentDocumentView({ shipmentId }: { shipmentId: string }) {
  const documents = useMockStore((state) => state.documents);
  const refreshDocuments = useMockStore((state) => state.refreshDocuments);

  const shipmentDocs = React.useMemo(
    () => documents.filter((document) => document.shipmentId === shipmentId && !document.isArchived),
    [documents, shipmentId]
  );
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(DOCUMENT_TYPE_ALL);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentToArchive, setDocumentToArchive] = useState<{ id: string; name: string } | null>(null);
  const [newDoc, setNewDoc] = useState({
    name: "",
    type: "MISC" as DocumentType,
    note: "",
    visibility: "internal" as "internal" | "customer_visible",
  });

  const filteredDocs = shipmentDocs.filter((document) => {
    const matchesSearch = document.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === DOCUMENT_TYPE_ALL || getDocumentTypeFilterValue(document.type) === typeFilter;
    return matchesSearch && matchesType;
  });
  const hasActiveFilters = searchTerm.trim().length > 0 || typeFilter !== DOCUMENT_TYPE_ALL;

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectDocumentFile = (file: File) => {
    setSelectedFile(file);
    setNewDoc((current) => ({ ...current, name: file.name }));
    toast.info(`فایل "${file.name}" انتخاب شد.`);
  };

  const resetDocumentFilters = () => {
    setSearchTerm("");
    setTypeFilter(DOCUMENT_TYPE_ALL);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      if (newDoc.note.trim()) formData.append("note", newDoc.note.trim());

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
      setNewDoc({ name: "", type: "MISC", note: "", visibility: "internal" });
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

  const handleDownloadDocument = async (document: { id: string; name: string; url?: string }) => {
    try {
      await downloadBinaryFile(document.url || `/api/documents/${encodeURIComponent(document.id)}/download`, document.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document download failed.");
    }
  };

  const getDocTypeInfo = (type: string) => {
    const info: Record<string, { label: string; color: string; icon: typeof FileText }> = {
      ORDER_REGISTRATION: { label: getDocumentTypeLabel("ORDER_REGISTRATION"), color: "text-sky-500", icon: FileCheck },
      COMMERCIAL_CARD: { label: getDocumentTypeLabel("COMMERCIAL_CARD"), color: "text-cyan-600", icon: CheckCircle2 },
      COMMERCIAL_DOCUMENTS: { label: getDocumentTypeLabel("COMMERCIAL_DOCUMENTS"), color: "text-emerald-600", icon: FileText },
      SHIPPING_DOCUMENTS: { label: getDocumentTypeLabel("SHIPPING_DOCUMENTS"), color: "text-blue-600", icon: Package },
      CUSTOMS: { label: getDocumentTypeLabel("CUSTOMS"), color: "text-purple-600", icon: Info },
      PERMITS: { label: getDocumentTypeLabel("PERMITS"), color: "text-amber-600", icon: CheckCircle2 },
      BANKING: { label: getDocumentTypeLabel("BANKING"), color: "text-indigo-600", icon: FileCheck },
      EXIT: { label: getDocumentTypeLabel("EXIT"), color: "text-rose-600", icon: Package },
      MISC: { label: getDocumentTypeLabel("MISC"), color: "text-slate-500", icon: FileIcon },
    };
    return info[getDocumentTypeFilterValue(type)] || info.MISC;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">مدیریت مستندات</h3>
            <p className="text-[10px] font-medium text-muted-foreground">مجموع اسناد: {shipmentDocs.length} فایل</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0">
            <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="جستجو در اسناد..."
              className="h-9 w-full rounded-lg border-border bg-muted/50 pr-9 text-[11px] outline-none focus:ring-1 focus:ring-primary sm:w-48"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <Dialog open={isAddDocOpen} onOpenChange={setIsAddDocOpen}>
            <DialogTrigger
              render={
                <Button className="h-9 gap-2 rounded-lg bg-primary px-4 text-[11px] font-bold text-primary-foreground hover:bg-primary/90">
                  <FilePlus className="h-3.5 w-3.5" />
                  بارگذاری مدرک
                </Button>
              }
            />
            <DialogContent className="bg-card text-right text-foreground" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">بارگذاری سند جدید</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  فایل‌های معتبر: PDF، تصویر، Word، Excel، CSV، TXT و RTF (حداکثر ۲۵ مگابایت)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div
                  className={cn(
                    "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/50 p-8 text-center transition-colors hover:border-primary/50",
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
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-primary">
                    <Plus className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-bold text-foreground/80">
                    {newDoc.name || "انتخاب فایل از سیستم"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">یا فایل را به اینجا بکشید</p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="pr-1 text-[11px] font-bold text-muted-foreground">عنوان سند</Label>
                    <Input
                      placeholder="مثال: بارنامه اصلی"
                      className="h-10 border-border bg-muted text-xs focus:ring-primary"
                      value={newDoc.name}
                      onChange={(event) => setNewDoc({ ...newDoc, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="pr-1 text-[11px] font-bold text-muted-foreground">نوع طبقه‌بندی</Label>
                    <select
                      className="h-10 w-full rounded-lg border-border bg-muted px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                      value={newDoc.type}
                      onChange={(event) => setNewDoc({ ...newDoc, type: event.target.value as DocumentType })}
                    >
                      {DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="pr-1 text-[11px] font-bold text-muted-foreground">نمایش برای مشتری</Label>
                    <select
                      className="h-10 w-full rounded-lg border-border bg-muted px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                      value={newDoc.visibility}
                      onChange={(event) => setNewDoc({ ...newDoc, visibility: event.target.value as any })}
                    >
                      <option value="internal">فقط داخلی</option>
                      <option value="customer_visible">قابل مشاهده برای مشتری</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="pr-1 text-[11px] font-bold text-muted-foreground">یادداشت سند</Label>
                    <textarea
                      className="min-h-20 w-full resize-y rounded-lg border border-input bg-muted px-3 py-2 text-xs font-bold leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      placeholder="توضیح داخلی یا نکته مربوط به این سند..."
                      value={newDoc.note}
                      onChange={(event) => setNewDoc({ ...newDoc, note: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" className="h-11 flex-1 border-border text-xs hover:bg-muted" onClick={() => setIsAddDocOpen(false)}>
                  انصراف
                </Button>
                <Button disabled={uploading} className="h-11 flex-1 bg-primary text-xs font-extrabold text-primary-foreground" onClick={handleAddDoc}>
                  {uploading ? <ActionSkeleton inverted className="w-32" /> : "تایید و نهایی‌سازی"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="shipment-document-type-filters">
        {DOCUMENT_TYPE_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-lg px-3 text-[11px] font-bold whitespace-nowrap",
              typeFilter === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/40">
        {filteredDocs.map((document, index) => {
          const typeInfo = getDocTypeInfo(document.type);
          const Icon = typeInfo.icon;
          const documentHref = document.url || `/api/documents/${encodeURIComponent(document.id)}/download`;

          return (
            <div
              key={document.id}
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
                    <h4 className="max-w-full truncate text-sm font-black text-foreground transition-colors group-hover:text-primary">{document.name}</h4>
                    <Badge variant="outline" className={cn("h-5 border-transparent bg-muted/70 px-2 text-[10px] font-bold", typeInfo.color)}>
                      {typeInfo.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground">
                    <span>{document.fileSize}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span className="truncate">توسط: {document.uploadedBy}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span className="font-mono">{document.createdAt}</span>
                  </div>
                  {document.note ? (
                    <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-4 text-muted-foreground">{document.note}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 md:shrink-0 md:justify-end md:border-t-0 md:pt-0">
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-muted-foreground"
                  value={document.visibility || "internal"}
                  onChange={(event) => handleVisibilityChange(document.id, event.target.value as any)}
                >
                  <option value="internal">داخلی</option>
                  <option value="customer_visible">مشتری</option>
                </select>

                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary">
                    <a href={documentHref} target="_blank" rel="noreferrer" aria-label={`Open ${document.name}`} title="Open document">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => handleDownloadDocument(document)}
                    aria-label={`Download ${document.name}`}
                    title="Download document"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => setDocumentToArchive({ id: document.id, name: document.name })}
                    aria-label={`Archive ${document.name}`}
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
            <h4 className="text-sm font-bold text-muted-foreground">
              {shipmentDocs.length === 0 ? "هنوز سندی بارگذاری نشده است" : "سندی با این فیلترها پیدا نشد"}
            </h4>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {shipmentDocs.length === 0 ? "برای شروع، اولین مدرک را بارگذاری کنید" : "جستجو یا نوع سند را تغییر دهید تا نتیجه‌های مرتبط نمایش داده شود."}
            </p>
            <Button
              variant="outline"
              className="mt-6 h-9 rounded-xl border-border px-6 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={hasActiveFilters ? resetDocumentFilters : () => setIsAddDocOpen(true)}
            >
              {hasActiveFilters ? "پاک کردن فیلترها" : "افزودن مدرک"}
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
}

export function ShipmentDocumentsPanel({ shipmentId }: { shipmentId: string }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm" data-testid="shipment-documents-panel">
      <CardContent className="p-4 md:p-6">
        <ShipmentDocumentView shipmentId={shipmentId} />
      </CardContent>
    </Card>
  );
}
