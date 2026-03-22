/**
 * Spreadsheet-style metadata editor for all avatars in a project (PRD-66).
 *
 * Uses a simple HTML table with inline editing via input elements.
 * Supports sorting by column, keyboard navigation, and completeness display.
 */

import { useCallback, useMemo, useState } from "react";

import { WireframeLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
} from "@/lib/ui-classes";

import { CompletenessBar } from "./CompletenessBar";
import {
  useProjectMetadata,
  useUpdateAvatarMetadata,
} from "./hooks/use-metadata-editor";
import type { AvatarMetadataResponse } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

type SortDirection = "asc" | "desc";

interface SortConfig {
  column: string;
  direction: SortDirection;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MetadataSpreadsheetProps {
  projectId: number;
  onSelectAvatar?: (avatarId: number) => void;
  selectedAvatarIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

export function MetadataSpreadsheet({
  projectId,
  onSelectAvatar,
  selectedAvatarIds = [],
  onSelectionChange,
}: MetadataSpreadsheetProps) {
  const { data, isLoading } = useProjectMetadata(projectId);
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [filter, setFilter] = useState("");

  // Extract column definitions from first avatar.
  const columns = useMemo(() => {
    const first = data?.[0];
    if (!first) return [];
    return first.fields.map((f) => ({
      name: f.name,
      label: f.label,
    }));
  }, [data]);

  // Apply sorting and filtering.
  const sortedData = useMemo(() => {
    if (!data) return [];

    let filtered = data;
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filtered = data.filter(
        (c) =>
          c.avatar_name.toLowerCase().includes(lowerFilter) ||
          c.fields.some((f) => {
            const val = f.value;
            return typeof val === "string" && val.toLowerCase().includes(lowerFilter);
          }),
      );
    }

    if (!sort) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = getFieldValue(a, sort.column);
      const bVal = getFieldValue(b, sort.column);
      const comparison = String(aVal ?? "").localeCompare(String(bVal ?? ""));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sort, filter]);

  const handleSort = useCallback(
    (column: string) => {
      setSort((prev) => {
        if (prev?.column === column) {
          return prev.direction === "asc"
            ? { column, direction: "desc" }
            : null;
        }
        return { column, direction: "asc" };
      });
    },
    [],
  );

  const toggleSelection = useCallback(
    (avatarId: number) => {
      if (!onSelectionChange) return;
      const next = selectedAvatarIds.includes(avatarId)
        ? selectedAvatarIds.filter((id) => id !== avatarId)
        : [...selectedAvatarIds, avatarId];
      onSelectionChange(next);
    },
    [selectedAvatarIds, onSelectionChange],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <WireframeLoader size={64} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-sm text-[var(--color-text-muted)]">
        No avatars in this project.
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter avatars..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[#0d1117] px-3 py-1.5 font-mono text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
        />
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {sortedData.length} avatar{sortedData.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className={TERMINAL_PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className={`${TERMINAL_DIVIDER} ${TERMINAL_HEADER}`}>
                {onSelectionChange && (
                  <th className="w-8 px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={
                        sortedData.length > 0 &&
                        sortedData.every((c) => selectedAvatarIds.includes(c.avatar_id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange(sortedData.map((c) => c.avatar_id));
                        } else {
                          onSelectionChange([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th
                  className={`${TERMINAL_TH} cursor-pointer px-4 py-2.5 hover:text-[var(--color-text-primary)]`}
                  onClick={() => handleSort("name")}
                >
                  Name {sortIndicator(sort, "name")}
                </th>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className={`${TERMINAL_TH} cursor-pointer px-4 py-2.5 hover:text-[var(--color-text-primary)]`}
                    onClick={() => handleSort(col.name)}
                  >
                    {col.label} {sortIndicator(sort, col.name)}
                  </th>
                ))}
                <th className={`${TERMINAL_TH} px-4 py-2.5`}>
                  Completeness
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((avatar) => (
                <SpreadsheetRow
                  key={avatar.avatar_id}
                  avatar={avatar}
                  columns={columns}
                  selected={selectedAvatarIds.includes(avatar.avatar_id)}
                  onToggleSelect={onSelectionChange ? () => toggleSelection(avatar.avatar_id) : undefined}
                  onClickName={onSelectAvatar ? () => onSelectAvatar(avatar.avatar_id) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Row sub-component (with inline editing)
   -------------------------------------------------------------------------- */

function SpreadsheetRow({
  avatar,
  columns,
  selected,
  onToggleSelect,
  onClickName,
}: {
  avatar: AvatarMetadataResponse;
  columns: { name: string; label: string }[];
  selected: boolean;
  onToggleSelect?: () => void;
  onClickName?: () => void;
}) {
  const updateMutation = useUpdateAvatarMetadata(avatar.avatar_id);

  const handleCellBlur = useCallback(
    (fieldName: string, value: string, originalValue: unknown) => {
      if (value === String(originalValue ?? "")) return;
      updateMutation.mutate({ [fieldName]: value || null });
    },
    [updateMutation],
  );

  return (
    <tr className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}>
      {onToggleSelect && (
        <td className="w-8 px-2 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
          />
        </td>
      )}
      <td className="px-4 py-2">
        {onClickName ? (
          <button
            type="button"
            onClick={onClickName}
            className="font-medium text-[var(--color-text-primary)] underline decoration-dotted hover:text-[var(--color-text-link)]"
          >
            {avatar.avatar_name}
          </button>
        ) : (
          <span className="font-medium text-[var(--color-text-primary)]">
            {avatar.avatar_name}
          </span>
        )}
      </td>
      {columns.map((col) => {
        const field = avatar.fields.find((f) => f.name === col.name);
        const value = field?.value;
        const displayValue = formatCellValue(value);

        return (
          <td key={col.name} className="px-4 py-2">
            <input
              type="text"
              defaultValue={displayValue}
              onBlur={(e) => handleCellBlur(col.name, e.target.value, displayValue)}
              className="w-full border-0 bg-transparent px-0 font-mono text-xs text-cyan-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] focus:rounded-[var(--radius-sm)] focus:px-1"
            />
          </td>
        );
      })}
      <td className="px-4 py-2">
        <div className="min-w-[120px]">
          <CompletenessBar completeness={avatar.completeness} />
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getFieldValue(
  avatar: AvatarMetadataResponse,
  column: string,
): unknown {
  if (column === "name") return avatar.avatar_name;
  const field = avatar.fields.find((f) => f.name === column);
  return field?.value ?? null;
}

function formatCellValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

function sortIndicator(sort: SortConfig | null, column: string): string {
  if (!sort || sort.column !== column) return "";
  return sort.direction === "asc" ? " ^" : " v";
}
