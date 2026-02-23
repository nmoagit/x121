/**
 * Shared preview table showing old -> new value diffs (PRD-18).
 *
 * Used by both FindReplacePanel and RePathPanel to display
 * fields that will be affected by an operation.
 */

import type { FieldInfo } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface PreviewTableProps {
  /** Fields that will be affected. */
  fields: FieldInfo[];
  /** Old value pattern (search term or old prefix). */
  oldValue: string;
  /** New value pattern (replacement or new prefix). */
  newValue: string;
  /** Whether to highlight broken references. */
  highlightBroken?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PreviewTable({
  fields,
  oldValue,
  newValue,
  highlightBroken = false,
}: PreviewTableProps) {
  if (fields.length === 0) {
    return (
      <p
        data-testid="no-preview-matches"
        className="text-sm text-[var(--color-text-secondary)]"
      >
        No matching fields found.
      </p>
    );
  }

  return (
    <div data-testid="preview-table" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[var(--color-text-secondary)]">
            <th className="pb-2 pr-4">Entity Type</th>
            <th className="pb-2 pr-4">Table</th>
            <th className="pb-2 pr-4">Column</th>
            <th className="pb-2 pr-4">Old Value</th>
            <th className="pb-2">New Value</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, idx) => (
            <tr
              key={`${field.table_name}-${field.column_name}`}
              data-testid={`preview-row-${idx}`}
              className={`border-b ${
                highlightBroken ? "bg-red-50" : ""
              }`}
            >
              <td className="py-2 pr-4">{field.entity_type}</td>
              <td className="py-2 pr-4 font-mono text-xs">
                {field.table_name}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {field.column_name}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-red-600">
                {oldValue}
              </td>
              <td className="py-2 font-mono text-xs text-green-600">
                {newValue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
