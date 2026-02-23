/**
 * Content Branching & Exploration feature public API (PRD-50).
 */

// Components
export { BranchCleanup } from "./BranchCleanup";
export { BranchComparison } from "./BranchComparison";
export { BranchManager } from "./BranchManager";

// Hooks
export {
  branchKeys,
  useBranch,
  useBranches,
  useCompareBranches,
  useCreateBranch,
  useDeleteBranch,
  usePromoteBranch,
  useStaleBranches,
  useUpdateBranch,
} from "./hooks/use-branching";

// Types
export type {
  Branch,
  BranchComparison as BranchComparisonData,
  BranchWithStats,
  CreateBranch,
  ParameterDiff,
  PromoteRequest,
  UpdateBranch,
} from "./types";
