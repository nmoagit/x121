/**
 * Matrix grid component for visualizing production run cells (PRD-57).
 *
 * Displays avatars as rows and scene_type+track pairs as columns.
 * Each cell is color-coded by status, supports checkbox selection for
 * partial submission, and shows blocking reasons on hover.
 *
 * Columns are capped at 6 per row; additional columns wrap into
 * subsequent grids below.
 */

import { useMemo, useState } from "react";

import { TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";

import {
  CELL_STATUS_BY_ID,
  CELL_STATUS_LABELS,
  CELL_STATUS_VARIANT,
} from "./types";
import type { BadgeVariant } from "@/components";
import type { CellStatus, ProductionRunCell } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* Badge-like label without rounding, sized for compact matrix cells. */
const MATRIX_BADGE_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]",
  success: "bg-[var(--color-action-success)]/15 text-[var(--color-action-success)]",
  warning: "bg-[var(--color-action-warning)]/15 text-[var(--color-action-warning)]",
  danger: "bg-[var(--color-action-danger)]/15 text-[var(--color-action-danger)]",
  info: "bg-[var(--color-action-primary)]/15 text-[var(--color-action-primary)]",
};

/** Minimum width for each matrix cell (px). */
const CELL_MAX_WIDTH = 80;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface Avatar {
  id: number;
  name: string;
}

/** A column in the matrix — scene type optionally narrowed to a track. */
interface MatrixColumn {
  scene_type_id: number;
  scene_type_name: string;
  track_id: number | null;
  track_name: string | null;
  has_clothes_off_transition?: boolean;
}

interface MatrixGridProps {
  /** All cells in the production run. */
  cells: ProductionRunCell[];
  /** Avatars (rows). */
  avatars: Avatar[];
  /** Scene type + track columns. */
  columns: MatrixColumn[];
  /** Currently selected cell IDs for submission. */
  selectedCellIds?: Set<number>;
  /** Toggle a cell's selection state. */
  onToggleCell?: (cellId: number) => void;
  /** Navigate to a avatar's detail page. */
  onAvatarClick?: (avatarId: number) => void;
  /** Navigate to a cell's scene detail. */
  onCellClick?: (cell: ProductionRunCell) => void;
  /** Cancel a cell. */
  onCancelCell?: (cellId: number) => void;
  /** Delete a cell. */
  onDeleteCell?: (cellId: number) => void;
  /** Cancel all cells for a avatar. */
  onCancelAvatar?: (avatarId: number) => void;
  /** Delete all cells for a avatar (remove avatar from run). */
  onDeleteAvatar?: (avatarId: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getCellStatus(cell: ProductionRunCell): CellStatus {
  const base = CELL_STATUS_BY_ID[cell.status_id] ?? "not_started";
  // Not started + no seed image → "no_seed"
  if (base === "not_started" && cell.has_seed === false) return "no_seed";
  // status_id=2 with a linked scene means "has video, pending review" not "queued for generation"
  if (base === "queued" && cell.scene_id != null) return "in_progress";
  return base;
}

function getCellColorClass(status: CellStatus): string {
  switch (status) {
    case "approved":
    case "delivered":
      return "bg-green-900/30 border-green-700/50";
    case "generating":
    case "queued":
    case "in_progress":
      return "bg-blue-900/30 border-blue-700/50";
    case "qa_review":
      return "bg-yellow-900/30 border-yellow-700/50";
    case "failed":
    case "rejected":
      return "bg-red-900/30 border-red-700/50";
    case "no_seed":
    case "blocked":
      return "bg-orange-900/30 border-orange-700/50";
    case "skipped":
      return "bg-neutral-800/30 border-neutral-700/50";
    default:
      return "bg-[var(--color-surface-secondary)] border-[var(--color-border-subtle)]";
  }
}

function columnKey(col: MatrixColumn): string {
  return `${col.scene_type_id}-${col.track_id ?? "null"}`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MatrixGrid({
  cells,
  avatars,
  columns,
  selectedCellIds,
  onToggleCell,
  onAvatarClick,
  onCellClick,
  onCancelCell,
  onDeleteCell,
  onCancelAvatar,
  onDeleteAvatar,
}: MatrixGridProps) {
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<number | null>(null);

  // Build a lookup map: (avatar_id, scene_type_id, track_id) -> cell
  const cellMap = useMemo(() => {
    const map = new Map<string, ProductionRunCell>();
    for (const cell of cells) {
      const key = `${cell.avatar_id}-${cell.scene_type_id}-${cell.track_id ?? "null"}`;
      map.set(key, cell);
    }
    return map;
  }, [cells]);

  const hasCharActions = !!(onCancelAvatar || onDeleteAvatar);

  return (
    <div data-testid="matrix-grid" className="overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      <table className="border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--color-surface-secondary)]">
            <th className={`sticky left-0 z-10 bg-[var(--color-surface-secondary)] p-2 whitespace-nowrap ${TERMINAL_TH}`}>
              Avatar
            </th>
            {columns.map((col) => (
                  <th
                    key={columnKey(col)}
                    style={{ maxWidth: CELL_MAX_WIDTH }}
                    className={`p-2 text-center whitespace-nowrap ${TERMINAL_TH}`}
                  >
                    <div>{col.scene_type_name}</div>
                    {col.has_clothes_off_transition ? (
                      <div className="text-[10px] font-normal text-[var(--color-text-muted)] opacity-70">
                        Clothes Off
                      </div>
                    ) : col.track_name ? (
                      <div className="text-[10px] font-normal text-[var(--color-text-muted)] opacity-70">
                        {col.track_name}
                      </div>
                    ) : null}
                  </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {avatars.map((char) => (
              <tr key={char.id} className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}>
                <td className={`sticky left-0 z-10 bg-[var(--color-surface-primary)] p-0 ${TYPO_DATA} whitespace-nowrap`}>
                  <div
                    onMouseEnter={() => setHoveredCharId(char.id)}
                    onMouseLeave={() => setHoveredCharId(null)}
                  >
                    {hasCharActions && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          visibility: hoveredCharId === char.id ? "visible" : "hidden",
                          padding: "2px 8px 0",
                        }}
                      >
                        {onCancelAvatar && (
                          <button
                            type="button"
                            style={{ paddingRight: 2 }}
                            className="text-[10px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                            onClick={() => onCancelAvatar(char.id)}
                          >
                            <span className="inline-block rounded bg-[var(--color-surface-primary)] px-1.5 py-0.5 shadow border border-[var(--color-border-default)]">
                              Cancel
                            </span>
                          </button>
                        )}
                        {onDeleteAvatar && (
                          <button
                            type="button"
                            style={{ paddingLeft: 2 }}
                            className="text-[10px] font-medium text-[var(--color-data-red)] hover:text-red-300"
                            onClick={() => onDeleteAvatar(char.id)}
                          >
                            <span className="inline-block rounded bg-[var(--color-surface-primary)] px-1.5 py-0.5 shadow border border-[var(--color-border-default)]">
                              Remove
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                    <div
                      style={{ padding: "4px 8px 8px", cursor: onAvatarClick ? "pointer" : undefined }}
                      className={onAvatarClick ? "hover:text-[var(--color-action-primary)] hover:underline" : ""}
                      onClick={onAvatarClick ? () => onAvatarClick(char.id) : undefined}
                    >
                      {char.name}
                    </div>
                  </div>
                </td>
                {columns.map((col) => {
                    const key = `${char.id}-${col.scene_type_id}-${col.track_id ?? "null"}`;
                    const cell = cellMap.get(key);

                    if (!cell) {
                      const hasCellActions = !!(onCancelCell || onDeleteCell);
                      return (
                        <td
                          key={columnKey(col)}
                          style={{ maxWidth: CELL_MAX_WIDTH }}
                          className="p-1"
                        >
                          <div>
                            {/* Spacer to align with action-button rows on regular cells */}
                            {hasCellActions && (
                              <div style={{ padding: "0 0 2px", visibility: "hidden" }}>
                                <span className="inline-block text-[10px] px-1.5 py-0.5">&nbsp;</span>
                              </div>
                            )}
                            <div
                              className={`flex h-10 items-center justify-center rounded border ${getCellColorClass("skipped")}`}
                            >
                              <span
                                className={`inline-flex items-center px-1 py-px text-[10px] font-medium leading-tight whitespace-nowrap ${MATRIX_BADGE_CLASSES[CELL_STATUS_VARIANT.skipped]}`}
                              >
                                {CELL_STATUS_LABELS.skipped}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    }

                    const status = getCellStatus(cell);
                    const isSelected = selectedCellIds?.has(cell.id) ?? false;
                    const isHovered = hoveredCellId === cell.id;
                    const canCancel = cell.status_id === 1 || cell.status_id === 2;

                    const hasCellActions = !!(onCancelCell || onDeleteCell);

                    return (
                      <td
                        key={columnKey(col)}
                        style={{ maxWidth: CELL_MAX_WIDTH }}
                        className="p-1"
                      >
                        <div
                          onMouseEnter={() => setHoveredCellId(cell.id)}
                          onMouseLeave={() => setHoveredCellId(null)}
                        >
                          {/* Cell actions — always rendered, visibility toggled */}
                          {hasCellActions && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                visibility: isHovered ? "visible" : "hidden",
                                padding: "0 0 2px",
                              }}
                            >
                              {onCancelCell && canCancel && (
                                <button
                                  type="button"
                                  style={{ paddingRight: 2 }}
                                  className="text-[10px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                                  onClick={(e) => { e.stopPropagation(); onCancelCell(cell.id); }}
                                >
                                  <span className="inline-block rounded bg-[var(--color-surface-primary)] px-1.5 py-0.5 shadow border border-[var(--color-border-default)]">
                                    Cancel
                                  </span>
                                </button>
                              )}
                              {onDeleteCell && (
                                <button
                                  type="button"
                                  style={{ paddingLeft: 2 }}
                                  className="text-[10px] font-medium text-[var(--color-data-red)] hover:text-red-300"
                                  onClick={(e) => { e.stopPropagation(); onDeleteCell(cell.id); }}
                                >
                                  <span className="inline-block rounded bg-[var(--color-surface-primary)] px-1.5 py-0.5 shadow border border-[var(--color-border-default)]">
                                    Delete
                                  </span>
                                </button>
                              )}
                            </div>
                          )}

                          <div
                            data-testid={`matrix-cell-${cell.id}`}
                            className={`relative flex h-10 cursor-pointer items-center justify-center rounded border ${getCellColorClass(status)} transition-colors hover:brightness-110`}
                            onClick={() => onCellClick?.(cell)}
                          >
                            {/* Checkbox for selection — hidden for no_seed cells */}
                            {onToggleCell && status !== "no_seed" && (
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

                            <span
                              className={`inline-flex items-center px-1 py-px text-[10px] font-medium leading-tight whitespace-nowrap ${MATRIX_BADGE_CLASSES[CELL_STATUS_VARIANT[status]]}`}
                            >
                              {CELL_STATUS_LABELS[status]}
                            </span>

                            {/* Blocking reason tooltip */}
                            {isHovered && cell.blocking_reason && (
                              <div className="absolute -bottom-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-surface-primary)] px-2 py-1 text-xs text-[var(--color-text-muted)] shadow-lg">
                                {cell.blocking_reason}
                              </div>
                            )}
                          </div>
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
