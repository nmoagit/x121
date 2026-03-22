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
  onSave: (input: { speech_type_id: number; text: string; language_id?: number }) => void;
  saving: boolean;
  /** Available languages for the language selector. */
  languages?: { id: number; code: string; name: string }[];
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
  languages,
}: AddSpeechModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedLanguageId, setSelectedLanguageId] = useState("1");
  const [newTypeName, setNewTypeName] = useState("");
  const [text, setText] = useState("");

  function handleClose() {
    setSelectedTypeId("");
    setSelectedLanguageId("1");
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
    const langId = Number(selectedLanguageId);
    onSave({
      speech_type_id: typeId,
      text: text.trim(),
      language_id: langId > 0 ? langId : undefined,
    });
    handleClose();
  }

  const languageOptions = (languages ?? []).map((l) => ({
    value: String(l.id),
    label: `${l.name} (${l.code})`,
  }));

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

        {languageOptions.length > 0 && (
          <Select
            label="Language"
            options={languageOptions}
            value={selectedLanguageId}
            onChange={setSelectedLanguageId}
          />
        )}

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
          <span className="text-xs font-mono text-[var(--color-text-secondary)]">
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

        <div className="flex gap-2 justify-end pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
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
