/**
 * Barrel export for search & discovery feature (PRD-20).
 */

export { SearchBar } from "./SearchBar";
export { FacetPanel } from "./FacetPanel";
export type { ActiveFilters } from "./FacetPanel";
export { SearchResults } from "./SearchResults";
export { SavedSearches } from "./SavedSearches";
export {
  searchKeys,
  useSearch,
  useTypeahead,
  useSimilaritySearch,
  useSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useExecuteSavedSearch,
} from "./hooks/use-search";
export type {
  SearchResultRow,
  SearchResponse,
  SearchFacets,
  FacetValue,
  TypeaheadResult,
  SimilarityResult,
  SimilarityRequest,
  SavedSearch,
  CreateSavedSearch,
  SearchParams,
} from "./types";
export { ENTITY_TYPES, ENTITY_TYPE_LABELS, entityTypeLabel } from "./types";
