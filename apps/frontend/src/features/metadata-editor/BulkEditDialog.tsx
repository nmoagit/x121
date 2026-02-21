/**
 * Bulk edit dialog for updating a field across multiple characters (PRD-66).
 *
 * Shows a field selector, value input, confirmation count, and apply/cancel actions.
 */

import { useCallback, useMemo, useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { Button, Input, Select } from "@/components/primitives";
import { Stack } from "@/components/layout";

import type { MetadataFieldDef } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface BulkEditDialogProps {
  /** IDs of characters to edit. */
  selectedCharacterIds: number[];
  /** Available field definitions (from any character's metadata response). */
  fieldDefs: MetadataFieldDef[];
  /** Callback to apply the edit. Returns a promise so we can show loading. */
  onApply: (field: string, value: unknown) => Promise<void>;
  /** Close the dialog. */
  onClose: () => void;
}

export function BulkEditDialog({
  selectedCharacterIds,
  fieldDefs,
  onApply,
  onClose,
}: BulkEditDialogProps) {
  const [selectedField, setSelectedField] = useState("");
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);

  const currentFieldDef = useMemo(
    () => fieldDefs.find((f) => f.name === selectedField),
    [fieldDefs, selectedField],
  );

  const fieldOptions = useMemo(
    () =>
      fieldDefs.map((f) => ({
        value: f.name,
        label: f.label,
      })),
    [fieldDefs],
  );

  const handleApply = useCallback(async () => {
    if (!selectedField) return;
    setApplying(true);
    try {
      // Convert to appropriate type.
      let typedValue: unknown = value;
      if (currentFieldDef?.field_type === "number") {
        typedValue = value === "" ? null : Number(value);
      } else if (value === "") {
        typedValue = null;
      }
      await onApply(selectedField, typedValue);
      onClose();
    } catch {
      // Error handling via parent.
    } finally {
      setApplying(false);
    }
  }, [selectedField, value, currentFieldDef, onApply, onClose]);

  return (
    <Modal open onClose={onClose} title="Bulk Edit" size="md">
      <Stack gap={4}>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Update a single field across{" "}
          <span className="font-semibold">{selectedCharacterIds.length}</span>{" "}
          selected character{selectedCharacterIds.length !== 1 ? "s" : ""}.
        </p>

        <Select
          label="Field"
          value={selectedField}
          onChange={setSelectedField}
          options={[{ value: "", label: "-- Select field --" }, ...fieldOptions]}
        />

        {currentFieldDef && currentFieldDef.field_type === "select" && currentFieldDef.options.length > 0 ? (
          <Select
            label="New Value"
            value={value}
            onChange={setValue}
            options={[
              { value: "", label: "-- Clear value --" },
              ...currentFieldDef.options.map((opt) => ({
                value: opt,
                label: opt,
              })),
            ]}
          />
        ) : (
          <Input
            label="New Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={currentFieldDef?.field_type === "number" ? "number" : "text"}
            placeholder={
              currentFieldDef?.field_type === "date" ? "YYYY-MM-DD" : undefined
            }
          />
        )}

        {selectedField && (
          <p className="text-xs text-[var(--color-text-muted)]">
            This will set <span className="font-medium">{currentFieldDef?.label ?? selectedField}</span>{" "}
            to{" "}
            <span className="font-medium">{value || "(empty)"}</span>{" "}
            for {selectedCharacterIds.length} character
            {selectedCharacterIds.length !== 1 ? "s" : ""}.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedField || applying}
            onClick={handleApply}
          >
            {applying ? "Applying..." : "Apply"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
