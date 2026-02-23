/**
 * Path mapping rules editor for legacy import (PRD-86).
 */

import { useState } from "react";

import type { PathMappingRule } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface MappingConfigProps {
  /** Current list of mapping rules. */
  rules: PathMappingRule[];
  /** Called when rules are updated. */
  onChange?: (rules: PathMappingRule[]) => void;
  /** Whether editing is disabled. */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MappingConfig({
  rules,
  onChange,
  disabled = false,
}: MappingConfigProps) {
  const [newPattern, setNewPattern] = useState("");
  const [newEntityType, setNewEntityType] = useState("");

  const handleAdd = () => {
    if (!newPattern.trim() || !newEntityType.trim()) return;

    // Extract capture names from the pattern (e.g. {name}).
    const captures: string[] = [];
    const regex = /\{(\w+)\}/g;
    let match;
    while ((match = regex.exec(newPattern)) !== null) {
      if (match[1] != null) {
        captures.push(match[1]);
      }
    }

    const updated: PathMappingRule[] = [
      ...rules,
      {
        pattern: newPattern.trim(),
        entity_type: newEntityType.trim(),
        captures,
      },
    ];
    onChange?.(updated);
    setNewPattern("");
    setNewEntityType("");
  };

  const handleRemove = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  return (
    <div data-testid="mapping-config" className="space-y-4">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Path Mapping Rules
      </h3>

      {rules.length === 0 ? (
        <p
          data-testid="no-rules"
          className="text-sm text-[var(--color-text-secondary)]"
        >
          No custom rules configured. Default rules will be used.
        </p>
      ) : (
        <ul data-testid="rules-list" className="space-y-2">
          {rules.map((rule, idx) => (
            <li
              key={idx}
              data-testid={`rule-item-${idx}`}
              className="flex items-center gap-3 rounded border p-2 text-sm"
            >
              <code className="flex-1 font-mono text-xs">{rule.pattern}</code>
              <span className="text-[var(--color-text-secondary)]">
                {rule.entity_type}
              </span>
              <button
                data-testid={`remove-rule-btn-${idx}`}
                onClick={() => handleRemove(idx)}
                disabled={disabled}
                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          data-testid="new-pattern-input"
          type="text"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          placeholder="{name}/images/*"
          disabled={disabled}
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <input
          data-testid="new-entity-type-input"
          type="text"
          value={newEntityType}
          onChange={(e) => setNewEntityType(e.target.value)}
          placeholder="image"
          disabled={disabled}
          className="w-32 rounded border px-3 py-2 text-sm"
        />
        <button
          data-testid="add-rule-btn"
          onClick={handleAdd}
          disabled={disabled || !newPattern.trim() || !newEntityType.trim()}
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add Rule
        </button>
      </div>
    </div>
  );
}
