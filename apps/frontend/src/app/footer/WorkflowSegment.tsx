/**
 * Active workflows segment. Links to the dashboard.
 */

import { Tooltip } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import { FooterSegment } from "./FooterSegment";
import type { WorkflowInfo } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface WorkflowSegmentProps {
  workflows: WorkflowInfo;
}

export function WorkflowSegment({ workflows }: WorkflowSegmentProps) {
  const tooltipText = workflows.current_stage
    ? `${workflows.active} active — ${workflows.current_stage}`
    : `${workflows.active} active workflow${workflows.active !== 1 ? "s" : ""}`;

  return (
    <Tooltip content={tooltipText} side="top">
      <FooterSegment href="/" label="Active workflows">
        <Workflow size={14} aria-hidden="true" />
        <span className="tabular-nums">{workflows.active}</span>
        <span className="hidden md:inline">
          {workflows.current_stage ?? (workflows.active === 1 ? "workflow" : "workflows")}
        </span>
      </FooterSegment>
    </Tooltip>
  );
}
