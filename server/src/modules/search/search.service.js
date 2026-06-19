import {
  normalizeOperationalSearchQuery,
  searchOperationalRecords,
} from "./search.repository.js";

export function createSearchService() {
  return {
    normalizeQuery: normalizeOperationalSearchQuery,
    searchOperationalRecords,
  };
}
