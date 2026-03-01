/**
 * Confirmation modal shown after dropping a file to import characters.
 *
 * Displays a scrollable, checkable list of parsed names with options
 * to assign a group and apply title-case formatting.
 */

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Select, Toggle } from "@/components/primitives";
import { toSelectOptions } from "@/lib/select-utils";

import { useCharacterGroups } from "../hooks/use-character-groups";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImportConfirmModalProps {
  open: boolean;
  onClose: () => void;
  names: string[];
  projectId: number;
  onConfirm: (names: string[], groupId?: number) => void;
  loading?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Convert `carli_nicki` or `carli-nicki` to `Carli Nicki`. */
function toTitleCase(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportConfirmModal({
  open,
  onClose,
  names,
  projectId,
  onConfirm,
  loading,
}: ImportConfirmModalProps) {
  const { data: groups } = useCharacterGroups(projectId);

  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(names.map((_, i) => i)),
  );
  const [titleCase, setTitleCase] = useState(false);
  const [groupId, setGroupId] = useState("");

  // Reset checked set when names change
  useEffect(() => {
    setChecked(new Set(names.map((_, i) => i)));
  }, [names]);

  const groupOptions = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  const displayNames = useMemo(
    () => (titleCase ? names.map(toTitleCase) : names),
    [names, titleCase],
  );

  const selectedCount = checked.size;

  function toggleItem(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === names.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(names.map((_, i) => i)));
    }
  }

  function handleConfirm() {
    const selected = displayNames.filter((_, i) => checked.has(i));
    onConfirm(selected, groupId ? Number(groupId) : undefined);
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Characters" size="lg">
      <Stack gap={4}>
        {/* Options bar */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
          <div className="w-[200px]">
            <Select
              label="Assign to group"
              options={groupOptions}
              value={groupId}
              onChange={setGroupId}
            />
          </div>
          <Toggle
            checked={titleCase}
            onChange={setTitleCase}
            label="Title Case names"
            size="sm"
          />
        </div>

        {/* Name list */}
        <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {/* Select all header */}
          <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]">
            <Checkbox
              checked={checked.size === names.length}
              indeterminate={checked.size > 0 && checked.size < names.length}
              onChange={toggleAll}
              label={`Select all (${names.length})`}
            />
          </div>

          {displayNames.map((name, idx) => (
            <div
              key={idx}
              className="px-[var(--spacing-3)] py-[var(--spacing-1)] hover:bg-[var(--color-surface-secondary)]"
            >
              <Checkbox
                checked={checked.has(idx)}
                onChange={() => toggleItem(idx)}
                label={name}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">
            {selectedCount} of {names.length} selected
          </span>
          <div className="flex gap-[var(--spacing-2)]">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              loading={loading}
            >
              Import {selectedCount} {selectedCount === 1 ? "Character" : "Characters"}
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
