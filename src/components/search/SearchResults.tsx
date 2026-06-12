import React from "react";
import { Archive, CheckSquare, FileText, Link2, Search, Ship, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SEARCH_RESULT_LABELS,
  SEARCH_RESULT_ORDER,
  type SearchResult,
  type SearchResultType,
} from "@/src/lib/search";

const RESULT_ICONS: Record<SearchResultType, React.ComponentType<{ className?: string }>> = {
  shipment: Ship,
  customer: Users,
  document: FileText,
  task: CheckSquare,
  archive: Archive,
  tracking: Link2,
  user: User,
};

const MATCHED_FIELD_LABELS: Record<string, string> = {
  shipmentNumber: "شماره محموله",
  trackingNumber: "کد رهگیری",
  referenceNumber: "شماره مرجع",
  customerName: "مشتری",
  origin: "مبدا",
  destination: "مقصد",
  status: "وضعیت",
  recipientSender: "فرستنده / گیرنده",
  notes: "یادداشت",
  cotageNumber: "شماره کوتاژ",
  declarationReference: "اظهارنامه",
  phone: "تلفن",
  email: "ایمیل",
  address: "آدرس",
  nationalId: "شناسه ملی",
  title: "عنوان",
  fileName: "نام فایل",
  documentType: "نوع سند",
  relatedShipment: "محموله مرتبط",
  relatedCustomer: "مشتری مرتبط",
  versionNumber: "نسخه",
  description: "توضیحات",
  assignedUser: "مسئول",
  dueDate: "سررسید",
  trackingCode: "کد رهگیری",
  shipmentNumberPublic: "شماره محموله",
  publicStatus: "وضعیت عمومی",
  publicRoute: "مسیر",
  summary: "خلاصه",
  entityType: "نوع رکورد",
  entityId: "شناسه رکورد",
  name: "نام",
  role: "نقش",
  department: "واحد",
};

type SearchResultsProps = {
  results: SearchResult[];
  selectedIndex?: number;
  onSelect?: (result: SearchResult) => void;
  compact?: boolean;
  emptyLabel?: string;
};

export function groupedSearchResults(results: SearchResult[]) {
  return SEARCH_RESULT_ORDER
    .map((type) => ({
      type,
      label: SEARCH_RESULT_LABELS[type],
      results: results.filter((result) => result.type === type),
    }))
    .filter((group) => group.results.length > 0);
}

export function SearchResults({
  results,
  selectedIndex = -1,
  onSelect,
  compact = false,
  emptyLabel = "نتیجه‌ای پیدا نشد.",
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center text-center text-muted-foreground", compact ? "py-8" : "py-16")}>
        <Search className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-xs font-bold">{emptyLabel}</p>
      </div>
    );
  }

  const flatIndexById = new Map(results.map((result, index) => [`${result.type}:${result.id}`, index]));

  return (
    <div className="space-y-3" data-testid="search-results">
      {groupedSearchResults(results).map((group) => (
        <section key={group.type} className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-black text-muted-foreground">{group.label}</h3>
            <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
              {group.results.length}
            </Badge>
          </div>
          <div className="space-y-1">
            {group.results.map((result) => {
              const Icon = RESULT_ICONS[result.type];
              const flatIndex = flatIndexById.get(`${result.type}:${result.id}`) ?? -1;
              const isSelected = flatIndex === selectedIndex;
              return (
                <button
                  key={`${result.type}:${result.id}`}
                  type="button"
                  data-testid="search-result-item"
                  onClick={() => onSelect?.(result)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border border-transparent p-3 text-right transition-colors",
                    isSelected ? "border-primary/40 bg-primary/10" : "hover:bg-muted/70",
                    compact && "p-2.5"
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-black text-foreground">{result.title}</span>
                      <Badge variant="secondary" className="h-5 rounded-full px-2 text-[9px]">
                        {SEARCH_RESULT_LABELS[result.type]}
                      </Badge>
                      {result.badges?.map((badge) => (
                        <Badge key={badge} variant="outline" className="h-5 rounded-full border-amber-500/30 bg-amber-500/10 px-2 text-[9px] text-amber-700">
                          {badge}
                        </Badge>
                      ))}
                    </span>
                    {result.subtitle ? <span className="block truncate text-[11px] font-bold text-muted-foreground">{result.subtitle}</span> : null}
                    {result.description ? <span className="block line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{result.description}</span> : null}
                    {result.matchedFields?.length ? (
                      <span className="flex flex-wrap gap-1 pt-1">
                        {result.matchedFields.slice(0, 3).map((field) => (
                          <Badge key={field} variant="outline" className="h-5 rounded-full px-2 text-[9px]">
                            {MATCHED_FIELD_LABELS[field] || field}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
