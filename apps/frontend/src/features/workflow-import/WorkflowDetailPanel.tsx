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

import { Badge, Button, TabBar } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { WorkflowCanvas } from "@/features/workflow-canvas/WorkflowCanvas";
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
import { workflowStatusLabel, workflowStatusVariant } from "./types";

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
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Workflow JSON ({Object.keys(workflow.json_content).length} nodes)
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "Expand" : "Collapse"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            Copy
          </Button>
        </div>
      </div>
      <pre
        className={`overflow-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 font-mono text-xs text-[var(--color-text-secondary)] ${
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
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Node &amp; Model Validation
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRevalidate}
          loading={validateMutation.isPending}
        >
          Re-validate
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Loading validation results...
        </p>
      )}

      {!isLoading && !validation && (
        <p className="text-sm text-[var(--color-text-tertiary)]">
          No validation results yet. Click &quot;Re-validate&quot; to check this workflow.
        </p>
      )}

      {!isLoading && validation && (
        <div className="space-y-4">
          {/* Overall status */}
          <div className="flex items-center gap-2">
            {validation.validation_source === "live" ? (
              <Badge variant={validation.overall_valid ? "success" : "danger"}>
                {validation.overall_valid ? "Valid" : "Invalid"}
              </Badge>
            ) : (
              <Badge variant="warning">Unverified</Badge>
            )}
            {validation.validation_source && (
              <Badge
                variant={validation.validation_source === "live" ? "info" : "warning"}
              >
                {validation.validation_source === "live"
                  ? "Live (ComfyUI)"
                  : "Connect ComfyUI to verify"}
              </Badge>
            )}
          </div>

          {workflow.last_validated_at && (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Last validated: {new Date(workflow.last_validated_at).toLocaleString()}
            </p>
          )}

          {validation.validation_source === "static" && (
            <p className="text-sm text-[var(--color-action-warning)]">
              No ComfyUI instance is connected. Connect to ComfyUI and
              re-validate to check node availability.
            </p>
          )}

          {/* Node results */}
          {validation.node_results.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
                Node Types ({validation.node_results.length})
              </h4>
              <div className="space-y-1">
                {validation.node_results.map((nr) => {
                  const isLive = validation.validation_source === "live";
                  let icon: string;
                  let colorClass: string;

                  if (isLive) {
                    icon = nr.present ? "\u2713" : "\u2717";
                    colorClass = nr.present
                      ? "text-[var(--color-action-success)]"
                      : "text-[var(--color-action-danger)]";
                  } else {
                    icon = "\u2014";
                    colorClass = "text-[var(--color-text-muted)]";
                  }

                  return (
                    <div
                      key={nr.node_type}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className={colorClass}>{icon}</span>
                      <span>{nr.node_type}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model results */}
          {validation.model_results.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
                Models ({validation.model_results.length})
              </h4>
              <div className="space-y-1">
                {validation.model_results.map((mr) => (
                  <div
                    key={mr.model_name}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className={
                        mr.found_in_registry
                          ? "text-[var(--color-action-success)]"
                          : "text-[var(--color-action-warning)]"
                      }
                    >
                      {mr.found_in_registry ? "\u2713" : "?"}
                    </span>
                    <span>{mr.model_name}</span>
                    {!mr.found_in_registry && (
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        (requires worker verification)
                      </span>
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
    <div className="space-y-4">
      {/* Metadata */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
          Workflow Details
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Name</dt>
            <dd className="text-[var(--color-text-primary)]">{workflow.name}</dd>
          </div>
          {workflow.description && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Description</dt>
              <dd className="text-[var(--color-text-primary)]">{workflow.description}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Status</dt>
            <dd>
              <Badge variant={workflowStatusVariant(workflow.status_id)} size="sm">
                {workflowStatusLabel(workflow.status_id)}
              </Badge>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Version</dt>
            <dd className="text-[var(--color-text-primary)]">v{workflow.current_version}</dd>
          </div>
          {workflow.imported_from && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Source File</dt>
              <dd className="text-[var(--color-text-primary)]">{workflow.imported_from}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Created</dt>
            <dd className="text-[var(--color-text-primary)]">
              {new Date(workflow.created_at).toLocaleString()}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Updated</dt>
            <dd className="text-[var(--color-text-primary)]">
              {new Date(workflow.updated_at).toLocaleString()}
            </dd>
          </div>
          {workflow.last_validated_at && (
            <div className="flex gap-2">
              <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Last Validated</dt>
              <dd className="text-[var(--color-text-primary)]">
                {new Date(workflow.last_validated_at).toLocaleString()}
              </dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-[var(--color-text-tertiary)] w-32 shrink-0">Nodes</dt>
            <dd className="text-[var(--color-text-primary)]">
              {Object.keys(workflow.json_content).length}
            </dd>
          </div>
        </dl>
      </div>

      {/* Discovered parameters */}
      {discoveredParams.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
            Discovered Parameters ({discoveredParams.length})
          </h4>
          <div className="space-y-2">
            {discoveredParams.map((param) => (
              <div
                key={`${param.node_id}-${param.input_name}`}
                className="rounded border border-[var(--color-border-subtle)] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {param.suggested_name}
                  </span>
                  <Badge variant="default" size="sm">
                    {param.category}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  Node {param.node_id} / {param.input_name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                  Current: {JSON.stringify(param.current_value)}
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
  const { data: entries, isLoading } = useSceneCatalogue(true);

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
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
        Scene + Track Assignments
      </h4>
      <div className="rounded border border-[var(--color-border-subtle)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-default)]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                Scene Type
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                Track
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-[var(--color-text-muted)]">
                Assigned
              </th>
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
            className="border-b border-[var(--color-border-subtle)]"
          >
            <td className="px-3 py-1.5">
              {idx === 0 ? (
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {entry.name}
                </span>
              ) : null}
            </td>
            <td className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
              <span>{row.trackName}</span>
              {row.isClothesOff && (
                <span className="ml-1.5 text-[var(--color-action-warning)] font-medium">
                  (Clothes Off)
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-center">
              {isAssigned ? (
                <Badge variant="success" size="sm">Yes</Badge>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">&mdash;</span>
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
      <div className="border-b border-[var(--color-border-default)] px-3 pt-2">
        <TabBar
          tabs={DETAIL_TABS}
          activeTab={activeTab}
          onChange={(k) => setActiveTab(k as DetailTab)}
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
