/**
 * Per-character deliverables matrix for the Project Overview tab.
 *
 * Shows readiness status, image/scene counts, metadata status, and blocking
 * reasons per character. Row click navigates to the character detail page.
 *
 * By default, hides characters at 100% readiness. A "Show Complete" toggle
 * reveals them.
 */

import { useState, useMemo } from "react";
import { Badge, Spinner } from "@/components/primitives";
import { useNavigate } from "@tanstack/react-router";
import { useCharacterDeliverables } from "../hooks/use-character-deliverables";
import type { CharacterDeliverableRow } from "../types";

function readinessBadgeVariant(pct: number): "success" | "warning" | "danger" | "default" {
  if (pct >= 100) return "success";
  if (pct >= 50) return "warning";
  if (pct > 0) return "danger";
  return "default";
}

interface RowProps {
  row: CharacterDeliverableRow;
  onClick: () => void;
}

function DeliverableRow({ row, onClick }: RowProps) {
  return (
    <tr
      className="cursor-pointer border-b border-[var(--color-border-default)]
        hover:bg-[var(--color-surface-secondary)] transition-colors"
      onClick={onClick}
    >
      <td className="px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
        {row.name}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {row.images_approved}/{row.images_count}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {row.scenes_approved}/{row.scenes_with_video}/{row.scenes_total}
      </td>
      <td className="px-3 py-2 text-sm">
        <Badge variant={row.has_active_metadata ? "success" : "default"} size="sm">
          {row.has_active_metadata ? "Yes" : "No"}
        </Badge>
      </td>
      <td className="px-3 py-2">
        {row.blocking_reasons.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.blocking_reasons.map((reason) => (
              <Badge key={reason} variant="danger" size="sm">{reason}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">&mdash;</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Badge variant={readinessBadgeVariant(row.readiness_pct)} size="sm">
          {row.readiness_pct.toFixed(1)}%
        </Badge>
      </td>
    </tr>
  );
}

interface CharacterDeliverablesGridProps {
  projectId: number;
}

export function CharacterDeliverablesGrid({ projectId }: CharacterDeliverablesGridProps) {
  const { data: rows, isLoading } = useCharacterDeliverables(projectId);
  const navigate = useNavigate();
  const [showComplete, setShowComplete] = useState(false);

  const { filtered, completeCount } = useMemo(() => {
    if (!rows) return { filtered: [], completeCount: 0 };
    const complete = rows.filter((r) => r.readiness_pct >= 100 && r.blocking_reasons.length === 0);
    const incomplete = rows.filter((r) => r.readiness_pct < 100 || r.blocking_reasons.length > 0);
    return {
      filtered: showComplete ? rows : incomplete,
      completeCount: complete.length,
    };
  }, [rows, showComplete]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No characters in this project.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--color-text-muted)]">
          {filtered.length} of {rows.length} characters
        </span>
        {completeCount > 0 && (
          <button
            type="button"
            className="text-xs text-[var(--color-text-link)] hover:underline"
            onClick={() => setShowComplete((prev) => !prev)}
          >
            {showComplete ? "Hide Complete" : `Show Complete (${completeCount})`}
          </button>
        )}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="px-3 py-2">Character</th>
            <th className="px-3 py-2">Images</th>
            <th className="px-3 py-2" title="Approved / With Video / Total">Scenes</th>
            <th className="px-3 py-2">Metadata</th>
            <th className="px-3 py-2">Blocking</th>
            <th className="px-3 py-2 text-right">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <DeliverableRow
              key={row.id}
              row={row}
              onClick={() =>
                navigate({
                  to: "/projects/$projectId/characters/$characterId",
                  params: { projectId: String(projectId), characterId: String(row.id) },
                  search: { tab: undefined, scene: undefined },
                })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
