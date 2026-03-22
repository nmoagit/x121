/**
 * Workflow detail panel with tabbed views (PRD-75).
 *
 * Tabs:
 * - Canvas: React Flow workflow visualization
 * - JSON: raw workflow JSON viewer
 * - Validation: node/model validation results with re-validate action
 * - Info: metadata, import source, discovered parameters
 */

import { useCallback, useState } from "react";

import { Button, TabBar } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_STATUS_COLORS, TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, TRACK_TEXT_COLORS } from "@/lib/ui-classes";

import { WorkflowCanvas } from "@/features/workflow-canvas/WorkflowCanvas";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useSceneCatalogue } from "@/features/scene-catalogue/hooks/use-scene-catalogue";
import { useTrackConfigs } from "@/features/scene-catalogue/hooks/use-track-configs";
import type { SceneCatalogueEntry } from "@/features/scene-catalogue/types";

import {
  useValidateWorkflow,
  useValidationReport,
} from "./hooks/use-workflow-import";
import type {
  DiscoveredParameter,
  ValidationResult,
  Workflow,
} from "./types";
import { workflowStatusLabel } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WorkflowDetailPanelProps {
  workflow: Workflow;
}

type DetailTab = "canvas" | "json" | "validation" | "scenes" | "info";

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "canvas", label: "Canvas" },
  { key: "json", label: "Raw JSON" },
  { key: "validation", label: "Validation" },
  { key: "scenes", label: "Scenes" },
  { key: "info", label: "Info" },
];

/* --------------------------------------------------------------------------
   JSON Tab
   -------------------------------------------------------------------------- */

function JsonTab({ workflow }: { workflow: Workflow }) {
  const [collapsed, setCollapsed] = useState(false);
  const jsonStr = JSON.stringify(workflow.json_content, null, 2);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonStr);
  }, [jsonStr]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
          Workflow JSON <span className="text-cyan-400">{Object.keys(workflow.json_content).length} nodes</span>
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" size="xs" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "Expand" : "Collapse"}
          </Button>
          <Button variant="ghost" size="xs" onClick={handleCopy}>
            Copy
          </Button>
        </div>
      </div>
      <pre
        className={`overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)]/30 bg-[#0d1117] p-3 font-mono text-[10px] text-cyan-400 ${
          collapsed ? "max-h-[200px]" : "max-h-[600px]"
        }`}
      >
        {jsonStr}
      </pre>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Validation Tab
   -------------------------------------------------------------------------- */

function ValidationTab({ workflow }: { workflow: Workflow }) {
  const { data: report, isLoading } = useValidationReport(workflow.id);
  const validateMutation = useValidateWorkflow();

  const handleRevalidate = useCallback(() => {
    validateMutation.mutate(workflow.id);
  }, [validateMutation, workflow.id]);

  // Use fresh report from query, or fall back to stored results on workflow
  const validation: ValidationResult | null =
    (report as ValidationResult | null) ??
    (workflow.validation_results_json as ValidationResult | null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
          Node &amp; Model Validation
        </span>
        <Button variant="secondary" size="xs" onClick={handleRevalidate} loading={validateMutation.isPending}>
          Re-validate
        </Button>
      </div>

      {isLoading && (
        <p className="text-xs font-mono text-[var(--color-text-muted)]">Loading validation results...</p>
      )}

      {!isLoading && !validation && (
        <p className="text-xs font-mono text-[var(--color-text-muted)]">No validation results yet. Click &quot;Re-validate&quot; to check.</p>
      )}

      {!isLoading && validation && (
        <div className="space-y-3">
          {/* Overall status */}
          <div className="flex items-center gap-2 font-mono text-xs">
            {validation.validation_source === "live" ? (
              <span className={validation.overall_valid ? "text-green-400" : "text-red-400"}>
                {validation.overall_valid ? "valid" : "invalid"}
              </span>
            ) : (
              <span className="text-orange-400">unverified</span>
            )}
            <span className="text-[var(--color-text-muted)] opacity-30">|</span>
            <span className="text-[var(--color-text-muted)]">
              {validation.validation_source === "live" ? "live (comfyui)" : "static — connect comfyui to verify"}
            </span>
          </div>

          {workflow.last_validated_at && (
            <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
              last validated: {new Date(workflow.last_validated_at).toLocaleString()}
            </p>
          )}

          {validation.validation_source === "static" && (
            <p className="text-[10px] font-mono text-orange-400">
              No ComfyUI instance connected. Connect and re-validate to check nodes.
            </p>
          )}

          {/* Node results */}
          {validation.node_results.length > 0 && (
            <div>
              <h4 className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
                Node Types <span className="text-cyan-400">{validation.node_results.length}</span>
              </h4>
              <div className="space-y-px">
                {validation.node_results.map((nr) => {
                  const isLive = validation.validation_source === "live";
                  return (
                    <div key={nr.node_type} className="flex items-center gap-2 font-mono text-xs py-0.5">
                      <span className={isLive ? (nr.present ? "text-green-400" : "text-red-400") : "text-[var(--color-text-muted)]"}>
                        {isLive ? (nr.present ? "\u2713" : "\u2717") : "\u2014"}
                      </span>
                      <span className="text-[var(--color-text-primary)]">{nr.node_type}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model results */}
          {validation.model_results.length > 0 && (
            <div>
              <h4 className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
                Models <span className="text-cyan-400">{validation.model_results.length}</span>
              </h4>
              <div className="space-y-px">
                {validation.model_results.map((mr) => (
                  <div key={mr.model_name} className="flex items-center gap-2 font-mono text-xs py-0.5">
                    <span className={mr.found_in_registry ? "text-green-400" : "text-orange-400"}>
                      {mr.found_in_registry ? "\u2713" : "?"}
                    </span>
                    <span className="text-[var(--color-text-primary)]">{mr.model_name}</span>
                    {!mr.found_in_registry && (
                      <span className="text-[10px] text-[var(--color-text-muted)]">(needs worker check)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Info Tab
   -------------------------------------------------------------------------- */

function InfoTab({ workflow }: { workflow: Workflow }) {
  const discoveredParams =
    (workflow.discovered_params_json as DiscoveredParameter[] | null) ?? [];

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Metadata */}
      <div>
        <h4 className="mb-2 text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Workflow Details
        </h4>
        <dl className="space-y-1.5">
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Name</dt>
            <dd className="text-[var(--color-text-primary)]">{workflow.name}</dd>
          </div>
          {workflow.description && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Description</dt>
              <dd className="text-[var(--color-text-muted)]">{workflow.description}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Status</dt>
            <dd className={TERMINAL_STATUS_COLORS[workflowStatusLabel(workflow.status_id).toLowerCase()] ?? "text-cyan-400"}>
              {workflowStatusLabel(workflow.status_id).toLowerCase()}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Version</dt>
            <dd className="text-cyan-400">v{workflow.current_version}</dd>
          </div>
          {workflow.imported_from && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Source File</dt>
              <dd className="text-[var(--color-text-primary)]">{workflow.imported_from}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Created</dt>
            <dd className="text-[var(--color-text-muted)]">{new Date(workflow.created_at).toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Updated</dt>
            <dd className="text-[var(--color-text-muted)]">{new Date(workflow.updated_at).toLocaleString()}</dd>
          </div>
          {workflow.last_validated_at && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Validated</dt>
              <dd className="text-[var(--color-text-muted)]">{new Date(workflow.last_validated_at).toLocaleString()}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-muted)] w-28 shrink-0 uppercase text-[10px]">Nodes</dt>
            <dd className="text-cyan-400">{Object.keys(workflow.json_content).length}</dd>
          </div>
        </dl>
      </div>

      {/* Discovered parameters */}
      {discoveredParams.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Discovered Parameters <span className="text-cyan-400">{discoveredParams.length}</span>
          </h4>
          <div className="space-y-1">
            {discoveredParams.map((param) => (
              <div
                key={`${param.node_id}-${param.input_name}`}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-default)]/30 bg-[#161b22] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--color-text-primary)]">{param.suggested_name}</span>
                  <span className="text-[var(--color-text-muted)]">{param.category}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                  node {param.node_id} / {param.input_name}
                </p>
                <p className="mt-0.5 text-[10px] text-cyan-400">
                  {JSON.stringify(param.current_value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Scenes Tab — shows which scene+track combos use this workflow
   -------------------------------------------------------------------------- */

function ScenesTab({ workflowId }: { workflowId: number }) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: entries, isLoading } = useSceneCatalogue(true, pipelineCtx?.pipelineId);

  const entriesWithTracks = (entries ?? []).filter(
    (e: SceneCatalogueEntry) => e.tracks.length > 0,
  );

  if (isLoading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>;
  }

  if (!entriesWithTracks.length) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">
        No scene types with tracks found.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
        Scene + Track Assignments
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={`${TERMINAL_TH} px-3 py-1.5`}>Scene Type</th>
              <th className={`${TERMINAL_TH} px-3 py-1.5`}>Track</th>
              <th className={`${TERMINAL_TH} px-3 py-1.5 text-center`}>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {entriesWithTracks.map((entry: SceneCatalogueEntry) => (
              <SceneTypeAssignmentRows
                key={entry.id}
                entry={entry}
                workflowId={workflowId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Renders rows for a single scene type, checking which tracks use this workflow. */
function SceneTypeAssignmentRows({
  entry,
  workflowId,
}: {
  entry: SceneCatalogueEntry;
  workflowId: number;
}) {
  const { data: configs } = useTrackConfigs(entry.id);
  const configMap = new Map(
    (configs ?? []).map((c) => [`${c.track_id}:${c.is_clothes_off}`, c]),
  );

  // Build rows: normal + clothes-off per track
  type RowDef = { trackId: number; trackName: string; isClothesOff: boolean };
  const rows: RowDef[] = [];
  for (const track of entry.tracks) {
    rows.push({ trackId: track.id, trackName: track.name, isClothesOff: false });
    if (entry.has_clothes_off_transition) {
      rows.push({ trackId: track.id, trackName: track.name, isClothesOff: true });
    }
  }

  return (
    <>
      {rows.map((row, idx) => {
        const config = configMap.get(`${row.trackId}:${row.isClothesOff}`);
        const isAssigned = config?.workflow_id === workflowId;

        return (
          <tr
            key={`${entry.id}-${row.trackId}-${row.isClothesOff}`}
            className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
          >
            <td className="px-3 py-1.5 font-mono text-xs">
              {idx === 0 ? (
                <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{entry.name}</span>
              ) : null}
            </td>
            <td className="px-3 py-1.5 font-mono text-xs">
              <span className={TRACK_TEXT_COLORS[row.trackName.toLowerCase()] ?? "text-[var(--color-text-primary)]"}>{row.trackName}</span>
              {row.isClothesOff && (
                <span className="ml-1.5 text-orange-400">clothes off</span>
              )}
            </td>
            <td className="px-3 py-1.5 text-center font-mono text-xs">
              {isAssigned ? (
                <span className="text-green-400">yes</span>
              ) : (
                <span className="text-[var(--color-text-muted)]">&mdash;</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------------------
   Main Component
   -------------------------------------------------------------------------- */

export function WorkflowDetailPanel({ workflow }: WorkflowDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("canvas");

  return (
    <Stack gap={0} className="h-full">
      <div className="px-3 py-2">
        <TabBar
          tabs={DETAIL_TABS}
          activeTab={activeTab}
          onChange={(k) => setActiveTab(k as DetailTab)}
          variant="pills"
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === "canvas" && (
          <div className="h-full min-h-[460px]">
            <WorkflowCanvas workflowJson={workflow.json_content} />
          </div>
        )}
        {activeTab === "json" && <JsonTab workflow={workflow} />}
        {activeTab === "validation" && <ValidationTab workflow={workflow} />}
        {activeTab === "scenes" && <ScenesTab workflowId={workflow.id} />}
        {activeTab === "info" && <InfoTab workflow={workflow} />}
      </div>
    </Stack>
  );
}
