export type SearchResultType =
  | "shipment"
  | "customer"
  | "document"
  | "task"
  | "archive"
  | "tracking"
  | "user";

export type SearchFilterType =
  | "all"
  | "shipments"
  | "customers"
  | "documents"
  | "tasks"
  | "archive"
  | "tracking"
  | "users";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  matchedFields: string[];
  updatedAt: string;
};

export type SearchResponse = {
  query: string;
  total: number;
  limit: number;
  offset: number;
  results: SearchResult[];
};

export const SEARCH_FILTERS: Array<{ value: SearchFilterType; label: string }> = [
  { value: "all", label: "همه" },
  { value: "shipments", label: "محموله‌ها" },
  { value: "customers", label: "مشتریان" },
  { value: "documents", label: "اسناد" },
  { value: "tasks", label: "وظایف" },
  { value: "tracking", label: "رهگیری" },
  { value: "users", label: "کاربران" },
  { value: "archive", label: "بایگانی" },
];

export const SEARCH_RESULT_LABELS: Record<SearchResultType, string> = {
  shipment: "محموله‌ها",
  customer: "مشتریان",
  document: "اسناد",
  task: "وظایف",
  archive: "بایگانی",
  tracking: "رهگیری",
  user: "کاربران",
};

export const SEARCH_RESULT_ORDER: SearchResultType[] = [
  "shipment",
  "customer",
  "document",
  "task",
  "tracking",
  "user",
  "archive",
];

export function normalizeSearchText(value: string) {
  return value
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => {
      const code = digit.charCodeAt(0);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      return digit;
    })
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0649/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
