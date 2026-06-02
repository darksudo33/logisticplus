import React from "react";
import { Loader2, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SEARCH_FILTERS,
  normalizeSearchText,
  type SearchFilterType,
  type SearchResponse,
} from "@/src/lib/search";
import { SearchResults } from "@/src/components/search/SearchResults";

const PAGE_LIMIT = 20;

async function fetchSearchPage(query: string, type: SearchFilterType, offset: number, signal: AbortSignal) {
  const params = new URLSearchParams({
    q: query,
    type,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const response = await fetch(`/api/search?${params.toString()}`, {
    credentials: "include",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "جستجو ناموفق بود.");
  }
  return payload as SearchResponse;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = params.get("q") || "";
  const urlType = (params.get("type") || "all") as SearchFilterType;
  const offset = Math.max(0, Number.parseInt(params.get("offset") || "0", 10) || 0);
  const normalizedQuery = normalizeSearchText(urlQuery);
  const selectedFilter = SEARCH_FILTERS.some((filter) => filter.value === urlType) ? urlType : "all";
  const [draftQuery, setDraftQuery] = React.useState(urlQuery);
  const [data, setData] = React.useState<SearchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setDraftQuery(urlQuery);
  }, [urlQuery]);

  React.useEffect(() => {
    if (normalizedQuery.length < 2) {
      setData(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchSearchPage(normalizedQuery, selectedFilter, offset, controller.signal)
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((searchError) => {
        if (controller.signal.aborted) return;
        setError(searchError?.message || "جستجو ناموفق بود.");
        setData(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, [normalizedQuery, offset, selectedFilter]);

  const updateSearchParams = (next: { q?: string; type?: SearchFilterType; offset?: number }) => {
    const query = normalizeSearchText(next.q ?? urlQuery);
    const type = next.type ?? selectedFilter;
    const nextOffset = next.offset ?? 0;
    const updated = new URLSearchParams();
    if (query) updated.set("q", query);
    if (type && type !== "all") updated.set("type", type);
    if (nextOffset > 0) updated.set("offset", String(nextOffset));
    setParams(updated);
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateSearchParams({ q: draftQuery, offset: 0 });
  };

  const total = data?.total || 0;
  const hasNextPage = data ? data.offset + data.limit < data.total : false;
  const hasPreviousPage = offset > 0;

  return (
    <div className="app-page space-y-5 font-sans" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-black tracking-tight text-foreground">جستجوی سراسری</h1>
          <p className="text-xs font-bold text-muted-foreground">جستجو در محموله‌ها، مشتریان، اسناد، وظایف و رکوردهای مجاز شرکت.</p>
        </div>
        {normalizedQuery.length >= 2 ? (
          <Badge variant="outline" className="h-7 w-fit rounded-full px-3 text-xs">
            {total.toLocaleString("fa-IR")} نتیجه
          </Badge>
        ) : null}
      </div>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-sm font-black">عبارت جستجو</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="جستجو در بارنامه‌ها، مشتریان، اسناد..."
                className="h-10 rounded-lg pr-10 text-sm"
                data-testid="search-page-input"
              />
            </div>
            <Button type="submit" className="h-10 rounded-lg px-5">
              جستجو
            </Button>
          </form>
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="search-filters">
            {SEARCH_FILTERS.map((filter) => {
              const active = selectedFilter === filter.value;
              return (
                <Button
                  key={filter.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className={cn("h-8 rounded-full px-3 text-xs", active && "shadow-none")}
                  onClick={() => updateSearchParams({ type: filter.value, offset: 0 })}
                >
                  {filter.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardContent className="min-h-[340px] p-4">
          {normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
            <div className="flex min-h-[260px] items-center justify-center text-center text-xs font-bold text-muted-foreground">
              برای شروع جستجو حداقل دو کاراکتر وارد کنید.
            </div>
          ) : loading ? (
            <div className="flex min-h-[260px] items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال جستجو...
            </div>
          ) : error ? (
            <div className="flex min-h-[260px] items-center justify-center text-center text-xs font-bold text-destructive">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-4">
              <SearchResults
                results={data.results}
                emptyLabel="نتیجه‌ای برای این عبارت پیدا نشد."
                onSelect={(result) => navigate(result.url)}
              />
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] font-bold text-muted-foreground">
                  نمایش {data.results.length.toLocaleString("fa-IR")} نتیجه از {data.total.toLocaleString("fa-IR")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    disabled={!hasPreviousPage}
                    onClick={() => updateSearchParams({ offset: Math.max(0, offset - PAGE_LIMIT) })}
                  >
                    قبلی
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    disabled={!hasNextPage}
                    onClick={() => updateSearchParams({ offset: offset + PAGE_LIMIT })}
                  >
                    بعدی
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center text-center text-xs font-bold text-muted-foreground">
              عبارت مورد نظر را وارد کنید تا نتایج جستجو نمایش داده شود.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
