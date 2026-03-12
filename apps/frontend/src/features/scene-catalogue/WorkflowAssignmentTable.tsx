/**
 * Reusable workflow assignment table for scene_type x track combinations.
 *
 * Used by ProjectWorkflowOverrides, GroupWorkflowOverrides, and
 * TrackWorkflowManager. Renders a compact table with inline workflow
 * dropdowns per scene_type × track row.
 */

import { Card, CardBody } from "@/components/composite/Card";
import { Badge } from "@/components/primitives";

import {
  useDeleteTrackConfig,
  useTrackConfigs,
  useUpsertTrackConfig,
} from "./hooks/use-track-configs";
import type { SceneCatalogueEntry } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkflowAssignmentTableProps {
  entries: SceneCatalogueEntry[];
  workflowOptions: { value: string; label: string }[];
  /**
   * Optional set of enabled "sceneTypeId:trackId" keys. When provided,
   * only rows matching an enabled key are shown. Omit to show all rows
   * (e.g. in the global scene catalogue view).
   */
  enabledTrackKeys?: Set<string>;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function WorkflowAssignmentTable({ entries, workflowOptions, enabledTrackKeys }: WorkflowAssignmentTableProps) {
  return (
    <Card elevation="sm" padding="none">
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Scene Type
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Track
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Workflow
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <SceneTypeRows
                  key={entry.id}
                  entry={entry}
                  workflowOptions={workflowOptions}
                  enabledTrackKeys={enabledTrackKeys}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Per-scene-type row group
   -------------------------------------------------------------------------- */

interface SceneTypeRowsProps {
  entry: SceneCatalogueEntry;
  workflowOptions: { value: string; label: string }[];
  enabledTrackKeys?: Set<string>;
}

function SceneTypeRows({ entry, workflowOptions, enabledTrackKeys }: SceneTypeRowsProps) {
  const { data: configs } = useTrackConfigs(entry.id);
  const upsertMutation = useUpsertTrackConfig(entry.id);
  const deleteMutation = useDeleteTrackConfig(entry.id);

  const configMap = new Map(
    (configs ?? []).map((c) => [`${c.track_id}:${c.is_clothes_off}`, c]),
  );

  type RowDef = { trackId: number; trackName: string; isClothesOff: boolean };
  const allRows: RowDef[] = [];
  for (const track of entry.tracks) {
    allRows.push({ trackId: track.id, trackName: track.name, isClothesOff: false });
    if (entry.has_clothes_off_transition) {
      allRows.push({ trackId: track.id, trackName: track.name, isClothesOff: true });
    }
  }

  // Filter to only enabled tracks when a filter set is provided
  const rows = enabledTrackKeys
    ? allRows.filter((r) => enabledTrackKeys.has(`${entry.id}:${r.trackId}`))
    : allRows;

  return (
    <>
      {rows.map((row, idx) => {
        const config = configMap.get(`${row.trackId}:${row.isClothesOff}`) ?? null;
        const effectiveWorkflowId = config?.workflow_id ?? null;
        const hasOverride = config?.workflow_id != null;

        return (
          <tr
            key={`${entry.id}-${row.trackId}-${row.isClothesOff}`}
            className="border-b border-[var(--color-border-default)]"
          >
            <td className="px-3 py-1.5">
              {idx === 0 ? (
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {entry.name}
                </span>
              ) : null}
            </td>

            <td className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-primary)]">{row.trackName}</span>
                {row.isClothesOff && (
                  <Badge variant="warning" size="sm">Clothes Off</Badge>
                )}
              </div>
            </td>

            <td className="px-3 py-1.5">
              <select
                className="max-w-[200px] appearance-none rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-0.5 pr-6 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                value={effectiveWorkflowId != null ? String(effectiveWorkflowId) : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    deleteMutation.mutate({
                      trackId: row.trackId,
                      isClothesOff: row.isClothesOff,
                    });
                  } else {
                    upsertMutation.mutate({
                      trackId: row.trackId,
                      is_clothes_off: row.isClothesOff,
                      workflow_id: Number(value),
                    });
                  }
                }}
              >
                <option value="">None</option>
                {workflowOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </td>

            <td className="px-3 py-1.5">
              {hasOverride ? (
                <Badge variant="info" size="sm">Set</Badge>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">Not set</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
