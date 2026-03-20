/**
 * Reusable workflow assignment table for scene_type x track combinations.
 *
 * Used by ProjectWorkflowOverrides, GroupWorkflowOverrides, and
 * TrackWorkflowManager. Terminal-style dark table with inline workflow
 * dropdowns per scene_type × track row.
 */

import {
  useDeleteTrackConfig,
  useTrackConfigs,
  useUpsertTrackConfig,
} from "./hooks/use-track-configs";
import type { SceneCatalogueEntry } from "./types";
import { cn } from "@/lib/cn";
import { TERMINAL_SELECT, TRACK_TEXT_COLORS } from "@/lib/ui-classes";

const SELECT_CLS = cn(TERMINAL_SELECT, "max-w-[200px]");

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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-default)]/30">
            <th className="px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Scene Type
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Track
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Workflow
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
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

  type RowDef = { trackId: number; trackName: string; trackSlug: string; isClothesOff: boolean };
  const allRows: RowDef[] = [];
  for (const track of entry.tracks) {
    allRows.push({ trackId: track.id, trackName: track.name, trackSlug: track.slug, isClothesOff: false });
    if (entry.has_clothes_off_transition) {
      allRows.push({ trackId: track.id, trackName: track.name, trackSlug: track.slug, isClothesOff: true });
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
            className="border-b border-[var(--color-border-default)]/30 last:border-b-0"
          >
            <td className="px-3 py-1.5 font-mono text-xs">
              {idx === 0 ? (
                <span className="text-[var(--color-text-primary)] uppercase tracking-wide">
                  {entry.name}
                </span>
              ) : null}
            </td>

            <td className="px-3 py-1.5 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className={TRACK_TEXT_COLORS[row.trackSlug] ?? "text-[var(--color-text-primary)]"}>{row.trackName}</span>
                {row.isClothesOff && (
                  <span className="text-orange-400">clothes off</span>
                )}
              </div>
            </td>

            <td className="px-3 py-1.5">
              <select
                className={SELECT_CLS}
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

            <td className="px-3 py-1.5 font-mono text-xs">
              {hasOverride ? (
                <span className="text-green-400">set</span>
              ) : (
                <span className="text-[var(--color-text-muted)]">not set</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
