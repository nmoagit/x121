/**
 * Import dialog for importing a library character into a project (PRD-60).
 *
 * Allows users to select which metadata fields remain linked to the
 * library character vs. being independently editable copies.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, Checkbox, Modal } from "@/components";
import { cn } from "@/lib/cn";

import { useImportToProject } from "./hooks/use-library";
import type { LibraryCharacter } from "./types";
import { NON_LINKABLE_FIELDS } from "./types";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  character: LibraryCharacter;
  projectId: number;
  projectName?: string;
}

export function ImportDialog({
  open,
  onClose,
  character,
  projectId,
  projectName,
}: ImportDialogProps) {
  const importMutation = useImportToProject();

  // Derive linkable fields from the character's master_metadata keys.
  const linkableFields = useMemo(() => {
    const keys = Object.keys(character.master_metadata);
    return keys.filter(
      (key) => !NON_LINKABLE_FIELDS.includes(key as (typeof NON_LINKABLE_FIELDS)[number]),
    );
  }, [character.master_metadata]);

  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => new Set(linkableFields),
  );

  const toggleField = useCallback((field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedFields((prev) => {
      if (prev.size === linkableFields.length) {
        return new Set();
      }
      return new Set(linkableFields);
    });
  }, [linkableFields]);

  const handleImport = useCallback(() => {
    importMutation.mutate(
      {
        libraryId: character.id,
        project_id: projectId,
        linked_fields: Array.from(selectedFields),
      },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }, [importMutation, character.id, projectId, selectedFields, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import "${character.name}"`}
      size="md"
    >
      <div data-testid="import-dialog">
        {/* Target project info */}
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Import into{" "}
          <span className="font-medium text-[var(--color-text-primary)]">
            {projectName ?? `Project #${projectId}`}
          </span>
        </p>

        {/* Linked fields selection */}
        {linkableFields.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
                Linked Fields
              </h4>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-[var(--color-action-primary)] hover:underline"
                data-testid="toggle-all-fields"
              >
                {selectedFields.size === linkableFields.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Linked fields stay in sync with the library character. Unlinked
              fields become independent copies.
            </p>
            <div
              className={cn(
                "max-h-48 overflow-y-auto space-y-1 mb-4",
                "border border-[var(--color-border-default)]",
                "rounded-[var(--radius-md)] p-2",
              )}
              data-testid="field-list"
            >
              {linkableFields.map((field) => (
                <label
                  key={field}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded-[var(--radius-sm)]",
                    "hover:bg-[var(--color-surface-tertiary)] cursor-pointer",
                  )}
                >
                  <Checkbox
                    checked={selectedFields.has(field)}
                    onChange={() => toggleField(field)}
                  />
                  <span className="text-sm text-[var(--color-text-primary)]">
                    {field}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            No linkable metadata fields found. The character will be imported as
            a standalone copy.
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="cancel-import">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={importMutation.isPending}
            data-testid="confirm-import"
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </Button>
        </div>

        {/* Error display */}
        {importMutation.isError && (
          <p className="text-xs text-[var(--color-status-error)] mt-2">
            {importMutation.error?.message ?? "Import failed. Please try again."}
          </p>
        )}
      </div>
    </Modal>
  );
}
