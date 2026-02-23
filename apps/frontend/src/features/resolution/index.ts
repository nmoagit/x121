/**
 * Multi-Resolution Pipeline feature (PRD-59).
 *
 * Barrel export for all resolution types, hooks, and components.
 */

// Types
export type {
  ResolutionTier,
  UpscaleRequest,
  UpscaleResponse,
} from "./types";
export {
  TIER_COLORS,
  TIER_LABELS,
  tierBadgeVariant,
} from "./types";

// Hooks
export {
  resolutionKeys,
  useResolutionTier,
  useResolutionTiers,
  useSceneTier,
  useUpscaleScene,
} from "./hooks/use-resolution";

// Components
export { TierBadge } from "./TierBadge";
export { UpscaleButton } from "./UpscaleButton";
