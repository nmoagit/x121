// Types
export type {
  CloudGpuInfo,
  FooterJobsInfo,
  FooterServices,
  FooterStatusData,
  ServiceHealth,
  ServiceStatusInfo,
  WorkflowInfo,
} from "./types";

// Hooks
export { useFooterCollapse } from "./useFooterCollapse";
export { useFooterStatus } from "./useFooterStatus";
export type { FooterStatus } from "./useFooterStatus";

// Primitives
export { FooterSegment, MiniProgressBar, Separator, StatusDot } from "./FooterSegment";

// Segments
export { CloudGpuSegment } from "./CloudGpuSegment";
export { CollapsedFooter } from "./CollapsedFooter";
export { JobSegment } from "./JobSegment";
export { ServiceHealthSegment } from "./ServiceHealthSegment";
export { WorkflowSegment } from "./WorkflowSegment";
