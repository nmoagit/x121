/**
 * Admin-only segment showing service health dots for ComfyUI, Database, Workers.
 * Clicking navigates to the admin health dashboard.
 */

import { Tooltip } from "@/components/primitives";
import { Activity } from "@/tokens/icons";

import { FooterSegment, Separator, StatusDot } from "./FooterSegment";
import type { FooterServices, ServiceHealth } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const SERVICE_LABELS: { key: keyof FooterServices; label: string }[] = [
  { key: "comfyui", label: "ComfyUI" },
  { key: "database", label: "Database" },
  { key: "workers", label: "Workers" },
  { key: "storage", label: "Storage" },
  { key: "scheduler", label: "Scheduler" },
  { key: "autoscaler", label: "Auto-scaler" },
];

function worstHealth(services: FooterServices): ServiceHealth {
  const statuses = SERVICE_LABELS.map(({ key }) => services[key].status);
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

function healthLabel(health: ServiceHealth): string {
  if (health === "healthy") return "All services healthy";
  if (health === "degraded") return "Some services degraded";
  return "Service outage detected";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ServiceHealthSegmentProps {
  services: FooterServices | null;
}

export function ServiceHealthSegment({ services }: ServiceHealthSegmentProps) {
  if (!services) return null;

  const overall = worstHealth(services);

  const tooltipContent = (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium">{healthLabel(overall)}</div>
      {SERVICE_LABELS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1.5">
          <StatusDot health={services[key].status} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Tooltip content={tooltipContent} side="top">
        <FooterSegment href="/admin/health" label="Service health">
          <Activity size={14} aria-hidden="true" />
          {SERVICE_LABELS.map(({ key }) => (
            <StatusDot key={key} health={services[key].status} />
          ))}
          <span className="hidden md:inline">Services</span>
        </FooterSegment>
      </Tooltip>
      <Separator />
    </>
  );
}
