/**
 * Barrel export for multi-pipeline architecture feature (PRD-138).
 */

/* Pages */
export { PipelineListPage } from "./PipelineListPage";
export { PipelineSettingsPage } from "./PipelineSettingsPage";

/* Provider */
export { PipelineProvider, usePipelineContext, usePipelineContextSafe } from "./PipelineProvider";

/* Hooks */
export {
  pipelineKeys,
  usePipelines,
  usePipeline,
  usePipelineByCode,
  useCreatePipeline,
  useUpdatePipeline,
  useDeletePipeline,
} from "./hooks/use-pipelines";
export { usePipelineCode } from "./hooks/use-pipeline-context";

/* Components */
export { SeedSlotEditor } from "./components/SeedSlotEditor";

/* Types */
export type {
  Pipeline,
  SeedSlot,
  CreatePipeline,
  UpdatePipeline,
} from "./types";
