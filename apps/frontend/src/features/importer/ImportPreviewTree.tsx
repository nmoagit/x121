/**
 * Tree view showing the import folder structure with entity mapping
 * annotations, selection checkboxes, and color-coded actions (PRD-016).
 */

import { useCallback, useState } from "react";

import { Badge, Checkbox } from "@/components/primitives";
import { Stack } from "@/components/layout";
import type { ImportMappingEntry, FolderImportPreview } from "./types";
import { ACTION_LABELS, ACTION_VARIANTS, entityTypeLabel } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImportPreviewTreeProps {
  preview: FolderImportPreview;
  onSelectionChange: (deselectedIds: number[]) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportPreviewTree({
  preview,
  onSelectionChange,
}: ImportPreviewTreeProps) {
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const toggleEntry = useCallback(
    (entryId: number) => {
      setDeselected((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else {
          next.add(entryId);
        }
        onSelectionChange(Array.from(next));
        return next;
      });
    },
    [onSelectionChange],
  );

  return (
    <div className="space-y-1" data-testid="import-preview-tree">
      {/* Summary header */}
      <div className="flex gap-4 rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] p-3 text-sm">
        <span>
          <strong>{preview.total_files}</strong> files
        </span>
        <span>
          <strong>{preview.entities_to_create}</strong> to create
        </span>
        <span>
          <strong>{preview.entities_to_update}</strong> to update
        </span>
        {preview.uniqueness_conflicts.length > 0 && (
          <span className="text-[var(--color-text-warning)]">
            <strong>{preview.uniqueness_conflicts.length}</strong> conflicts
          </span>
        )}
      </div>

      {/* Entry list */}
      <ul className="divide-y divide-[var(--color-border-default)]" role="list">
        {preview.entries.map((entry) => (
          <ImportEntryRow
            key={entry.id}
            entry={entry}
            isSelected={!deselected.has(entry.id)}
            onToggle={() => toggleEntry(entry.id)}
          />
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Entry row sub-component
   -------------------------------------------------------------------------- */

interface ImportEntryRowProps {
  entry: ImportMappingEntry;
  isSelected: boolean;
  onToggle: () => void;
}

function ImportEntryRow({ entry, isSelected, onToggle }: ImportEntryRowProps) {
  const actionVariant = ACTION_VARIANTS[entry.action] ?? "default";

  return (
    <li className="flex items-center gap-3 px-2 py-2">
      <Checkbox checked={isSelected} onChange={onToggle} />

      <Stack direction="horizontal" align="center" gap={2} className="flex-1 min-w-0">
        <Badge size="sm" variant={actionVariant as "success" | "info" | "warning" | "default"}>
          {ACTION_LABELS[entry.action] ?? entry.action}
        </Badge>

        <Badge size="sm" variant="info">
          {entityTypeLabel(entry.derived_entity_type)}
        </Badge>

        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {entry.derived_entity_name}
        </span>

        {entry.derived_category && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            / {entry.derived_category}
          </span>
        )}
      </Stack>

      <span
        className="text-xs text-[var(--color-text-secondary)] shrink-0"
        title={entry.source_path}
      >
        {entry.file_name}
      </span>

      {entry.validation_errors.length > 0 && (
        <span className="text-xs text-[var(--color-text-danger)]">
          {entry.validation_errors.length} error(s)
        </span>
      )}
    </li>
  );
}
