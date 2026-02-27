/**
 * Import preview table component (PRD-113).
 *
 * Dense, scannable table showing all detected characters with inline editing,
 * include/exclude toggles, and status badges.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { ChevronDown, ChevronRight } from "@/tokens/icons";
import { NameParserPreview } from "./NameParserPreview";
import { METADATA_STATUS_VARIANT, VALIDATION_STATUS_VARIANT } from "./types";
import type { CharacterIngestEntry, IngestEntryUpdate, NameConfidence } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ImportPreviewTableProps {
  entries: CharacterIngestEntry[];
  onUpdateEntry: (entryId: number, updates: Partial<IngestEntryUpdate>) => void;
  onToggleInclude: (entryId: number) => void;
}

export function ImportPreviewTable({
  entries,
  onUpdateEntry,
  onToggleInclude,
}: ImportPreviewTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const readyCount = entries.filter(
    (e) => e.is_included && e.validation_status === "pass",
  ).length;
  const needAttention = entries.filter(
    (e) =>
      e.is_included &&
      (e.validation_status === "fail" || e.validation_status === "warning"),
  ).length;
  const excludedCount = entries.filter((e) => !e.is_included).length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{readyCount}</strong> ready
        </span>
        <span>
          <strong className="text-foreground">{needAttention}</strong> need
          attention
        </span>
        <span>
          <strong className="text-foreground">{excludedCount}</strong> excluded
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Metadata</th>
              <th className="px-3 py-2 text-left font-medium">Validation</th>
              <th className="w-20 px-3 py-2 text-center font-medium">Include</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === entry.id ? null : entry.id)
                }
                onUpdateEntry={onUpdateEntry}
                onToggleInclude={onToggleInclude}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row component
   -------------------------------------------------------------------------- */

function EntryRow({
  entry,
  isExpanded,
  onToggleExpand,
  onUpdateEntry,
  onToggleInclude,
}: {
  entry: CharacterIngestEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateEntry: (entryId: number, updates: Partial<IngestEntryUpdate>) => void;
  onToggleInclude: (entryId: number) => void;
}) {
  const displayName = entry.confirmed_name ?? entry.parsed_name;
  const confidence = (entry.name_confidence ?? "medium") as NameConfidence;
  const metadataStatus = entry.metadata_status ?? "none";
  const validationStatus = entry.validation_status ?? "pending";

  const hasIssues =
    (entry.validation_errors as unknown[]).length > 0 ||
    (entry.validation_warnings as unknown[]).length > 0;

  return (
    <>
      <tr
        className={`border-b transition-colors hover:bg-muted/30 ${
          !entry.is_included ? "opacity-50" : ""
        }`}
      >
        {/* Expand toggle */}
        <td className="px-3 py-2">
          {hasIssues && (
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={onToggleExpand}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
        </td>

        {/* Name */}
        <td className="px-3 py-2">
          <NameParserPreview
            original={entry.folder_name ?? entry.parsed_name}
            parsed={displayName}
            confidence={confidence}
            onEdit={(newName) =>
              onUpdateEntry(entry.id, { confirmed_name: newName })
            }
          />
        </td>

        {/* Metadata status */}
        <td className="px-3 py-2">
          <Badge variant={METADATA_STATUS_VARIANT[metadataStatus] ?? "default"}>
            {metadataStatus}
          </Badge>
        </td>

        {/* Validation status */}
        <td className="px-3 py-2">
          <Badge
            variant={VALIDATION_STATUS_VARIANT[validationStatus] ?? "default"}
          >
            {validationStatus}
          </Badge>
        </td>

        {/* Include toggle */}
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={entry.is_included}
            onChange={() => onToggleInclude(entry.id)}
            className="h-4 w-4 rounded border-input"
          />
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && hasIssues && (
        <tr className="border-b bg-muted/20">
          <td />
          <td colSpan={4} className="px-3 py-2">
            <div className="space-y-1 text-xs">
              {(entry.validation_errors as Array<{ field?: string; message?: string }>).map(
                (err, i) => (
                  <div key={i} className="text-destructive">
                    {err.field ? `${err.field}: ` : ""}
                    {err.message ?? "Validation error"}
                  </div>
                ),
              )}
              {(entry.validation_warnings as Array<{ field?: string; message?: string }>).map(
                (warn, i) => (
                  <div key={i} className="text-yellow-600">
                    {warn.field ? `${warn.field}: ` : ""}
                    {warn.message ?? "Warning"}
                  </div>
                ),
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
