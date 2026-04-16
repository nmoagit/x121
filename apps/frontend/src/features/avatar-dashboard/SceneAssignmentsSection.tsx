/**
 * Scene assignments section component (PRD-108).
 *
 * Displays a table of all enabled scene_type+track combinations for a
 * avatar, with status badges and segment/final video counts.
 */


import type { SceneAssignment } from "./types";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SceneAssignmentsSectionProps {
  /** Scene assignments for this avatar. */
  assignments: SceneAssignment[];
  /** Total scene count from the dashboard. */
  sceneCount: number;
  /** Called when a scene row is clicked. */
  onSceneClick?: (sceneId: number) => void;
}

function formatVideoCount(a: SceneAssignment): string {
  if (a.segment_count === 0 && a.final_video_count === 0) return "-";
  return `${a.segment_count}+${a.final_video_count}`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneAssignmentsSection({
  assignments,
  sceneCount,
  onSceneClick,
}: SceneAssignmentsSectionProps) {
  return (
    <div data-testid="scene-assignments-section" className="flex flex-col gap-2">
      <div className={`flex items-center gap-2 ${TYPO_DATA}`}>
        <span data-testid="scene-count" className="text-[var(--color-text-muted)]">
          {sceneCount} scene{sceneCount === 1 ? "" : "s"} assigned
        </span>
      </div>

      {assignments.length === 0 ? (
        <p data-testid="no-assignments" className="text-xs font-mono text-[var(--color-text-muted)]">
          No scene assignments yet.
        </p>
      ) : (
        <table data-testid="assignments-table" className={`w-full ${TYPO_DATA} table-fixed`}>
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[25%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-default)]/30">
              <th className="py-1.5 pr-2 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Scene</th>
              <th className="py-1.5 pr-2 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Track</th>
              <th className="py-1.5 pr-2 text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Status</th>
              <th className="py-1.5 text-right text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Videos</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const key = `${a.scene_type_id}-${a.track_id}`;
              const clickable = a.scene_id != null;

              return (
                <tr
                  key={key}
                  data-testid={`assignment-row-${key}`}
                  className={`border-b border-[var(--color-border-default)]/30 last:border-b-0 ${
                    clickable ? "cursor-pointer hover:bg-[var(--color-surface-secondary)] transition-colors" : ""
                  }`}
                  onClick={() => clickable && a.scene_id != null && onSceneClick?.(a.scene_id)}
                >
                  <td className="py-1.5 pr-2 text-[var(--color-text-primary)] uppercase tracking-wide truncate">
                    {a.scene_name}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1">
                      <span className={TRACK_TEXT_COLORS[a.track_slug] ?? "text-[var(--color-text-primary)]"}>{a.track_name}</span>
                      {a.has_clothes_off_transition && (
                        <span className="text-[var(--color-data-orange)]">clothes off</span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={TERMINAL_STATUS_COLORS[a.status] ?? "text-[var(--color-text-muted)]"}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-[var(--color-text-muted)]">
                    {formatVideoCount(a)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
