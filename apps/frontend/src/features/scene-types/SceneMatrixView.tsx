/**
 * Scene matrix view (PRD-23).
 *
 * Displays a grid of characters x scene types showing generation status,
 * with color-coded badges and optional checkbox selection.
 */

import { Badge } from "@/components/primitives/Badge";
import type { BadgeVariant } from "@/components/primitives/Badge";
import type { MatrixCell, SceneType } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterInfo {
  id: number;
  name: string;
}

interface SceneMatrixViewProps {
  cells: MatrixCell[];
  characters: CharacterInfo[];
  sceneTypes: SceneType[];
  onSelect?: (cells: MatrixCell[]) => void;
}

/* --------------------------------------------------------------------------
   Status badge mapping
   -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  not_started: { label: "Not Started", variant: "default" },
  pending: { label: "Pending", variant: "info" },
  generating: { label: "Generating", variant: "warning" },
  review: { label: "Review", variant: "info" },
  approved: { label: "Approved", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  unknown: { label: "Unknown", variant: "default" },
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneMatrixView({ cells, characters, sceneTypes, onSelect }: SceneMatrixViewProps) {
  if (cells.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No matrix data. Select characters and scene types to generate.
      </p>
    );
  }

  const handleCheckboxChange = (cell: MatrixCell, checked: boolean) => {
    if (!onSelect) return;
    if (checked) {
      onSelect([cell]);
    } else {
      onSelect([]);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {onSelect && (
              <th className="p-2 text-left text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border-default)]" />
            )}
            <th className="p-2 text-left text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border-default)]">
              Character
            </th>
            {sceneTypes.map((st) => (
              <th
                key={st.id}
                className="p-2 text-left text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border-default)]"
              >
                {st.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {characters.map((char) => (
            <tr key={char.id}>
              {onSelect && (
                <td className="p-2 border-b border-[var(--color-border-default)]">
                  <input
                    type="checkbox"
                    aria-label={`Select ${char.name}`}
                    onChange={(e) => {
                      const charCells = cells.filter((c) => c.character_id === char.id);
                      handleCheckboxChange(charCells[0]!, e.target.checked);
                    }}
                  />
                </td>
              )}
              <td className="p-2 text-[var(--color-text-primary)] font-medium border-b border-[var(--color-border-default)]">
                {char.name}
              </td>
              {sceneTypes.map((st) => {
                const cell = cells.find(
                  (c) => c.character_id === char.id && c.scene_type_id === st.id,
                );
                const badge = cell
                  ? (STATUS_BADGE[cell.status] ?? STATUS_BADGE.unknown)
                  : STATUS_BADGE.not_started;

                return (
                  <td key={st.id} className="p-2 border-b border-[var(--color-border-default)]">
                    <Badge variant={badge!.variant} size="sm">
                      {badge!.label}
                    </Badge>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
