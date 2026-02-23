/**
 * Readiness criteria editor component (PRD-107).
 *
 * Allows admins to configure which fields are required for a character
 * to be considered "ready". Supports studio-level and project-level scopes.
 */

import { useState } from "react";

import { Button, Checkbox, Input } from "@/components";

import type { CriteriaJson, CriteriaScopeType } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReadinessCriteriaEditorProps {
  /** The scope type being edited. */
  scope: CriteriaScopeType;
  /** Initial criteria values. */
  initialCriteria?: CriteriaJson;
  /** Callback when save is clicked. */
  onSave: (criteria: CriteriaJson) => void;
  /** Callback when cancel is clicked. */
  onCancel?: () => void;
  /** Number of characters that will be affected by the change. */
  affectedCount?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReadinessCriteriaEditor({
  scope,
  initialCriteria,
  onSave,
  onCancel,
  affectedCount,
}: ReadinessCriteriaEditorProps) {
  const [sourceImage, setSourceImage] = useState(
    initialCriteria?.required_fields.source_image ?? true,
  );
  const [approvedVariant, setApprovedVariant] = useState(
    initialCriteria?.required_fields.approved_variant ?? true,
  );
  const [metadataComplete, setMetadataComplete] = useState(
    initialCriteria?.required_fields.metadata_complete ?? true,
  );
  const [settings, setSettings] = useState<string[]>(
    initialCriteria?.required_fields.settings ?? [
      "a2c4_model",
      "elevenlabs_voice",
      "avatar_json",
    ],
  );
  const [newKey, setNewKey] = useState("");

  const addSettingsKey = () => {
    const key = newKey.trim();
    if (key && !settings.includes(key)) {
      setSettings([...settings, key]);
      setNewKey("");
    }
  };

  const removeSettingsKey = (key: string) => {
    setSettings(settings.filter((s) => s !== key));
  };

  const handleSave = () => {
    onSave({
      required_fields: {
        source_image: sourceImage,
        approved_variant: approvedVariant,
        metadata_complete: metadataComplete,
        settings,
      },
    });
  };

  return (
    <div data-testid="readiness-criteria-editor" className="space-y-4">
      {/* Scope indicator */}
      <div className="text-sm font-medium text-[var(--color-text-secondary)]">
        Scope:{" "}
        <span data-testid="scope-label" className="capitalize">
          {scope}
        </span>
      </div>

      {/* Boolean criteria */}
      <div data-testid="boolean-criteria" className="space-y-2">
        <div data-testid="check-source-image">
          <Checkbox
            label="Source image required"
            checked={sourceImage}
            onChange={(checked) => setSourceImage(checked)}
          />
        </div>
        <div data-testid="check-approved-variant">
          <Checkbox
            label="Approved variant required"
            checked={approvedVariant}
            onChange={(checked) => setApprovedVariant(checked)}
          />
        </div>
        <div data-testid="check-metadata-complete">
          <Checkbox
            label="Metadata complete required"
            checked={metadataComplete}
            onChange={(checked) => setMetadataComplete(checked)}
          />
        </div>
      </div>

      {/* Settings keys */}
      <div data-testid="settings-keys-section" className="space-y-2">
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          Required settings keys:
        </p>

        <div data-testid="settings-keys-list" className="space-y-1">
          {settings.map((key) => (
            <div
              key={key}
              data-testid={`settings-key-${key}`}
              className="flex items-center gap-2"
            >
              <span className="text-sm text-[var(--color-text-primary)]">
                {key}
              </span>
              <button
                type="button"
                data-testid={`remove-key-${key}`}
                className="text-xs text-[var(--color-action-danger)] hover:underline"
                onClick={() => removeSettingsKey(key)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            data-testid="new-key-input"
            placeholder="Add settings key..."
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSettingsKey();
              }
            }}
          />
          <Button
            data-testid="add-key-btn"
            variant="secondary"
            size="sm"
            onClick={addSettingsKey}
            disabled={!newKey.trim()}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Affected count warning */}
      {affectedCount != null && affectedCount > 0 && (
        <p
          data-testid="affected-count"
          className="text-sm text-[var(--color-action-warning)]"
        >
          This will recalculate readiness for {affectedCount} characters.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          data-testid="save-criteria-btn"
          variant="primary"
          size="sm"
          onClick={handleSave}
        >
          Save Criteria
        </Button>
        {onCancel && (
          <Button
            data-testid="cancel-criteria-btn"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
