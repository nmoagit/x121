/**
 * Editable list of pipeline seed slots.
 *
 * Each slot has a name, required flag, and description. Users can add,
 * remove, and reorder slots.
 */

import { Button, Checkbox, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Plus, Trash2 } from "@/tokens/icons";
import { ICON_ACTION_BTN_DANGER, TERMINAL_DIVIDER, TERMINAL_LABEL } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import type { SeedSlot } from "../types";

interface SeedSlotEditorProps {
  slots: SeedSlot[];
  onChange: (slots: SeedSlot[]) => void;
}

export function SeedSlotEditor({ slots, onChange }: SeedSlotEditorProps) {
  function handleAdd() {
    onChange([...slots, { name: "", required: false, description: "" }]);
  }

  function handleRemove(index: number) {
    onChange(slots.filter((_, i) => i !== index));
  }

  function handleUpdate(index: number, patch: Partial<SeedSlot>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <Stack gap={3}>
      <div className="flex items-center justify-between">
        <span className={TERMINAL_LABEL}>Seed Slots</span>
        <Button size="xs" variant="secondary" icon={<Plus size={12} />} onClick={handleAdd}>
          Add Slot
        </Button>
      </div>

      {slots.length === 0 && (
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          No seed slots defined. Add slots to define what images are required per character.
        </p>
      )}

      {slots.map((slot, index) => (
        <div
          key={`slot-${index}`}
          className={cn("flex items-start gap-3 pb-3", index < slots.length - 1 && TERMINAL_DIVIDER)}
        >
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <Input
                label="Name"
                placeholder="e.g. clothed"
                value={slot.name}
                onChange={(e) => handleUpdate(index, { name: e.target.value })}
                className="flex-1"
              />
              <Checkbox
                checked={slot.required}
                onChange={(checked) => handleUpdate(index, { required: checked })}
                label="Required"
              />
            </div>
            <Input
              label="Description"
              placeholder="Describe this seed slot..."
              value={slot.description}
              onChange={(e) => handleUpdate(index, { description: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className={cn("mt-6", ICON_ACTION_BTN_DANGER)}
            title="Remove slot"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </Stack>
  );
}
