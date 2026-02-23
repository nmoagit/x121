/**
 * Import preview showing entities to be created/updated/skipped (PRD-86).
 */

import type { InferredEntity } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ACTION_LABELS: Record<string, string> = {
  character: "Character",
  scene: "Scene",
  image: "Image",
  metadata: "Metadata",
  video: "Video",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface ImportPreviewProps {
  /** List of inferred entities from scanning. */
  entities: InferredEntity[];
  /** Called when the user confirms the import. */
  onConfirm?: () => void;
  /** Called when the user cancels. */
  onCancel?: () => void;
  /** Whether buttons are disabled. */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportPreview({
  entities,
  onConfirm,
  onCancel,
  disabled = false,
}: ImportPreviewProps) {
  const groupedByType: Record<string, InferredEntity[]> = {};
  for (const entity of entities) {
    const type = entity.entity_type;
    if (!groupedByType[type]) {
      groupedByType[type] = [];
    }
    groupedByType[type].push(entity);
  }

  return (
    <div data-testid="import-preview" className="space-y-4">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Import Preview
      </h3>

      {entities.length === 0 ? (
        <p
          data-testid="no-entities"
          className="text-sm text-[var(--color-text-secondary)]"
        >
          No entities detected. Check your source path and mapping rules.
        </p>
      ) : (
        <>
          <div
            data-testid="preview-summary"
            className="flex gap-4 text-sm text-[var(--color-text-secondary)]"
          >
            <span>Total: {entities.length}</span>
            {Object.entries(groupedByType).map(([type, items]) => (
              <span key={type}>
                {ACTION_LABELS[type] ?? type}: {items.length}
              </span>
            ))}
          </div>

          <table className="w-full text-sm" data-testid="preview-table">
            <thead>
              <tr className="border-b text-left text-[var(--color-text-secondary)]">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2">Source Path</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity, idx) => (
                <tr
                  key={idx}
                  data-testid={`preview-row-${idx}`}
                  className="border-b"
                >
                  <td className="py-2 pr-4 font-medium">
                    {entity.inferred_name}
                  </td>
                  <td className="py-2 pr-4">
                    {ACTION_LABELS[entity.entity_type] ?? entity.entity_type}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {entity.source_path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="flex gap-3">
        <button
          data-testid="confirm-import-btn"
          onClick={onConfirm}
          disabled={disabled || entities.length === 0}
          className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          type="button"
        >
          Confirm Import
        </button>
        <button
          data-testid="cancel-import-btn"
          onClick={onCancel}
          disabled={disabled}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
