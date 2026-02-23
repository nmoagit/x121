/**
 * Step 4: Metadata Entry — bulk metadata editing (PRD-67).
 *
 * Provides a spreadsheet-style view for entering metadata for all
 * characters in the batch. Reuses the pattern from PRD-66.
 */

import { Badge, Button } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MetadataEntry {
  character_id: number;
  name: string;
  description: string;
}

interface StepMetadataProps {
  /** Current step data from the session. */
  stepData: Record<string, unknown>;
  /** Character IDs from the session. */
  characterIds: number[];
  /** Callback to update step data. */
  onUpdateStepData: (data: Record<string, unknown>) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepMetadata({
  stepData,
  characterIds,
  onUpdateStepData,
}: StepMetadataProps) {
  const metadata = (stepData.metadata as MetadataEntry[] | undefined) ?? [];

  const isComplete = metadata.length >= characterIds.length;

  function handleInitialize() {
    const entries: MetadataEntry[] = characterIds.map((id) => ({
      character_id: id,
      name: `Character ${id}`,
      description: "",
    }));
    onUpdateStepData({
      ...stepData,
      metadata: entries,
    });
  }

  function handleUpdateEntry(index: number, field: keyof MetadataEntry, value: string) {
    const updated = metadata.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    );
    onUpdateStepData({ ...stepData, metadata: updated });
  }

  return (
    <div data-testid="step-metadata" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Metadata Entry
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Enter metadata for each character. Fill common fields first, then
        customize per character.
      </p>

      {metadata.length === 0 && (
        <Button
          data-testid="initialize-metadata-btn"
          variant="primary"
          size="sm"
          onClick={handleInitialize}
        >
          Initialize Metadata for {characterIds.length} Characters
        </Button>
      )}

      {/* Metadata table */}
      {metadata.length > 0 && (
        <div
          data-testid="metadata-table"
          className="overflow-x-auto rounded border border-[var(--color-border-subtle)]"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-tertiary)]">
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">
                  Character
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">
                  Name
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {metadata.map((entry, i) => (
                <tr
                  key={entry.character_id}
                  data-testid={`metadata-row-${entry.character_id}`}
                  className="border-t border-[var(--color-border-subtle)]"
                >
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">
                    #{entry.character_id}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      data-testid={`metadata-name-${entry.character_id}`}
                      className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
                      value={entry.name}
                      onChange={(e) =>
                        handleUpdateEntry(i, "name", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      data-testid={`metadata-desc-${entry.character_id}`}
                      className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
                      value={entry.description}
                      onChange={(e) =>
                        handleUpdateEntry(i, "description", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status */}
      <div data-testid="metadata-status">
        {isComplete ? (
          <Badge variant="success" size="sm">
            Metadata entered for all characters
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            Enter metadata for all characters to continue
          </Badge>
        )}
      </div>
    </div>
  );
}
