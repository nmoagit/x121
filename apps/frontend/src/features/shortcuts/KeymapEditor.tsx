/**
 * Keymap editor panel for rebinding shortcuts (PRD-52).
 *
 * Lists all registered shortcuts grouped by category. Each row allows
 * clicking to capture a new key combo, with conflict detection.
 */

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Modal } from "@/components/composite/Modal";
import { cn } from "@/lib/cn";

import type { ShortcutBinding } from "./ShortcutRegistry";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  groupBindingsByCategory,
  shortcutRegistry,
} from "./ShortcutRegistry";
import { normalizeKeyCombo } from "./normalizeKeyCombo";
import { presets } from "./presets";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function KeyBadge({ combo }: { combo: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-mono",
        "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]",
        "border border-[var(--color-border-default)] rounded-[var(--radius-sm)]",
      )}
    >
      {combo}
    </kbd>
  );
}

/* --------------------------------------------------------------------------
   Capture modal
   -------------------------------------------------------------------------- */

interface CaptureModalProps {
  open: boolean;
  actionId: string;
  actionLabel: string;
  onCapture: (actionId: string, key: string) => void;
  onCancel: () => void;
}

function CaptureModal({ open, actionId, actionLabel, onCapture, onCancel }: CaptureModalProps) {
  const [capturedKey, setCapturedKey] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ShortcutBinding[]>([]);

  useEffect(() => {
    if (!open) {
      setCapturedKey(null);
      setConflicts([]);
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      const combo = normalizeKeyCombo(e);
      if (!combo) return;

      setCapturedKey(combo);
      const found = shortcutRegistry.getConflicts(combo).filter((b) => b.id !== actionId);
      setConflicts(found);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, actionId]);

  return (
    <Modal open={open} onClose={onCancel} title="Rebind Shortcut" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Press a new key combo for <strong>{actionLabel}</strong>
        </p>

        <div
          className={cn(
            "flex items-center justify-center h-16",
            "bg-[var(--color-surface-primary)] rounded-[var(--radius-md)]",
            "border border-dashed border-[var(--color-border-default)]",
          )}
        >
          {capturedKey ? (
            <KeyBadge combo={capturedKey} />
          ) : (
            <span className="text-sm text-[var(--color-text-muted)]">Press new key combo...</span>
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--color-action-warning)]/10">
            <p className="text-xs text-[var(--color-action-warning)] font-medium mb-1">
              Conflicts with:
            </p>
            {conflicts.map((c) => (
              <p key={c.id} className="text-xs text-[var(--color-text-secondary)]">
                {c.label} ({c.id})
              </p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!capturedKey}
            onClick={() => {
              if (capturedKey) onCapture(actionId, capturedKey);
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Main editor
   -------------------------------------------------------------------------- */

interface KeymapEditorProps {
  onSave?: () => void;
}

export function KeymapEditor({ onSave }: KeymapEditorProps) {
  const [, forceUpdate] = useState(0);
  const [captureTarget, setCaptureTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const allBindings = shortcutRegistry.getAllBindings();
  const customOverrides = shortcutRegistry.getCustomOverrides();
  const activePreset = shortcutRegistry.getActivePreset();

  // Group bindings by category.
  const grouped = groupBindingsByCategory(allBindings);

  const handleCapture = useCallback(
    (actionId: string, key: string) => {
      shortcutRegistry.setCustomBinding(actionId, key);
      setCaptureTarget(null);
      forceUpdate((n) => n + 1);
      onSave?.();
    },
    [onSave],
  );

  const handleResetOne = useCallback(
    (actionId: string) => {
      shortcutRegistry.removeCustomBinding(actionId);
      forceUpdate((n) => n + 1);
      onSave?.();
    },
    [onSave],
  );

  const handleResetAll = useCallback(() => {
    shortcutRegistry.setAllCustomOverrides({});
    forceUpdate((n) => n + 1);
    onSave?.();
  }, [onSave]);

  const handlePresetChange = useCallback(
    (preset: string) => {
      shortcutRegistry.setPreset(preset);
      forceUpdate((n) => n + 1);
      onSave?.();
    },
    [onSave],
  );

  return (
    <div className="space-y-6">
      {/* Preset selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="preset-select"
            className="text-sm font-medium text-[var(--color-text-primary)]"
          >
            Preset:
          </label>
          <select
            id="preset-select"
            value={activePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className={cn(
              "px-2 py-1 text-sm rounded-[var(--radius-md)]",
              "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]",
              "border border-[var(--color-border-default)]",
            )}
          >
            {Object.keys(presets).map((name) => (
              <option key={name} value={name}>
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <Button variant="secondary" size="sm" onClick={handleResetAll}>
          Reset All
        </Button>
      </div>

      {/* Shortcut list by category */}
      {CATEGORY_ORDER.map((category) => {
        const items = grouped.get(category);
        if (!items || items.length === 0) return null;

        return (
          <div key={category}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="space-y-1">
              {items.map((binding) => {
                const resolved = shortcutRegistry.getResolvedBinding(binding.id);
                const isCustom = binding.id in customOverrides;

                return (
                  <div
                    key={binding.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2",
                      "rounded-[var(--radius-md)]",
                      "hover:bg-[var(--color-surface-tertiary)]",
                      "transition-colors duration-[var(--duration-fast)]",
                    )}
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {binding.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {isCustom && (
                        <Badge variant="info" size="sm">
                          Custom
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setCaptureTarget({
                            id: binding.id,
                            label: binding.label,
                          })
                        }
                        className="cursor-pointer"
                        aria-label={`Rebind ${binding.label}`}
                      >
                        <KeyBadge combo={resolved} />
                      </button>
                      {isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetOne(binding.id)}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Capture modal */}
      <CaptureModal
        open={captureTarget !== null}
        actionId={captureTarget?.id ?? ""}
        actionLabel={captureTarget?.label ?? ""}
        onCapture={handleCapture}
        onCancel={() => setCaptureTarget(null)}
      />
    </div>
  );
}
