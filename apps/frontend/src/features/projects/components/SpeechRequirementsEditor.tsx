/**
 * Speech requirements matrix editor for project config (PRD-136 Task 7.4).
 *
 * Renders a grid: rows = speech types, columns = languages.
 * Each cell is a min_variants number input. Save persists via PUT API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Stack } from "@/components/layout";
import { Badge, Button, FlagIcon, Input, Select, Tooltip } from "@/components/primitives";
import type { Language, ProjectSpeechConfigEntry, SpeechType } from "@/features/characters/types";
import { Plus, Save, Wand2 } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_MIN_VARIANTS = 3;
const ENGLISH_LANGUAGE_ID = 1;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SpeechRequirementsEditorProps {
  speechTypes: SpeechType[];
  languages: Language[];
  config: ProjectSpeechConfigEntry[];
  saving: boolean;
  onSave: (entries: ProjectSpeechConfigEntry[]) => void;
  onOpenImport?: () => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build a lookup key for the matrix cell. */
function cellKey(typeId: number, langId: number): string {
  return `${typeId}:${langId}`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SpeechRequirementsEditor({
  speechTypes,
  languages,
  config,
  saving,
  onSave,
  onOpenImport,
}: SpeechRequirementsEditorProps) {
  // Matrix state: Map<"typeId:langId", minVariants>
  const [matrix, setMatrix] = useState<Map<string, number>>(new Map());
  const [configuredLangIds, setConfiguredLangIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showAddLang, setShowAddLang] = useState(false);

  // Initialize from server config
  useEffect(() => {
    const m = new Map<string, number>();
    const langSet = new Set<number>();
    for (const entry of config) {
      m.set(cellKey(entry.speech_type_id, entry.language_id), entry.min_variants);
      langSet.add(entry.language_id);
    }
    setMatrix(m);
    setConfiguredLangIds(Array.from(langSet).sort((a, b) => a - b));
    setDirty(false);
  }, [config]);

  const configuredLanguages = useMemo(
    () => configuredLangIds.map((id) => languages.find((l) => l.id === id)).filter(Boolean) as Language[],
    [configuredLangIds, languages],
  );

  const availableLanguages = useMemo(
    () => languages.filter((l) => !configuredLangIds.includes(l.id)),
    [languages, configuredLangIds],
  );

  const sortedTypes = useMemo(
    () => [...speechTypes].sort((a, b) => a.sort_order - b.sort_order),
    [speechTypes],
  );

  const setCellValue = useCallback((typeId: number, langId: number, value: number) => {
    setMatrix((prev) => {
      const next = new Map(prev);
      next.set(cellKey(typeId, langId), Math.max(0, value));
      return next;
    });
    setDirty(true);
  }, []);

  function addLanguage(langId: number) {
    setConfiguredLangIds((prev) => [...prev, langId].sort((a, b) => a - b));
    setShowAddLang(false);
    setDirty(true);
  }

  function removeLanguage(langId: number) {
    setConfiguredLangIds((prev) => prev.filter((id) => id !== langId));
    setMatrix((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.endsWith(`:${langId}`)) next.delete(key);
      }
      return next;
    });
    setDirty(true);
  }

  function applyDefaults() {
    const m = new Map<string, number>();
    const langIds = configuredLangIds.includes(ENGLISH_LANGUAGE_ID)
      ? configuredLangIds
      : [ENGLISH_LANGUAGE_ID, ...configuredLangIds];

    for (const t of sortedTypes) {
      for (const langId of langIds) {
        // Default: 3 for English, 0 for others
        m.set(cellKey(t.id, langId), langId === ENGLISH_LANGUAGE_ID ? DEFAULT_MIN_VARIANTS : 0);
      }
    }
    setMatrix(m);
    setConfiguredLangIds(langIds.sort((a, b) => a - b));
    setDirty(true);
  }

  function handleSave() {
    const entries: ProjectSpeechConfigEntry[] = [];
    for (const t of sortedTypes) {
      for (const langId of configuredLangIds) {
        const val = matrix.get(cellKey(t.id, langId)) ?? 0;
        entries.push({ speech_type_id: t.id, language_id: langId, min_variants: val });
      }
    }
    onSave(entries);
  }

  return (
    <Stack gap={4}>
      {/* Toolbar */}
      <div className="flex items-center gap-[var(--spacing-2)] flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          icon={<Wand2 size={14} />}
          onClick={applyDefaults}
        >
          Apply Defaults
        </Button>
        {onOpenImport && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenImport}
          >
            Import Speech
          </Button>
        )}
        <div className="ml-auto flex items-center gap-[var(--spacing-2)]">
          {dirty && (
            <Badge variant="warning" size="sm">
              Unsaved changes
            </Badge>
          )}
          <Button
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            loading={saving}
            disabled={!dirty}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Matrix grid */}
      {configuredLanguages.length === 0 && sortedTypes.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No speech types or languages configured. Click "Apply Defaults" to set up English defaults.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)] font-medium">
                  Speech Type
                </th>
                {configuredLanguages.map((lang) => (
                  <th key={lang.id} className="px-2 py-1.5 text-center min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <FlagIcon flagCode={lang.flag_code} size={16} />
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        {lang.name}
                      </span>
                      <Tooltip content={`Remove ${lang.name}`}>
                        <button
                          type="button"
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] cursor-pointer ml-0.5"
                          onClick={() => removeLanguage(lang.id)}
                          aria-label={`Remove ${lang.name}`}
                        >
                          &times;
                        </button>
                      </Tooltip>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center min-w-[100px]">
                  {showAddLang ? (
                    <Select
                      options={availableLanguages.map((l) => ({ value: String(l.id), label: l.name }))}
                      value=""
                      onChange={(val) => { if (val) addLanguage(Number(val)); }}
                      placeholder="Select..."
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Plus size={14} />}
                      onClick={() => setShowAddLang(true)}
                      disabled={availableLanguages.length === 0}
                    >
                      Add
                    </Button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTypes.map((type) => (
                <tr key={type.id} className="border-t border-[var(--color-border-default)]">
                  <td className="px-2 py-1.5 font-medium text-[var(--color-text-primary)]">
                    {type.name}
                  </td>
                  {configuredLanguages.map((lang) => {
                    const value = matrix.get(cellKey(type.id, lang.id)) ?? 0;
                    return (
                      <td key={lang.id} className="px-2 py-1">
                        <Input
                          type="number"
                          value={String(value)}
                          onChange={(val) => setCellValue(type.id, lang.id, Number(val))}
                          className="text-center w-16 mx-auto"
                        />
                      </td>
                    );
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Stack>
  );
}
