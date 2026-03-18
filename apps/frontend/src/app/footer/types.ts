/* --------------------------------------------------------------------------
   Footer Status Types
   --------------------------------------------------------------------------
   Match the backend FooterStatusResponse shape (PRD-117).
   -------------------------------------------------------------------------- */

export type ServiceHealth = "healthy" | "degraded" | "down";

export interface ServiceStatusInfo {
  status: ServiceHealth;
  latency_ms: number;
  checked_at: string;
  detail?: string;
}

export interface FooterServices {
  comfyui: ServiceStatusInfo;
  database: ServiceStatusInfo;
  workers: ServiceStatusInfo;
  storage: ServiceStatusInfo;
  scheduler: ServiceStatusInfo;
  autoscaler: ServiceStatusInfo;
}

export interface CloudGpuInfo {
  active_pods: number;
  cost_per_hour_cents: number;
  budget_status: "ok" | "warning" | "exceeded";
}

export interface FooterJobsInfo {
  running: number;
  queued: number;
  overall_progress: number;
}

export interface WorkflowInfo {
  active: number;
  current_stage: string | null;
}

export interface FooterStatusData {
  services: FooterServices | null;
  cloud_gpu: CloudGpuInfo | null;
  jobs: FooterJobsInfo;
  workflows: WorkflowInfo;
}
