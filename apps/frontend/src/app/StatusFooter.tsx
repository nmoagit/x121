/**
 * System Status Footer Bar (PRD-117).
 *
 * Always-visible 28 px bar at the bottom of the app shell.
 * Admin users see service health and cloud GPU segments.
 * All users see workflow and job segments.
 *
 * The bar can be collapsed to a thin accent line via the chevron toggle
 * (state persisted to localStorage).
 */

import { ChevronDown } from "@/tokens/icons";

import { CloudGpuSegment } from "./footer/CloudGpuSegment";
import { CollapsedFooter } from "./footer/CollapsedFooter";
import { JobSegment } from "./footer/JobSegment";
import { ServiceHealthSegment } from "./footer/ServiceHealthSegment";
import { useFooterCollapse } from "./footer/useFooterCollapse";
import { useFooterStatus } from "./footer/useFooterStatus";
import { WorkflowSegment } from "./footer/WorkflowSegment";

export function StatusFooter() {
  const status = useFooterStatus();
  const [collapsed, setCollapsed] = useFooterCollapse();

  if (collapsed) {
    return <CollapsedFooter onExpand={() => setCollapsed(false)} hasAlert={false} />;
  }

  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 text-xs"
      role="contentinfo"
    >
      {/* Left: system status segments */}
      <div className="flex items-center gap-0">
        {status.isAdmin && <ServiceHealthSegment services={status.services} />}
        {status.isAdmin && <CloudGpuSegment cloudGpu={status.cloudGpu} />}
        <WorkflowSegment workflows={status.workflows} />
      </div>

      {/* Right: jobs + collapse toggle */}
      <div className="flex items-center gap-0">
        <JobSegment jobs={status.jobs} />
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="ml-1 flex items-center justify-center rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          aria-label="Collapse footer"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </footer>
  );
}
