/**
 * Modal for creating a new speech entry (PRD-124).
 *
 * Allows selecting an existing speech type or creating a new one,
 * then entering the speech text.
 */

import { useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { TEXTAREA_BASE } from "@/lib/ui-classes";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AddSpeechModalProps {
  open: boolean;
  onClose: () => void;
  speechTypes: { id: number; name: string }[];
  onCreateType: (name: string) => Promise<unknown>;
  creatingType: boolean;
  onSave: (input: { speech_type_id: number; text: string }) => void;
  saving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AddSpeechModal({
  open,
  onClose,
  speechTypes,
  onCreateType,
  creatingType,
  onSave,
  saving,
}: AddSpeechModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [text, setText] = useState("");

  function handleClose() {
    setSelectedTypeId("");
    setNewTypeName("");
    setText("");
    onClose();
  }

  async function handleAddType() {
    if (!newTypeName.trim()) return;
    await onCreateType(newTypeName.trim());
    setNewTypeName("");
  }

  function handleSave() {
    const typeId = Number(selectedTypeId);
    if (!typeId || !text.trim()) return;
    onSave({ speech_type_id: typeId, text: text.trim() });
    handleClose();
  }

  const typeOptions = speechTypes.map((t) => ({
    value: String(t.id),
    label: t.name,
  }));

  return (
    <Modal open={open} onClose={handleClose} title="Add Speech" size="lg">
      <Stack gap={4}>
        <Select
          label="Speech Type"
          options={typeOptions}
          value={selectedTypeId}
          onChange={setSelectedTypeId}
          placeholder="Select a speech type"
        />

        <div className="flex items-end gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              label="Or create new type"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="e.g. greeting, farewell"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAddType}
            loading={creatingType}
            disabled={!newTypeName.trim()}
          >
            Add Type
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Speech Text
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Enter the speech text..."
            className={cn(TEXTAREA_BASE, "placeholder:text-[var(--color-text-muted)]")}
          />
        </div>

        <div className="flex gap-[var(--spacing-2)] justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!selectedTypeId || !text.trim()}
          >
            Save
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
