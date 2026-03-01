/**
 * Character metadata tab — sectioned form driven by metadata template.
 *
 * Supports:
 * - Structured sections (biographical, appearance, favorites, etc.)
 * - Bio.json + tov.json drag-and-drop upload with Generate button
 * - Advanced Mode toggle for raw JSON editing
 * - Required field indicators and completeness tracking
 * - Custom field addition in the optional section
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Accordion } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, LoadingPane, Toggle } from "@/components/primitives";
import { isValidJson } from "@/lib/validation";
import { Plus } from "@/tokens/icons";

import {
  useCharacterMetadata,
  useMetadataTemplate,
  useUpdateCharacterMetadata,
} from "../hooks/use-character-detail";
import { flattenMetadata, unflattenMetadata } from "../lib/metadata-flatten";
import { completenessVariant, groupFieldsIntoSections } from "../types";
import type { MetadataSection, MetadataTemplateField } from "../types";
import { MetadataFieldInput } from "./MetadataFieldInput";
import { MetadataJsonDropZone } from "./MetadataJsonDropZone";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterMetadataTabProps {
  characterId: number;
}

export function CharacterMetadataTab({ characterId }: CharacterMetadataTabProps) {
  const { data: metadataResponse, isLoading: metaLoading } = useCharacterMetadata(characterId);
  const { data: templateResponse, isLoading: templateLoading } = useMetadataTemplate(characterId);
  const updateMetadata = useUpdateCharacterMetadata(characterId);

  // State
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [bioJson, setBioJson] = useState<Record<string, unknown> | null>(null);
  const [tovJson, setTovJson] = useState<Record<string, unknown> | null>(null);
  const [newKey, setNewKey] = useState("");

  // Derive sections from template fields
  const sections: MetadataSection[] = useMemo(() => {
    if (!templateResponse?.fields?.length) return [];
    return groupFieldsIntoSections(templateResponse.fields);
  }, [templateResponse?.fields]);

  // Set of template field names for quick lookup
  const templateFieldNames = useMemo(() => {
    if (!templateResponse?.fields) return new Set<string>();
    return new Set(templateResponse.fields.map((f) => f.field_name));
  }, [templateResponse?.fields]);

  // Sync draft from API response
  useEffect(() => {
    if (metadataResponse) {
      // The API returns { data: { fields: [...], completeness: {...}, ... } }
      // but the hook extracts the `data` envelope, giving us the structured response.
      // We need the raw metadata — reconstruct from field values or from raw metadata.
      const raw: Record<string, unknown> = {};
      if (metadataResponse.fields) {
        for (const f of metadataResponse.fields as Array<{ name: string; value: unknown }>) {
          if (f.value != null) raw[f.name] = f.value;
        }
      }
      setDraft(flattenMetadata(raw));
      setIsDirty(false);
    }
  }, [metadataResponse]);

  // Sync advanced JSON from draft
  useEffect(() => {
    if (advancedMode) {
      const nested = unflattenMetadata(draft);
      setAdvancedJson(JSON.stringify(nested, null, 2));
      setJsonError(null);
    }
  }, [advancedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [fieldName]: value }));
    setIsDirty(true);
  }, []);

  const handleFieldDelete = useCallback((fieldName: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[fieldName];
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

  const handleGenerate = useCallback(async () => {
    // Lazy import to avoid bundling when not needed
    const { generateMetadata } = await import("../lib/metadata-transform");
    // We need the character name — try to extract from existing draft
    const charName = (draft.full_name as string) || "";
    const result = generateMetadata(bioJson, tovJson, charName);
    const flat = flattenMetadata(result);
    setDraft((prev) => ({ ...prev, ...flat }));
    setIsDirty(true);
  }, [bioJson, tovJson, draft.full_name]);

  const handleToggleAdvanced = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Form → JSON
        const nested = unflattenMetadata(draft);
        setAdvancedJson(JSON.stringify(nested, null, 2));
        setJsonError(null);
      } else {
        // JSON → Form
        if (isValidJson(advancedJson)) {
          const parsed = JSON.parse(advancedJson);
          setDraft(flattenMetadata(parsed));
          setJsonError(null);
        }
      }
      setAdvancedMode(checked);
    },
    [draft, advancedJson],
  );

  const handleAdvancedJsonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setAdvancedJson(text);
    if (isValidJson(text)) {
      setJsonError(null);
      setIsDirty(true);
    } else {
      setJsonError("Invalid JSON");
    }
  }, []);

  const handleSave = useCallback(() => {
    let payload: Record<string, unknown>;
    if (advancedMode) {
      if (!isValidJson(advancedJson)) return;
      const parsed = JSON.parse(advancedJson);
      // Flatten so the backend can unflatten correctly
      payload = flattenMetadata(parsed);
    } else {
      payload = { ...draft };
    }

    updateMetadata.mutate(payload, {
      onSuccess: () => setIsDirty(false),
    });
  }, [draft, advancedMode, advancedJson, updateMetadata]);

  if (metaLoading || templateLoading) {
    return <LoadingPane />;
  }

  // Completeness calculation
  const requiredFields = templateResponse?.fields?.filter((f) => f.is_required) ?? [];
  const totalRequired = requiredFields.length;
  const filledRequired = requiredFields.filter((f) => {
    const val = draft[f.field_name];
    return val != null && val !== "";
  }).length;
  const completePct = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;

  // Custom fields (in draft but not in template)
  const customFieldKeys = Object.keys(draft).filter((k) => !templateFieldNames.has(k));

  // Build accordion items from sections
  const accordionItems = sections.map((section) => ({
    id: section.key,
    title: `${section.label} (${section.fields.length} fields)`,
    content: (
      <Stack gap={3}>
        {section.fields.map((field) => (
          <MetadataFieldInput
            key={field.field_name}
            field={field}
            value={draft[field.field_name] ?? null}
            onChange={handleFieldChange}
            onDelete={!field.is_required ? handleFieldDelete : undefined}
          />
        ))}
      </Stack>
    ),
  }));

  // Add custom fields section if there are any
  if (customFieldKeys.length > 0 || !sections.some((s) => s.key === "optional")) {
    // Custom fields not in the template
    if (customFieldKeys.length > 0) {
      accordionItems.push({
        id: "custom",
        title: `Custom Fields (${customFieldKeys.length})`,
        content: (
          <Stack gap={3}>
            {customFieldKeys.map((key) => {
              const pseudoField: MetadataTemplateField = {
                id: 0,
                template_id: 0,
                field_name: key,
                field_type: "string",
                is_required: false,
                constraints: {},
                description: null,
                sort_order: 999,
                created_at: "",
                updated_at: "",
              };
              return (
                <MetadataFieldInput
                  key={key}
                  field={pseudoField}
                  value={draft[key] ?? null}
                  onChange={handleFieldChange}
                  onDelete={handleFieldDelete}
                />
              );
            })}
          </Stack>
        ),
      });
    }
  }

  const sectionIds = accordionItems.map((i) => i.id);

  return (
    <Stack gap={4}>
      {/* Completeness + Advanced toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Badge variant={completenessVariant(completePct)} size="sm">
            {completePct}% complete
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            {filledRequired} / {totalRequired} required fields filled
          </span>
        </div>
        <Toggle
          label="Advanced Mode"
          size="sm"
          checked={advancedMode}
          onChange={handleToggleAdvanced}
        />
      </div>

      {/* JSON upload zones */}
      <div className="grid grid-cols-2 gap-[var(--spacing-3)]">
        <MetadataJsonDropZone label="bio.json" value={bioJson} onChange={setBioJson} />
        <MetadataJsonDropZone label="tov.json" value={tovJson} onChange={setTovJson} />
      </div>

      {/* Generate button */}
      {(bioJson || tovJson) && (
        <div>
          <Button variant="secondary" size="sm" onClick={handleGenerate}>
            Generate Metadata
          </Button>
        </div>
      )}

      {/* Main content: sectioned form or advanced JSON */}
      {advancedMode ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={advancedJson}
            onChange={handleAdvancedJsonChange}
            className="w-full min-h-[400px] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 font-mono text-xs text-[var(--color-text-primary)] focus:outline-2 focus:outline-[var(--color-border-focus)]"
            spellCheck={false}
          />
          {jsonError && (
            <span className="text-xs text-[var(--color-action-danger)]">{jsonError}</span>
          )}
        </div>
      ) : (
        <>
          <Accordion items={accordionItems} allowMultiple defaultOpenIds={sectionIds} />

          {/* Add custom field */}
          <div className="flex items-center gap-[var(--spacing-2)] pt-[var(--spacing-2)] border-t border-[var(--color-border-default)]">
            <Input
              value={newKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
              placeholder="Add custom field..."
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
        </>
      )}

      {/* Save bar */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || updateMetadata.isPending || (advancedMode && !!jsonError)}
        >
          {updateMetadata.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Stack>
  );
}
