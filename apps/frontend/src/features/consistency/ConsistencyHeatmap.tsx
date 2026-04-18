/**
 * Pairwise similarity heatmap for avatar consistency (PRD-94).
 *
 * Renders a color-coded matrix of pairwise similarity scores with
 * scene labels on rows and columns.
 */

import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

import {
  consistencyBg,
  consistencyCellBg,
  consistencyColor,
  type PairwiseScores,
} from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ConsistencyHeatmapProps {
  scores: PairwiseScores;
  overallScore: number | null;
}

export function ConsistencyHeatmap({ scores, overallScore }: ConsistencyHeatmapProps) {
  const { matrix, scene_labels } = scores;
  const isEmpty = matrix.length === 0;

  return (
    <div data-testid="consistency-heatmap">
      {/* Overall score */}
      {overallScore !== null && (
        <div
          data-testid="overall-score"
          className={cn(
            "mb-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2",
            consistencyBg(overallScore),
          )}
        >
          <span className="text-sm text-[var(--color-text-secondary)]">
            Overall Score:
          </span>
          <span className={cn("text-lg font-semibold", consistencyColor(overallScore))}>
            {formatPercent(overallScore)}
          </span>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No pairwise data available.
        </p>
      )}

      {/* Matrix grid */}
      {!isEmpty && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs" data-testid="heatmap-table">
            <thead>
              <tr>
                {/* Empty top-left corner */}
                <th className="p-1" />
                {scene_labels.map((label) => (
                  <th
                    key={label}
                    className="p-1 text-center text-[var(--color-text-muted)] font-normal max-w-[80px] truncate"
                  >
                    <Tooltip content={label}>
                      <span className="truncate">{label}</span>
                    </Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIdx) => (
                <tr key={scene_labels[rowIdx]}>
                  <td className="p-1 pr-2 text-right text-[var(--color-text-muted)] font-normal max-w-[80px] truncate">
                    <Tooltip content={scene_labels[rowIdx] ?? ""}>
                      <span className="truncate">{scene_labels[rowIdx]}</span>
                    </Tooltip>
                  </td>
                  {row.map((score, colIdx) => (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      data-testid={`cell-${rowIdx}-${colIdx}`}
                      className={cn(
                        "p-1 text-center w-10 h-10 rounded-[var(--radius-sm)]",
                        rowIdx === colIdx
                          ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]"
                          : consistencyCellBg(score),
                      )}
                    >
                      <Tooltip content={`${scene_labels[rowIdx]} vs ${scene_labels[colIdx]}: ${formatPercent(score)}`}>
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            rowIdx === colIdx
                              ? "text-[var(--color-text-muted)]"
                              : consistencyColor(score),
                          )}
                        >
                          {Math.round(score * 100)}
                        </span>
                      </Tooltip>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
