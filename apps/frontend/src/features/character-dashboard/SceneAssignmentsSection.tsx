/**
 * Scene assignments section component (PRD-108).
 *
 * Displays a table of all enabled scene_type+track combinations for a
 * character, with status badges and segment/final video counts.
 */

import { Badge } from "@/components";
import { TrackBadge } from "@/features/scene-catalogue";

import type { SceneAssignment } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SceneAssignmentsSectionProps {
  /** Scene assignments for this character. */
  assignments: SceneAssignment[];
  /** Total scene count from the dashboard. */
  sceneCount: number;
  /** Called when a scene row is clicked. */
  onSceneClick?: (sceneId: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "default" | "info"> = {
  completed: "success",
  approved: "success",
  in_progress: "warning",
  generating: "warning",
  generated: "warning",
  imported: "info",
  pending: "default",
  not_started: "default",
  failed: "danger",
  rejected: "danger",
};

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
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Scene Assignments
      </h3>

      <p
        data-testid="scene-count"
        className="text-xs text-[var(--color-text-secondary)]"
      >
        {sceneCount} scene{sceneCount === 1 ? "" : "s"} assigned
      </p>

      {assignments.length === 0 ? (
        <p
          data-testid="no-assignments"
          className="text-xs text-[var(--color-text-tertiary)]"
        >
          No scene assignments yet.
        </p>
      ) : (
        <table
          data-testid="assignments-table"
          className="w-full text-xs table-fixed"
        >
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[25%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-default)]">
              <th className="py-1.5 pr-2 text-left text-[var(--color-text-secondary)]">
                Scene
              </th>
              <th className="py-1.5 pr-2 text-left text-[var(--color-text-secondary)]">
                Track
              </th>
              <th className="py-1.5 pr-2 text-left text-[var(--color-text-secondary)]">
                Status
              </th>
              <th className="py-1.5 text-right text-[var(--color-text-secondary)]">
                Videos
              </th>
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
                  className={
                    clickable
                      ? "cursor-pointer border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)]"
                      : "border-b border-[var(--color-border-subtle)]"
                  }
                  onClick={() => clickable && a.scene_id != null && onSceneClick?.(a.scene_id)}
                >
                  <td className="py-1.5 pr-2 text-[var(--color-text-primary)] truncate">
                    {a.scene_name}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1">
                      <TrackBadge name={a.track_name} slug={a.track_slug} />
                      {a.has_clothes_off_transition && (
                        <TrackBadge name="Clothes Off" slug="clothes_off" />
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Badge
                      variant={STATUS_VARIANTS[a.status] ?? "default"}
                      size="sm"
                    >
                      {a.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right text-[var(--color-text-secondary)]">
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
