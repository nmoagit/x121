/**
 * Batch Production Orchestrator feature public API (PRD-57).
 */

// Components
export { MatrixGrid } from "./MatrixGrid";
export { ProductionProgress } from "./ProductionProgress";

// Hooks
export {
  productionKeys,
  useCreateProductionRun,
  useDeleteProductionRun,
  useDeliverRun,
  useProductionMatrix,
  useProductionProgress,
  useProductionRun,
  useProductionRuns,
  useResubmitFailed,
  useSubmitCells,
} from "./hooks/use-production";

// Types
export type {
  CreateProductionRunRequest,
  MatrixConfig,
  ProductionRun,
  ProductionRunCell,
  ProductionRunProgress,
  SubmitCellsRequest,
} from "./types";

export {
  CELL_STATUS_BY_ID,
  CELL_STATUS_LABELS,
  CELL_STATUS_VARIANT,
  RUN_STATUS_LABELS,
  RUN_STATUS_VARIANT,
} from "./types";
