import React, { useMemo, useRef, useState } from "react";
import { format } from "date-fns-jalali";
import {
  CalendarClock,
  CheckCircle2,
  ClockAlert,
  Eye,
  FileText,
  IdCard,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { EmptyState, EmptyTableRow, resetFiltersAction } from "@/src/components/EmptyState";
import {
  getShamsiDatePart,
  parseShamsiDateTimeValue,
  ShamsiDateTimeField,
  toEnglishDigits,
  toPersianDigits,
} from "@/src/components/ShamsiDateTimeField";
import { useMockStore } from "@/src/store/useMockStore";
import type { CommercialCard, CommercialCardDocument, CommercialCardStatus } from "@/src/types";

type StatusFilter = "ALL" | CommercialCardStatus;

type CommercialCardFormState = {
  holderName: string;
  cardNumber: string;
  issueDate: string;
  expirationDate: string;
  nationalId: string;
  responsibleName: string;
  responsiblePhone: string;
  description: string;
  documents: CommercialCardDocument[];
};

type DocumentDraft = {
  title: string;
  description: string;
  file: File | null;
};

const emptyCardForm: CommercialCardFormState = {
  holderName: "",
  cardNumber: "",
  issueDate: "",
  expirationDate: "",
  nationalId: "",
  responsibleName: "",
  responsiblePhone: "",
  description: "",
  documents: [],
};

const emptyDocumentDraft: DocumentDraft = {
  title: "",
  description: "",
  file: null,
};

const statusMeta: Record<CommercialCardStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  VALID: {
    label: "معتبر",
    icon: CheckCircle2,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  EXPIRING_SOON: {
    label: "نزدیک به انقضا",
    icon: ClockAlert,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  },
  EXPIRED: {
    label: "منقضی‌شده",
    icon: XCircle,
    className: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  },
};

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "همه" },
  { value: "VALID", label: "معتبر" },
  { value: "EXPIRING_SOON", label: "نزدیک به انقضا" },
  { value: "EXPIRED", label: "منقضی‌شده" },
];

const normalizeSearch = (value?: string) => toEnglishDigits(value || "").trim().toLowerCase();

const parseDateStart = (value?: string) => parseShamsiDateTimeValue(value, "00:00");

const parseDateEnd = (value?: string) => {
  const date = parseShamsiDateTimeValue(value, "23:59");
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};

const getCommercialCardStatus = (expirationDate: string): CommercialCardStatus => {
  const expiration = parseDateEnd(expirationDate);
  if (!expiration) return "EXPIRING_SOON";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiration = Math.ceil((expiration.getTime() - today.getTime()) / 86_400_000);
  if (daysUntilExpiration < 0) return "EXPIRED";
  if (daysUntilExpiration <= 30) return "EXPIRING_SOON";
  return "VALID";
};

const formatShamsiDate = (value?: string) => {
  const datePart = getShamsiDatePart(value);
  return datePart ? toPersianDigits(datePart) : "ثبت نشده";
};

const formatUploadDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  return toPersianDigits(format(date, "yyyy/MM/dd"));
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${toPersianDigits(kilobytes.toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((kilobytes / 1024).toFixed(1))} مگابایت`;
};

const toFormState = (card: CommercialCard): CommercialCardFormState => ({
  holderName: card.holderName || "",
  cardNumber: card.cardNumber || "",
  issueDate: card.issueDate || "",
  expirationDate: card.expirationDate || "",
  nationalId: card.nationalId || "",
  responsibleName: card.responsibleName || "",
  responsiblePhone: card.responsiblePhone || "",
  description: card.description || "",
  documents: card.documents || [],
});

function StatusBadge({ status }: { status: CommercialCardStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("h-7 gap-1.5 rounded-full px-3 text-[11px] font-black", meta.className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] font-bold text-destructive">{message}</p>;
}

export default function CommercialCards() {
  const commercialCards = useMockStore((state) => state.commercialCards);
  const addCommercialCard = useMockStore((state) => state.addCommercialCard);
  const updateCommercialCard = useMockStore((state) => state.updateCommercialCard);
  const deleteCommercialCard = useMockStore((state) => state.deleteCommercialCard);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CommercialCardFormState>(emptyCardForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(emptyDocumentDraft);
  const [viewingCard, setViewingCard] = useState<CommercialCard | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CommercialCard | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cardsWithStatus = useMemo(
    () =>
      commercialCards.map((card) => ({
        card,
        status: getCommercialCardStatus(card.expirationDate),
        expirationTime: parseDateEnd(card.expirationDate)?.getTime() ?? Number.MAX_SAFE_INTEGER,
      })),
    [commercialCards]
  );

  const filteredCards = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return cardsWithStatus
      .filter(({ card, status }) => {
        const matchesStatus = statusFilter === "ALL" || status === statusFilter;
        if (!matchesStatus) return false;
        if (!term) return true;
        const searchable = [
          card.holderName,
          card.cardNumber,
          card.responsibleName,
          card.nationalId,
        ]
          .map(normalizeSearch)
          .join(" ");
        return searchable.includes(term);
      })
      .sort((left, right) => left.expirationTime - right.expirationTime)
      .map(({ card }) => card);
  }, [cardsWithStatus, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const totalDocuments = commercialCards.reduce((sum, card) => sum + (card.documents?.length || 0), 0);
    return [
      { label: "کل کارت‌ها", value: commercialCards.length, icon: IdCard, tone: "bg-primary/10 text-primary" },
      { label: "نزدیک به انقضا", value: cardsWithStatus.filter((item) => item.status === "EXPIRING_SOON").length, icon: ClockAlert, tone: "bg-amber-500/10 text-amber-700" },
      { label: "منقضی‌شده", value: cardsWithStatus.filter((item) => item.status === "EXPIRED").length, icon: XCircle, tone: "bg-rose-500/10 text-rose-700" },
      { label: "اسناد مرتبط", value: totalDocuments, icon: Paperclip, tone: "bg-emerald-500/10 text-emerald-700" },
    ];
  }, [commercialCards, cardsWithStatus]);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
  };

  const resetForm = () => {
    setEditingCardId(null);
    setFormData(emptyCardForm);
    setFormErrors({});
    setDocumentDraft(emptyDocumentDraft);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCreateDialog = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditDialog = (card: CommercialCard) => {
    setEditingCardId(card.id);
    setFormData(toFormState(card));
    setFormErrors({});
    setDocumentDraft(emptyDocumentDraft);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const holderName = formData.holderName.trim();
    const cardNumber = formData.cardNumber.trim();
    const issueDate = formData.issueDate.trim();
    const expirationDate = formData.expirationDate.trim();

    if (!holderName) nextErrors.holderName = "وارد کردن نام شرکت / دارنده کارت الزامی است.";
    if (!cardNumber) nextErrors.cardNumber = "وارد کردن شماره کارت بازرگانی الزامی است.";
    if (!issueDate) nextErrors.issueDate = "وارد کردن تاریخ صدور الزامی است.";
    if (!expirationDate) nextErrors.expirationDate = "وارد کردن تاریخ انقضا الزامی است.";

    const issue = parseDateStart(issueDate);
    const expiration = parseDateEnd(expirationDate);
    if (issueDate && expirationDate && issue && expiration && expiration.getTime() < issue.getTime()) {
      nextErrors.expirationDate = "تاریخ انقضا نمی‌تواند قبل از تاریخ صدور باشد.";
    }

    setFormErrors(nextErrors);
    return nextErrors;
  };

  const handleSaveCard = () => {
    const errors = validateForm();
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error(firstError);
      return;
    }

    const payload = {
      holderName: formData.holderName.trim(),
      cardNumber: formData.cardNumber.trim(),
      issueDate: formData.issueDate.trim(),
      expirationDate: formData.expirationDate.trim(),
      nationalId: formData.nationalId.trim(),
      responsibleName: formData.responsibleName.trim(),
      responsiblePhone: formData.responsiblePhone.trim(),
      description: formData.description.trim(),
      documents: formData.documents,
    };

    try {
      if (editingCardId) {
        updateCommercialCard(editingCardId, payload);
        toast.success("کارت بازرگانی با موفقیت ویرایش شد.");
      } else {
        addCommercialCard(payload);
        toast.success("کارت بازرگانی با موفقیت ثبت شد.");
      }
      setIsFormOpen(false);
      resetForm();
    } catch {
      toast.error("خطایی رخ داد. لطفاً دوباره تلاش کنید.");
    }
  };

  const handleAddDocument = () => {
    const title = documentDraft.title.trim() || documentDraft.file?.name || "";
    if (!title) {
      toast.error("عنوان سند را وارد کنید.");
      return;
    }

    const document: CommercialCardDocument = {
      id: `ccd${Date.now()}`,
      title,
      fileName: documentDraft.file?.name,
      fileSize: documentDraft.file ? formatFileSize(documentDraft.file.size) : undefined,
      description: documentDraft.description.trim(),
      uploadedAt: new Date().toISOString(),
    };
    setFormData((current) => ({ ...current, documents: [...current.documents, document] }));
    setDocumentDraft(emptyDocumentDraft);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveDocument = (documentId: string) => {
    setFormData((current) => ({
      ...current,
      documents: current.documents.filter((document) => document.id !== documentId),
    }));
  };

  const selectedDeleteName = cardToDelete?.holderName || cardToDelete?.cardNumber;

  return (
    <div className="app-page space-y-5 font-sans text-right text-foreground" dir="rtl">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:p-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <IdCard className="h-5 w-5" />
            <span className="text-[11px] font-black uppercase tracking-widest">کارت‌های بازرگانی</span>
          </div>
          <h1 className="text-xl font-black text-foreground md:text-2xl">کارت‌های بازرگانی</h1>
          <p className="mt-1 text-xs font-bold leading-6 text-muted-foreground md:text-sm">
            ثبت تاریخ صدور، انقضا و اسناد مرتبط کارت‌های مورد استفاده در عملیات واردات و صادرات.
          </p>
        </div>
        <Button
          type="button"
          data-testid="commercial-card-add-button"
          className="h-10 w-full rounded-xl bg-primary px-5 text-xs font-black text-primary-foreground hover:bg-primary/90 md:w-auto"
          onClick={openCreateDialog}
        >
          <Plus className="h-4 w-4" />
          افزودن کارت بازرگانی
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="rounded-xl border-border bg-card shadow-sm">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="text-[11px] font-black text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-2xl font-black text-foreground">{toPersianDigits(stat.value)}</p>
                </div>
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", stat.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="جستجو در نام شرکت، شماره کارت، مسئول یا شناسه ملی..."
                className="h-10 rounded-xl border-border bg-muted pr-10 text-xs font-bold"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={statusFilter === option.value ? "default" : "outline"}
                  data-testid={`commercial-card-filter-${option.value}`}
                  className="h-10 shrink-0 rounded-xl px-4 text-xs font-black"
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl border-border bg-card shadow-sm">
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-right text-[12px]">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-5 py-4 font-black text-muted-foreground">نام شرکت / دارنده کارت</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">شماره کارت</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">تاریخ صدور</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">تاریخ انقضا</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">وضعیت</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">تعداد اسناد</th>
                  <th className="px-5 py-4 font-black text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCards.length === 0 ? (
                  <EmptyTableRow colSpan={7}>
                    <EmptyState
                      icon={IdCard}
                      title={commercialCards.length === 0 ? "هنوز هیچ کارت بازرگانی ثبت نشده است." : "کارتی با این جستجو یا فیلتر پیدا نشد."}
                      description={commercialCards.length === 0 ? "اولین کارت بازرگانی را ثبت کنید تا تاریخ انقضا و مدارک آن همیشه قابل پیگیری باشد." : "عبارت جستجو یا فیلتر وضعیت را تغییر دهید."}
                      primaryAction={commercialCards.length === 0 ? { label: "افزودن کارت بازرگانی", onClick: openCreateDialog, icon: Plus } : resetFiltersAction(resetFilters)}
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  filteredCards.map((card) => {
                    const status = getCommercialCardStatus(card.expirationDate);
                    return (
                      <tr key={card.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-4">
                          <div className="font-black text-foreground">{card.holderName}</div>
                          {card.responsibleName ? <div className="mt-1 text-[11px] font-bold text-muted-foreground">مسئول: {card.responsibleName}</div> : null}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-bold text-foreground" dir="ltr">{card.cardNumber}</td>
                        <td className="px-5 py-4 text-muted-foreground">{formatShamsiDate(card.issueDate)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{formatShamsiDate(card.expirationDate)}</td>
                        <td className="px-5 py-4"><StatusBadge status={status} /></td>
                        <td className="px-5 py-4">
                          <Badge variant="outline" className="h-7 rounded-full border-border bg-muted/50 px-3 text-[11px] font-black">
                            {toPersianDigits(card.documents?.length || 0)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs font-bold text-primary" onClick={() => setViewingCard(card)}>
                              <Eye className="h-3.5 w-3.5" />
                              مشاهده
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:text-foreground" onClick={() => openEditDialog(card)}>
                              <Pencil className="h-3.5 w-3.5" />
                              ویرایش
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCardToDelete(card)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 lg:hidden">
            {filteredCards.length === 0 ? (
              <EmptyState
                icon={IdCard}
                title={commercialCards.length === 0 ? "هنوز هیچ کارت بازرگانی ثبت نشده است." : "کارتی با این جستجو یا فیلتر پیدا نشد."}
                description={commercialCards.length === 0 ? "اولین کارت بازرگانی را ثبت کنید تا تاریخ انقضا و مدارک آن همیشه قابل پیگیری باشد." : "عبارت جستجو یا فیلتر وضعیت را تغییر دهید."}
                primaryAction={commercialCards.length === 0 ? { label: "افزودن کارت بازرگانی", onClick: openCreateDialog, icon: Plus } : resetFiltersAction(resetFilters)}
              />
            ) : (
              filteredCards.map((card) => {
                const status = getCommercialCardStatus(card.expirationDate);
                return (
                  <div key={card.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-foreground">{card.holderName}</h2>
                        <p className="mt-1 font-mono text-xs font-bold text-muted-foreground" dir="ltr">{card.cardNumber}</p>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold text-muted-foreground">
                      <div>
                        <span className="block text-[10px] font-black">تاریخ صدور</span>
                        <span className="mt-1 block text-foreground">{formatShamsiDate(card.issueDate)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-black">تاریخ انقضا</span>
                        <span className="mt-1 block text-foreground">{formatShamsiDate(card.expirationDate)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-black">تعداد اسناد</span>
                        <span className="mt-1 block text-foreground">{toPersianDigits(card.documents?.length || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-black">مسئول</span>
                        <span className="mt-1 block truncate text-foreground">{card.responsibleName || "ثبت نشده"}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-9 flex-1 rounded-xl text-xs font-black" onClick={() => setViewingCard(card)}>
                        <Eye className="h-3.5 w-3.5" />
                        مشاهده
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9 flex-1 rounded-xl text-xs font-black" onClick={() => openEditDialog(card)}>
                        <Pencil className="h-3.5 w-3.5" />
                        ویرایش
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-9 flex-1 rounded-xl border-destructive/30 text-xs font-black text-destructive hover:bg-destructive/10" onClick={() => setCardToDelete(card)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <IdCard className="h-5 w-5 text-primary" />
              {editingCardId ? "ویرایش کارت بازرگانی" : "افزودن کارت بازرگانی"}
            </DialogTitle>
            <DialogDescription className="text-right text-xs font-bold leading-6 text-muted-foreground">
              اطلاعات کارت، تاریخ انقضا و اسناد مرتبط را ثبت کنید.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="commercial-holder-name" className="text-xs font-bold text-muted-foreground">نام شرکت / دارنده کارت</Label>
              <Input
                id="commercial-holder-name"
                value={formData.holderName}
                onChange={(event) => setFormData((current) => ({ ...current, holderName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
              <FieldError message={formErrors.holderName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-card-number" className="text-xs font-bold text-muted-foreground">شماره کارت بازرگانی</Label>
              <Input
                id="commercial-card-number"
                value={formData.cardNumber}
                onChange={(event) => setFormData((current) => ({ ...current, cardNumber: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
              <FieldError message={formErrors.cardNumber} />
            </div>
            <div className="space-y-1.5">
              <ShamsiDateTimeField
                id="commercial-issue-date"
                label="تاریخ صدور"
                value={formData.issueDate}
                onChange={(issueDate) => setFormData((current) => ({ ...current, issueDate }))}
                showTime={false}
                required
                triggerClassName="bg-muted"
              />
              <FieldError message={formErrors.issueDate} />
            </div>
            <div className="space-y-1.5">
              <ShamsiDateTimeField
                id="commercial-expiration-date"
                label="تاریخ انقضا"
                value={formData.expirationDate}
                onChange={(expirationDate) => setFormData((current) => ({ ...current, expirationDate }))}
                showTime={false}
                required
                triggerClassName="bg-muted"
              />
              <FieldError message={formErrors.expirationDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-national-id" className="text-xs font-bold text-muted-foreground">کد ملی / شناسه ملی</Label>
              <Input
                id="commercial-national-id"
                value={formData.nationalId}
                onChange={(event) => setFormData((current) => ({ ...current, nationalId: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-responsible-name" className="text-xs font-bold text-muted-foreground">نام شخص مسئول</Label>
              <Input
                id="commercial-responsible-name"
                value={formData.responsibleName}
                onChange={(event) => setFormData((current) => ({ ...current, responsibleName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-responsible-phone" className="text-xs font-bold text-muted-foreground">شماره تماس مسئول</Label>
              <Input
                id="commercial-responsible-phone"
                value={formData.responsiblePhone}
                onChange={(event) => setFormData((current) => ({ ...current, responsiblePhone: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="commercial-description" className="text-xs font-bold text-muted-foreground">توضیحات</Label>
              <textarea
                id="commercial-description"
                value={formData.description}
                onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24 w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-foreground">اسناد مرتبط</h3>
                <p className="text-[11px] font-bold text-muted-foreground">اسناد اختیاری هستند و فقط برای همین کارت نگهداری می‌شوند.</p>
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-border bg-background px-3 text-[11px] font-black">
                {toPersianDigits(formData.documents.length)} سند
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="commercial-document-title" className="text-xs font-bold text-muted-foreground">عنوان سند</Label>
                <Input
                  id="commercial-document-title"
                  value={documentDraft.title}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="تصویر کارت بازرگانی"
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercial-document-file" className="text-xs font-bold text-muted-foreground">فایل سند</Label>
                <Input
                  ref={fileInputRef}
                  id="commercial-document-file"
                  type="file"
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="commercial-document-description" className="text-xs font-bold text-muted-foreground">توضیحات اختیاری</Label>
                <Input
                  id="commercial-document-description"
                  value={documentDraft.description}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="نامه تمدید، رسید پرداخت، مدارک هویتی یا سایر مدارک"
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" variant="outline" className="h-10 w-full rounded-xl text-xs font-black" onClick={handleAddDocument}>
                  <Upload className="h-4 w-4" />
                  افزودن سند
                </Button>
              </div>
            </div>

            {formData.documents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {formData.documents.map((document) => (
                  <div key={document.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate text-xs font-black text-foreground">{document.title}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                        {document.fileName || "فایل انتخاب نشده"} {document.fileSize ? `- ${document.fileSize}` : ""} - {formatUploadDate(document.uploadedAt)}
                      </p>
                      {document.description ? <p className="mt-1 text-[11px] font-bold text-muted-foreground">{document.description}</p> : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs font-black text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleRemoveDocument(document.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف سند
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="ghost" className="h-10 rounded-xl text-xs font-black text-muted-foreground" onClick={() => setIsFormOpen(false)}>
              انصراف
            </Button>
            <Button type="button" data-testid="commercial-card-submit" className="h-10 rounded-xl bg-primary text-xs font-black text-primary-foreground hover:bg-primary/90" onClick={handleSaveCard}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingCard)} onOpenChange={(open) => !open && setViewingCard(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-2xl" dir="rtl">
          {viewingCard ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black">
                  <IdCard className="h-5 w-5 text-primary" />
                  {viewingCard.holderName}
                </DialogTitle>
                <DialogDescription className="text-right text-xs font-bold text-muted-foreground">
                  جزئیات کارت بازرگانی و اسناد مرتبط
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["شماره کارت بازرگانی", viewingCard.cardNumber],
                  ["تاریخ صدور", formatShamsiDate(viewingCard.issueDate)],
                  ["تاریخ انقضا", formatShamsiDate(viewingCard.expirationDate)],
                  ["کد ملی / شناسه ملی", viewingCard.nationalId || "ثبت نشده"],
                  ["نام شخص مسئول", viewingCard.responsibleName || "ثبت نشده"],
                  ["شماره تماس مسئول", viewingCard.responsiblePhone || "ثبت نشده"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-black text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-xs font-black text-foreground">{value}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-[10px] font-black text-muted-foreground">وضعیت</p>
                  <div className="mt-2">
                    <StatusBadge status={getCommercialCardStatus(viewingCard.expirationDate)} />
                  </div>
                </div>
                {viewingCard.description ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                    <p className="text-[10px] font-black text-muted-foreground">توضیحات</p>
                    <p className="mt-1 text-xs font-bold leading-6 text-foreground">{viewingCard.description}</p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-black text-foreground">اسناد پیوست‌شده</h3>
                </div>
                {viewingCard.documents?.length ? (
                  <div className="space-y-2">
                    {viewingCard.documents.map((document) => (
                      <div key={document.id} className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs font-black text-foreground">{document.title}</p>
                        <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                          {document.fileName || "فایل انتخاب نشده"} {document.fileSize ? `- ${document.fileSize}` : ""} - {formatUploadDate(document.uploadedAt)}
                        </p>
                        {document.description ? <p className="mt-1 text-[11px] font-bold text-muted-foreground">{document.description}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs font-bold text-muted-foreground">
                    هیچ سندی برای این کارت ثبت نشده است.
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="button" variant="outline" className="h-10 rounded-xl text-xs font-black" onClick={() => setViewingCard(null)}>
                  انصراف
                </Button>
                <Button type="button" className="h-10 rounded-xl text-xs font-black" onClick={() => {
                  const card = viewingCard;
                  setViewingCard(null);
                  openEditDialog(card);
                }}>
                  <Pencil className="h-4 w-4" />
                  ویرایش
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        isOpen={Boolean(cardToDelete)}
        onClose={() => setCardToDelete(null)}
        onConfirm={async () => {
          if (!cardToDelete) return;
          deleteCommercialCard(cardToDelete.id);
          toast.success("کارت بازرگانی با موفقیت حذف شد.");
        }}
        title="حذف کارت بازرگانی"
        description="آیا از حذف این کارت بازرگانی مطمئن هستید؟"
        itemName={selectedDeleteName}
        confirmLabel="حذف"
        pendingLabel="در حال حذف..."
      />
    </div>
  );
}
