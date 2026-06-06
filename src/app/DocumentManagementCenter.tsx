import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  FileSearch,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Ship,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ShipmentChatPanel } from "@/src/components/shipments/ShipmentChatPanel";
import { ShipmentV2ReadOnlyProfile } from "@/src/components/shipments/ShipmentV2ReadOnlyProfile";
import {
  documentManagementCenterApi,
  type DocumentManagementShipmentSearchResult,
} from "@/src/lib/documentManagementCenterApi";
import { businessEntitiesApi } from "@/src/lib/businessEntitiesApi";
import { downloadBinaryFile } from "@/src/lib/downloads";
import { shipmentV2Api } from "@/src/lib/shipmentV2Api";
import { useAppDataStore } from "@/src/store/useMockStore";
import { getDocumentTypeFilterValue, getDocumentTypeLabel } from "@/src/shared/document-types";
import type { MalvaniProfile, ShipmentDocument, ShipmentV2ProfileResponse } from "@/src/types";
import { toast } from "sonner";

const EMPTY_SEARCH_TEXT = "برای شروع، شماره محموله یا شماره رهگیری را جستجو کنید";
const NO_RESULTS_TEXT = "محموله‌ای پیدا نشد";
const NO_DOCUMENTS_TEXT = "سندی برای این محموله ثبت نشده است";

const statusLabels: Record<string, string> = {
  PENDING: "در انتظار",
  BOOKED: "رزرو شده",
  IN_TRANSIT: "در مسیر",
  ARRIVED: "رسیده",
  CUSTOMS: "گمرک",
  CLEARED: "ترخیص شده",
  DELIVERED: "تحویل شده",
  CLOSED: "بسته شده",
};

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short" });
}

function normalizeDocumentGroups(documents: ShipmentDocument[]) {
  const groups = new Map<string, ShipmentDocument[]>();
  for (const document of documents) {
    const key = getDocumentTypeFilterValue(document.type);
    groups.set(key, [...(groups.get(key) || []), document]);
  }
  return Array.from(groups.entries()).map(([type, rows]) => ({ type, rows }));
}

function getRoutedShipmentQuery(searchParams: URLSearchParams) {
  return (searchParams.get("shipment") || searchParams.get("shipmentId") || searchParams.get("q") || "").trim();
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function SearchResultButton({
  result,
  active,
  onSelect,
}: {
  result: DocumentManagementShipmentSearchResult;
  active: boolean;
  onSelect: () => void;
}) {
  const customerIdentifier = result.customerCode || result.customerId || result.customerName;
  return (
    <button
      type="button"
      data-testid={`document-management-result-${result.id}`}
      className={cn(
        "w-full rounded-xl border px-3 py-3 text-right transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs font-black" dir="ltr">
          {result.trackingNumber}
        </span>
        <Badge variant="outline" className="shrink-0 rounded-md text-[10px] font-black">
          {statusLabels[result.status] || result.status}
        </Badge>
      </div>
      <p className="mt-1 truncate text-[11px] font-bold text-muted-foreground">
        {customerIdentifier || "بدون مشتری"}
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-muted-foreground">
        <span>{result.documentCount.toLocaleString("fa-IR")} سند</span>
        {result.currentStage ? <span className="min-w-0 truncate">مرحله: {result.currentStage}</span> : null}
      </div>
    </button>
  );
}

function SearchWorkspace({
  query,
  setQuery,
  results,
  isSearching,
  searchError,
  selectedId,
  onSelect,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: DocumentManagementShipmentSearchResult[];
  isSearching: boolean;
  searchError: string;
  selectedId?: string;
  onSelect: (result: DocumentManagementShipmentSearchResult) => void;
}) {
  const trimmedQuery = query.trim();
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="document-management-search-section">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="document-management-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجوی شماره محموله، شماره رهگیری یا مشتری"
              className="h-13 rounded-xl border-border bg-background pr-12 text-sm font-black shadow-sm focus-visible:ring-primary/30"
            />
            {isSearching ? (
              <Loader2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
            ) : null}
          </div>
          <p className="mt-2 text-[11px] font-bold text-muted-foreground">
            جستجو فقط در محموله‌های همین سازمان انجام می‌شود.
          </p>
        </div>
        <div className="w-full shrink-0 lg:w-[360px]">
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2" data-testid="document-management-search-results">
            {!trimmedQuery ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-6 text-center">
                <FileSearch className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground">{EMPTY_SEARCH_TEXT}</p>
              </div>
            ) : searchError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-3 text-xs font-bold text-destructive">
                {searchError}
              </div>
            ) : !isSearching && results.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-6 text-center">
                <Inbox className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground">{NO_RESULTS_TEXT}</p>
              </div>
            ) : (
              results.map((result) => (
                <div key={result.id}>
                  <SearchResultButton
                    result={result}
                    active={selectedId === result.id}
                    onSelect={() => onSelect(result)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NotesFallback({ profile }: { profile: ShipmentV2ProfileResponse | null }) {
  const note = profile?.profile?.sections.notes.internalNote;
  const updatedAt = profile?.profile?.updatedAt || profile?.shipment.updatedAt;
  return (
    <section data-testid="document-management-notes-fallback" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-4">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black text-foreground">یادداشت‌ها و فعالیت</h2>
      </header>
      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-border bg-background px-3 py-3">
          <p className="text-[11px] font-black text-muted-foreground">یادداشت داخلی</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs font-bold leading-6 text-foreground">
            {note || "یادداشتی برای این محموله ثبت نشده است."}
          </p>
        </div>
        {updatedAt ? (
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] font-bold text-muted-foreground">
            آخرین تغییر پرونده: {formatDateTime(updatedAt)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ShipmentDocumentsList({
  shipmentId,
  documents,
  isLoading,
  onRefresh,
}: {
  shipmentId: string;
  documents: ShipmentDocument[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const shipmentDocuments = React.useMemo(
    () => documents.filter((document) => document.shipmentId === shipmentId && !document.isArchived),
    [documents, shipmentId]
  );
  const groups = React.useMemo(() => normalizeDocumentGroups(shipmentDocuments), [shipmentDocuments]);
  const handleDownloadDocument = async (document: ShipmentDocument) => {
    try {
      await downloadBinaryFile(document.url || `/api/documents/${encodeURIComponent(document.id)}/download`, document.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document download failed.");
    }
  };

  return (
    <section data-testid="document-management-documents-section" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground">اسناد محموله</h2>
            <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
              {shipmentDocuments.length.toLocaleString("fa-IR")} سند فعال
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-lg px-3 text-[11px] font-black"
          onClick={onRefresh}
          disabled={isLoading}
          data-testid="document-management-documents-refresh"
        >
          {isLoading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-1 h-3.5 w-3.5" />}
          به‌روزرسانی
        </Button>
      </header>
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !shipmentDocuments.length ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
            <Inbox className="mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-xs font-bold text-muted-foreground">{NO_DOCUMENTS_TEXT}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.type} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-black text-foreground">{getDocumentTypeLabel(group.type)}</h3>
                  <Badge variant="outline" className="rounded-md text-[10px] font-black">
                    {group.rows.length.toLocaleString("fa-IR")}
                  </Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {group.rows.map((document) => (
                    <article key={document.id} className="min-w-0 rounded-xl border border-border bg-background px-3 py-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="line-clamp-2 break-words text-xs font-black text-foreground">{document.name}</h4>
                          <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                            {formatDateTime(document.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-lg"
                          title="دانلود سند"
                          onClick={() => handleDownloadDocument(document)}
                          data-testid={`document-management-document-download-${document.id}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                        <Badge variant="outline" className="rounded-md text-[10px] font-black">
                          {document.visibility === "customer_visible" ? "قابل مشاهده برای مشتری" : "داخلی"}
                        </Badge>
                        {document.fileSize ? (
                          <Badge variant="secondary" className="rounded-md text-[10px] font-black">
                            {document.fileSize}
                          </Badge>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function DocumentManagementCenter() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<DocumentManagementShipmentSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = React.useState<DocumentManagementShipmentSearchResult | null>(null);
  const [selectedProfile, setSelectedProfile] = React.useState<ShipmentV2ProfileResponse | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isProfileLoading, setIsProfileLoading] = React.useState(false);
  const [isDocumentsLoading, setIsDocumentsLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [profileError, setProfileError] = React.useState("");
  const [malvaniProfiles, setMalvaniProfiles] = React.useState<MalvaniProfile[]>([]);
  const routedShipmentQuery = getRoutedShipmentQuery(searchParams);
  const autoOpenedShipmentQueryRef = React.useRef("");

  const currentUser = useAppDataStore((state) => state.currentUser);
  const customers = useAppDataStore((state) => state.customers);
  const shipments = useAppDataStore((state) => state.shipments);
  const commercialCards = useAppDataStore((state) => state.commercialCards);
  const documents = useAppDataStore((state) => state.documents);
  const refreshDocuments = useAppDataStore((state) => state.refreshDocuments);
  const canUseChat = Boolean(currentUser?.permissions?.includes("chat.use"));

  const selectedDocuments = React.useMemo(
    () => documents.filter((document) => document.shipmentId === selectedProfile?.shipment.id && !document.isArchived),
    [documents, selectedProfile?.shipment.id]
  );
  const documentCount = Math.max(selectedDocuments.length, selectedResult?.documentCount || 0);

  const refreshShipmentDocuments = React.useCallback(async () => {
    setIsDocumentsLoading(true);
    try {
      await refreshDocuments();
    } finally {
      setIsDocumentsLoading(false);
    }
  }, [refreshDocuments]);

  React.useEffect(() => {
    if (!routedShipmentQuery) return;
    autoOpenedShipmentQueryRef.current = "";
    setQuery(routedShipmentQuery);
    setResults([]);
    setSelectedResult(null);
    setSelectedProfile(null);
    setSearchError("");
    setProfileError("");
  }, [routedShipmentQuery]);

  React.useEffect(() => {
    let cancelled = false;
    businessEntitiesApi.listMalvaniProfiles()
      .then((profiles) => {
        if (!cancelled) setMalvaniProfiles(profiles);
      })
      .catch((error) => {
        if (!cancelled) console.error("Could not load malvani profiles for document management center.", error);
      });
    void refreshShipmentDocuments();
    return () => {
      cancelled = true;
    };
  }, [refreshShipmentDocuments]);

  React.useEffect(() => {
    const searchTerm = query.trim();
    setSearchError("");
    if (!searchTerm) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    if (searchTerm.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const handle = window.setTimeout(() => {
      documentManagementCenterApi.searchShipments(searchTerm)
        .then((data) => {
          if (cancelled) return;
          if (!Array.isArray(data)) {
            setResults([]);
            setSearchError("پاسخ جستجوی محموله معتبر نبود.");
            return;
          }
          setResults(data);
        })
        .catch((error) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(error instanceof Error ? error.message : "جستجوی محموله ناموفق بود.");
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const handleSelect = React.useCallback(async (result: DocumentManagementShipmentSearchResult) => {
    setSelectedResult(result);
    setSelectedProfile(null);
    setProfileError("");
    setIsProfileLoading(true);
    try {
      const profile = await shipmentV2Api.get(result.id);
      setSelectedProfile(profile);
      await refreshShipmentDocuments();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "پرونده محموله بارگذاری نشد.");
    } finally {
      setIsProfileLoading(false);
    }
  }, [refreshShipmentDocuments]);

  React.useEffect(() => {
    const requestedQuery = normalizeSearchValue(routedShipmentQuery);
    if (!requestedQuery || isSearching || searchError || results.length === 0) return;
    if (autoOpenedShipmentQueryRef.current === requestedQuery) return;

    const exactResult = results.find((result) =>
      normalizeSearchValue(result.id) === requestedQuery ||
      normalizeSearchValue(result.trackingNumber) === requestedQuery
    );
    const targetResult = exactResult || (results.length === 1 ? results[0] : null);
    if (!targetResult) return;

    autoOpenedShipmentQueryRef.current = requestedQuery;
    void handleSelect(targetResult);
  }, [handleSelect, isSearching, results, routedShipmentQuery, searchError]);

  return (
    <div className="min-h-full bg-background p-4 font-sans sm:p-6" dir="rtl" data-testid="document-management-center-page">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileSearch className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black text-foreground sm:text-2xl">مرکز مدیریت اسناد</h1>
                <p className="mt-1 text-xs font-bold text-muted-foreground">
                  جستجوی محموله، بررسی پرونده، گفتگو و اسناد مرتبط در یک فضای کاری
                </p>
              </div>
            </div>
          </div>
        </header>

        <SearchWorkspace
          query={query}
          setQuery={setQuery}
          results={results}
          isSearching={isSearching}
          searchError={searchError}
          selectedId={selectedResult?.id}
          onSelect={handleSelect}
        />

        {isProfileLoading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <div className="h-[560px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : profileError ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm font-bold text-destructive">
            {profileError}
          </div>
        ) : selectedProfile ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <ShipmentV2ReadOnlyProfile
                data={selectedProfile}
                customers={customers}
                shipments={shipments}
                commercialCards={commercialCards}
                malvaniProfiles={malvaniProfiles}
                documentCount={documentCount}
              />
              <div data-testid="document-management-chat-section" className="min-w-0">
                {canUseChat ? (
                  <ShipmentChatPanel shipmentId={selectedProfile.shipment.id} shipmentCode={selectedProfile.shipment.trackingNumber} />
                ) : (
                  <NotesFallback profile={selectedProfile} />
                )}
              </div>
            </div>
            <ShipmentDocumentsList
              shipmentId={selectedProfile.shipment.id}
              documents={documents}
              isLoading={isDocumentsLoading}
              onRefresh={refreshShipmentDocuments}
            />
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center">
            <Ship className="mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-black text-foreground">{EMPTY_SEARCH_TEXT}</p>
            <p className="mt-2 max-w-md text-xs font-bold leading-6 text-muted-foreground">
              بعد از انتخاب محموله، مشخصات کالا و اطلاعات پایه در سمت چپ، گفتگو یا یادداشت‌ها در سمت راست، و اسناد محموله پایین صفحه نمایش داده می‌شود.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
