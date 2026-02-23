/**
 * Matrix grid component for visualizing production run cells (PRD-57).
 *
 * Displays characters as rows and scene types as columns. Each cell is
 * color-coded by status, supports checkbox selection for partial
 * submission, and shows blocking reasons on hover.
 */

import { useState } from "react";

import { Badge } from "@/components";

import {
  CELL_STATUS_BY_ID,
  CELL_STATUS_LABELS,
  CELL_STATUS_VARIANT,
} from "./types";
import type { CellStatus, ProductionRunCell } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface Character {
  id: number;
  name: string;
}

interface SceneType {
  id: number;
  name: string;
}

interface MatrixGridProps {
  /** All cells in the production run. */
  cells: ProductionRunCell[];
  /** Characters (rows). */
  characters: Character[];
  /** Scene types (columns). */
  sceneTypes: SceneType[];
  /** Currently selected cell IDs for submission. */
  selectedCellIds?: Set<number>;
  /** Toggle a cell's selection state. */
  onToggleCell?: (cellId: number) => void;
  /** Navigate to a cell's detail view. */
  onCellClick?: (cell: ProductionRunCell) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getCellStatus(cell: ProductionRunCell): CellStatus {
  return CELL_STATUS_BY_ID[cell.status_id] ?? "not_started";
}

function getCellColorClass(status: CellStatus): string {
  switch (status) {
    case "approved":
    case "delivered":
      return "bg-green-900/30 border-green-700/50";
    case "generating":
    case "queued":
      return "bg-blue-900/30 border-blue-700/50";
    case "qa_review":
      return "bg-yellow-900/30 border-yellow-700/50";
    case "failed":
    case "rejected":
      return "bg-red-900/30 border-red-700/50";
    case "blocked":
      return "bg-orange-900/30 border-orange-700/50";
    default:
      return "bg-[var(--color-surface-secondary)] border-[var(--color-border-subtle)]";
  }
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MatrixGrid({
  cells,
  characters,
  sceneTypes,
  selectedCellIds,
  onToggleCell,
  onCellClick,
}: MatrixGridProps) {
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);

  // Build a lookup map: (character_id, scene_type_id) -> cell
  const cellMap = new Map<string, ProductionRunCell>();
  for (const cell of cells) {
    const key = `${cell.character_id}-${cell.scene_type_id}`;
    cellMap.set(key, cell);
  }

  return (
    <div data-testid="matrix-grid" className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--color-surface-primary)] p-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Character
            </th>
            {sceneTypes.map((st) => (
              <th
                key={st.id}
                className="p-2 text-center text-xs font-medium text-[var(--color-text-muted)]"
              >
                {st.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {characters.map((char) => (
            <tr key={char.id}>
              <td className="sticky left-0 z-10 bg-[var(--color-surface-primary)] p-2 font-medium text-[var(--color-text-primary)]">
                {char.name}
              </td>
              {sceneTypes.map((st) => {
                const key = `${char.id}-${st.id}`;
                const cell = cellMap.get(key);

                if (!cell) {
                  return (
                    <td key={st.id} className="p-1">
                      <div className="h-10 rounded border border-dashed border-[var(--color-border-subtle)]" />
                    </td>
                  );
                }

                const status = getCellStatus(cell);
                const isSelected = selectedCellIds?.has(cell.id) ?? false;
                const isHovered = hoveredCellId === cell.id;

                return (
                  <td key={st.id} className="p-1">
                    <div
                      data-testid={`matrix-cell-${cell.id}`}
                      className={`relative flex h-10 cursor-pointer items-center justify-center rounded border ${getCellColorClass(status)} transition-colors hover:brightness-110`}
                      onMouseEnter={() => setHoveredCellId(cell.id)}
                      onMouseLeave={() => setHoveredCellId(null)}
                      onClick={() => onCellClick?.(cell)}
                    >
                      {/* Checkbox for selection */}
                      {onToggleCell && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleCell(cell.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-1 top-1 h-3 w-3"
                        />
                      )}

                      <Badge variant={CELL_STATUS_VARIANT[status]}>
                        {CELL_STATUS_LABELS[status]}
                      </Badge>

                      {/* Blocking reason tooltip */}
                      {isHovered && cell.blocking_reason && (
                        <div className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-[var(--color-text-muted)] shadow-lg">
                          {cell.blocking_reason}
                        </div>
                      )}
                    </div>
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
