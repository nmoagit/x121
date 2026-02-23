/**
 * Scene assignments section component (PRD-108).
 *
 * Displays a table of scenes assigned to the character with status
 * badges and segment counts.
 */

import { Badge } from "@/components";

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

const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "default"> = {
  completed: "success",
  in_progress: "warning",
  pending: "default",
  failed: "danger",
};

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
        {sceneCount} {sceneCount === 1 ? "scene" : "scenes"} assigned
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
          className="w-full text-xs"
        >
          <thead>
            <tr className="border-b border-[var(--color-border-default)]">
              <th className="py-1 text-left text-[var(--color-text-secondary)]">
                Scene
              </th>
              <th className="py-1 text-left text-[var(--color-text-secondary)]">
                Status
              </th>
              <th className="py-1 text-right text-[var(--color-text-secondary)]">
                Segments
              </th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.scene_id}
                data-testid={`assignment-row-${a.scene_id}`}
                className="cursor-pointer border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)]"
                onClick={() => onSceneClick?.(a.scene_id)}
              >
                <td className="py-1 text-[var(--color-text-primary)]">
                  {a.scene_name}
                </td>
                <td className="py-1">
                  <Badge
                    data-testid={`status-badge-${a.scene_id}`}
                    variant={STATUS_VARIANTS[a.status] ?? "default"}
                    size="sm"
                  >
                    {a.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="py-1 text-right text-[var(--color-text-secondary)]">
                  {a.segment_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
