import React from "react";
import { Loader2, Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeSearchText, type SearchResponse, type SearchResult } from "@/src/lib/search";
import { SearchResults } from "./SearchResults";

type SearchState = {
  data: SearchResponse | null;
  loading: boolean;
  error: string;
};

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

async function fetchSearchResults(query: string, signal: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    type: "all",
    limit: "20",
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

function useSearchQuery(query: string, active: boolean) {
  const [state, setState] = React.useState<SearchState>({ data: null, loading: false, error: "" });
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    const normalized = normalizeSearchText(query);
    if (!active || normalized.length < MIN_QUERY_LENGTH) {
      setState({ data: null, loading: false, error: "" });
      return undefined;
    }

    const requestId = ++requestSeq.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState((previous) => ({ ...previous, loading: true, error: "" }));
      fetchSearchResults(normalized, controller.signal)
        .then((data) => {
          if (requestId === requestSeq.current) {
            setState({ data, loading: false, error: "" });
          }
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== requestSeq.current) return;
          setState({ data: null, loading: false, error: error?.message || "جستجو ناموفق بود." });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, active]);

  return state;
}

type SearchBoxProps = {
  mobile?: boolean;
  autoFocus?: boolean;
  onClose?: () => void;
};

function SearchBox({ mobile = false, autoFocus = false, onClose }: SearchBoxProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const normalizedQuery = normalizeSearchText(query);
  const isActive = mobile || open;
  const { data, loading, error } = useSearchQuery(query, isActive);
  const results = data?.results || [];

  React.useEffect(() => {
    if (!mobile) {
      const handlePointerDown = (event: PointerEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
          setOpen(false);
          setSelectedIndex(-1);
        }
      };
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }
    return undefined;
  }, [mobile]);

  React.useEffect(() => {
    if (autoFocus) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  React.useEffect(() => {
    setSelectedIndex(results.length ? 0 : -1);
  }, [results.length, query]);

  const closeSearch = React.useCallback(() => {
    setOpen(false);
    setSelectedIndex(-1);
    onClose?.();
  }, [onClose]);

  const openResult = React.useCallback(
    (result: SearchResult) => {
      closeSearch();
      navigate(result.url);
    },
    [closeSearch, navigate]
  );

  const openFullSearch = React.useCallback(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) return;
    closeSearch();
    navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  }, [closeSearch, navigate, normalizedQuery]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setSelectedIndex((index) => (results.length ? (index + 1) % results.length : -1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setSelectedIndex((index) => (results.length ? (index <= 0 ? results.length - 1 : index - 1) : -1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        openResult(results[selectedIndex]);
      } else {
        openFullSearch();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  };

  const shouldShowPanel = mobile || (open && (query.length > 0 || loading || Boolean(error)));
  const showMinHint = normalizedQuery.length > 0 && normalizedQuery.length < MIN_QUERY_LENGTH;

  return (
    <div ref={wrapperRef} className={cn("relative w-full", !mobile && "max-w-sm")} data-testid="global-search">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="جستجو در محموله‌ها، مشتریان، اسناد..."
        className="h-9 rounded-lg border-border bg-muted pr-10 pl-9 text-[11px] text-foreground focus-visible:ring-primary/50"
        data-testid="global-search-input"
      />
      {query ? (
        <button
          type="button"
          className="absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          aria-label="پاک کردن جستجو"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {shouldShowPanel ? (
        <div
          className={cn(
            "z-50 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl ring-1 ring-primary/10",
            mobile ? "mt-3 max-h-[70dvh] overflow-y-auto" : "absolute right-0 top-full mt-2 max-h-[min(70dvh,520px)] w-[min(520px,calc(100vw-2rem))] overflow-y-auto"
          )}
          data-testid="global-search-panel"
        >
          {showMinHint ? (
            <div className="px-3 py-6 text-center text-xs font-bold text-muted-foreground">برای شروع جستجو حداقل دو کاراکتر وارد کنید.</div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال جستجو...
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-xs font-bold text-destructive" data-testid="global-search-error">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-2">
              <SearchResults results={results} selectedIndex={selectedIndex} onSelect={openResult} compact />
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full rounded-lg text-xs"
                onClick={openFullSearch}
                disabled={normalizedQuery.length < MIN_QUERY_LENGTH}
              >
                مشاهده همه نتایج ({data.total})
              </Button>
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-xs font-bold text-muted-foreground">عبارت مورد نظر را وارد کنید.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GlobalSearch() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  return (
    <>
      <div className="hidden w-full max-w-sm sm:block">
        <SearchBox />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground sm:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="باز کردن جستجو"
      >
        <Search className="h-4 w-4" />
      </Button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] translate-y-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="text-right text-sm font-black">جستجوی سریع</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <SearchBox mobile autoFocus onClose={() => setMobileOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
