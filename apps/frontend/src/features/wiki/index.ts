/**
 * Studio Wiki & Contextual Help feature (PRD-56).
 *
 * Barrel export for all wiki types, hooks, and components.
 */

// Types
export type {
  ContextualHelpMapping,
  ContextualHelpResponse,
  CreateWikiArticle,
  DiffLine,
  DiffLineType,
  DiffResponse,
  PinLocation,
  UpdateWikiArticle,
  WikiArticle,
  WikiCategory,
  WikiVersion,
} from "./types";
export {
  CATEGORY_LABELS,
  categoryLabel,
  PIN_LOCATION_LABELS,
} from "./types";

// Hooks
export {
  useContextualHelp,
  useCreateArticle,
  useDeleteArticle,
  useDiffVersions,
  usePinnedArticles,
  useRevertVersion,
  useSearchArticles,
  useUpdateArticle,
  useWikiArticle,
  useWikiArticles,
  useWikiVersion,
  useWikiVersions,
  wikiKeys,
} from "./hooks/use-wiki";

// Components
export { ContextualHelpButton } from "./ContextualHelpButton";
export { WikiArticleEditor } from "./WikiArticleEditor";
export { WikiArticleViewer } from "./WikiArticleViewer";
export { WikiVersionHistory } from "./WikiVersionHistory";
