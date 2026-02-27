/**
 * Dynamic Naming Engine feature barrel export (PRD-116).
 */

// Components
export { NamingRulesPage } from "./NamingRulesPage";
export { RuleEditor } from "./components/RuleEditor";
export { TokenChip } from "./components/TokenChip";

// Hooks
export {
  namingKeys,
  useNamingCategories,
  useCategoryTokens,
  useNamingRules,
  useNamingPreview,
  useCreateNamingRule,
  useUpdateNamingRule,
  useDeleteNamingRule,
} from "./hooks/use-naming-rules";

// Types
export type {
  NamingCategory,
  NamingRule,
  CreateNamingRule,
  UpdateNamingRule,
  TokenInfo,
  ChangelogEntry,
  PreviewResult,
} from "./types";
export { CATEGORY_GROUPS } from "./types";
