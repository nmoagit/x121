/**
 * Spreadsheet-style metadata editor for all characters in a project (PRD-66).
 *
 * Uses a simple HTML table with inline editing via input elements.
 * Supports sorting by column, keyboard navigation, and completeness display.
 */

import { useCallback, useMemo, useState } from "react";

import { Card } from "@/components/composite/Card";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { CompletenessBar } from "./CompletenessBar";
import {
  useProjectMetadata,
  useUpdateCharacterMetadata,
} from "./hooks/use-metadata-editor";
import type { CharacterMetadataResponse } from "./types";

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
  onSelectCharacter?: (characterId: number) => void;
  selectedCharacterIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

export function MetadataSpreadsheet({
  projectId,
  onSelectCharacter,
  selectedCharacterIds = [],
  onSelectionChange,
}: MetadataSpreadsheetProps) {
  const { data, isLoading } = useProjectMetadata(projectId);
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [filter, setFilter] = useState("");

  // Extract column definitions from first character.
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
          c.character_name.toLowerCase().includes(lowerFilter) ||
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
    (characterId: number) => {
      if (!onSelectionChange) return;
      const next = selectedCharacterIds.includes(characterId)
        ? selectedCharacterIds.filter((id) => id !== characterId)
        : [...selectedCharacterIds, characterId];
      onSelectionChange(next);
    },
    [selectedCharacterIds, onSelectionChange],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-sm text-[var(--color-text-muted)]">
        No characters in this project.
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter characters..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-active)] focus:outline-none"
        />
        <span className="text-xs text-[var(--color-text-muted)]">
          {sortedData.length} character{sortedData.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                {onSelectionChange && (
                  <th className="w-8 px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={
                        sortedData.length > 0 &&
                        sortedData.every((c) => selectedCharacterIds.includes(c.character_id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange(sortedData.map((c) => c.character_id));
                        } else {
                          onSelectionChange([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th
                  className="cursor-pointer px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  onClick={() => handleSort("name")}
                >
                  Name {sortIndicator(sort, "name")}
                </th>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="cursor-pointer px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    onClick={() => handleSort(col.name)}
                  >
                    {col.label} {sortIndicator(sort, col.name)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
                  Completeness
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((character) => (
                <SpreadsheetRow
                  key={character.character_id}
                  character={character}
                  columns={columns}
                  selected={selectedCharacterIds.includes(character.character_id)}
                  onToggleSelect={onSelectionChange ? () => toggleSelection(character.character_id) : undefined}
                  onClickName={onSelectCharacter ? () => onSelectCharacter(character.character_id) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Row sub-component (with inline editing)
   -------------------------------------------------------------------------- */

function SpreadsheetRow({
  character,
  columns,
  selected,
  onToggleSelect,
  onClickName,
}: {
  character: CharacterMetadataResponse;
  columns: { name: string; label: string }[];
  selected: boolean;
  onToggleSelect?: () => void;
  onClickName?: () => void;
}) {
  const updateMutation = useUpdateCharacterMetadata(character.character_id);

  const handleCellBlur = useCallback(
    (fieldName: string, value: string, originalValue: unknown) => {
      if (value === String(originalValue ?? "")) return;
      updateMutation.mutate({ [fieldName]: value || null });
    },
    [updateMutation],
  );

  return (
    <tr className="border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]">
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
            {character.character_name}
          </button>
        ) : (
          <span className="font-medium text-[var(--color-text-primary)]">
            {character.character_name}
          </span>
        )}
      </td>
      {columns.map((col) => {
        const field = character.fields.find((f) => f.name === col.name);
        const value = field?.value;
        const displayValue = formatCellValue(value);

        return (
          <td key={col.name} className="px-4 py-2">
            <input
              type="text"
              defaultValue={displayValue}
              onBlur={(e) => handleCellBlur(col.name, e.target.value, displayValue)}
              className="w-full border-0 bg-transparent px-0 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)] focus:rounded-[var(--radius-sm)] focus:px-1"
            />
          </td>
        );
      })}
      <td className="px-4 py-2">
        <div className="min-w-[120px]">
          <CompletenessBar completeness={character.completeness} />
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getFieldValue(
  character: CharacterMetadataResponse,
  column: string,
): unknown {
  if (column === "name") return character.character_name;
  const field = character.fields.find((f) => f.name === column);
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
