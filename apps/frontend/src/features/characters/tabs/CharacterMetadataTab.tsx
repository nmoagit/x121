/**
 * Character metadata tab — editable key-value form (PRD-112).
 */

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, LoadingPane } from "@/components/primitives";
import { snakeCaseToTitle } from "@/lib/format";
import { Plus, Trash2 } from "@/tokens/icons";

import {
  useCharacterMetadata,
  useUpdateCharacterMetadata,
} from "../hooks/use-character-detail";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterMetadataTabProps {
  characterId: number;
}

export function CharacterMetadataTab({
  characterId,
}: CharacterMetadataTabProps) {
  const { data: metadata, isLoading } = useCharacterMetadata(characterId);
  const updateMetadata = useUpdateCharacterMetadata(characterId);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [newKey, setNewKey] = useState("");

  // Sync draft from fetched metadata
  useEffect(() => {
    if (metadata) {
      const initial: Record<string, string> = {};
      for (const [k, v] of Object.entries(metadata)) {
        initial[k] = v != null ? String(v) : "";
      }
      setDraft(initial);
      setIsDirty(false);
    }
  }, [metadata]);

  const handleChange = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const handleDelete = useCallback((key: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleAddField = useCallback(() => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed in draft) return;
    setDraft((prev) => ({ ...prev, [trimmed]: "" }));
    setNewKey("");
    setIsDirty(true);
  }, [newKey, draft]);

  const handleSave = useCallback(() => {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      // Attempt to parse JSON for complex values
      try {
        payload[k] = JSON.parse(v);
      } catch {
        payload[k] = v;
      }
    }
    updateMetadata.mutate(payload, {
      onSuccess: () => setIsDirty(false),
    });
  }, [draft, updateMetadata]);

  if (isLoading) {
    return <LoadingPane />;
  }

  const entries = Object.entries(draft);
  const totalFields = entries.length;
  const filledFields = entries.filter(([, v]) => v.trim().length > 0).length;

  return (
    <Stack gap={4}>
      {/* Completeness indicator */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Badge variant={filledFields === totalFields && totalFields > 0 ? "success" : "warning"} size="sm">
          {filledFields} / {totalFields} fields filled
        </Badge>
        {totalFields > 0 && (
          <div className="flex-1 max-w-48">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-action-primary)] transition-all"
                style={{
                  width: `${totalFields > 0 ? (filledFields / totalFields) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Key-value editor */}
      <Card elevation="flat" padding="md">
        <Stack gap={3}>
          {entries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              No metadata fields. Add one below.
            </p>
          ) : (
            entries.map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-[var(--spacing-2)]"
              >
                <span className="w-40 shrink-0 text-sm font-medium text-[var(--color-text-secondary)]">
                  {snakeCaseToTitle(key)}
                </span>
                <Input
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange(key, e.target.value)
                  }
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => handleDelete(key)}
                  aria-label={`Delete ${key}`}
                />
              </div>
            ))
          )}

          {/* Add field row */}
          <div className="flex items-center gap-[var(--spacing-2)] pt-[var(--spacing-2)] border-t border-[var(--color-border-default)]">
            <Input
              value={newKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewKey(e.target.value)
              }
              placeholder="New field name..."
              className="flex-1"
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") handleAddField();
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={handleAddField}
              disabled={!newKey.trim() || newKey.trim() in draft}
            >
              Add
            </Button>
          </div>
        </Stack>
      </Card>

      {/* Save bar */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || updateMetadata.isPending}
        >
          {updateMetadata.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Stack>
  );
}
