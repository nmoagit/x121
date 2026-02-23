/**
 * Scene Preview & Quick Test feature public API (PRD-58).
 */

// Components
export { TestShotButton } from "./TestShotButton";
export { TestShotGallery } from "./TestShotGallery";

// Hooks
export {
  testShotKeys,
  useBatchTestShots,
  useDeleteTestShot,
  useGenerateTestShot,
  usePromoteTestShot,
  useTestShot,
  useTestShotGallery,
} from "./hooks/use-test-shots";

// Types
export type {
  BatchTestShotRequest,
  BatchTestShotResponse,
  GenerateTestShotRequest,
  PromoteResponse,
  TestShot,
  TestShotStatus,
} from "./types";

export {
  TEST_SHOT_STATUS_LABELS,
  testShotStatusVariant,
} from "./types";
