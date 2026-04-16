/**
 * Speech requirements matrix editor for project config (PRD-136 Task 7.4).
 *
 * Renders a grid: rows = speech types, columns = languages.
 * Each cell is a min_variants number input. Save persists via PUT API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Stack } from "@/components/layout";
import { Button, FlagIcon, Tooltip } from "@/components/primitives";
import { TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_SELECT } from "@/lib/ui-classes";
import type { Language, ProjectSpeechConfigEntry, SpeechType } from "@/features/avatars/types";
import { Plus, Save, Wand2 } from "@/tokens/icons";
import { TYPO_DATA, TYPO_DATA_CYAN } from "@/lib/typography-tokens";

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
    <Stack gap={3}>
      {/* Toolbar */}
      <div className="flex items-center gap-[var(--spacing-2)] flex-wrap">
        <Button size="xs" variant="secondary" icon={<Wand2 size={12} />} onClick={applyDefaults}>
          Apply Defaults
        </Button>
        {onOpenImport && (
          <Button size="xs" variant="secondary" onClick={onOpenImport}>
            Import Speech
          </Button>
        )}
        <div className="ml-auto flex items-center gap-[var(--spacing-2)]">
          {dirty && (
            <span className="text-[10px] font-mono text-[var(--color-data-orange)]">unsaved</span>
          )}
          <Button size="xs" icon={<Save size={12} />} onClick={handleSave} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      {/* Matrix grid */}
      {configuredLanguages.length === 0 && sortedTypes.length === 0 ? (
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          No speech types or languages configured. Click "Apply Defaults" to set up English defaults.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={TERMINAL_DIVIDER}>
                <th className={`${TERMINAL_TH} px-2 py-1.5`}>
                  Speech Type
                </th>
                {configuredLanguages.map((lang) => (
                  <th key={lang.id} className={`${TERMINAL_TH} px-2 py-1.5 text-center`}>
                    <div className="flex items-center justify-center gap-1">
                      <FlagIcon flagCode={lang.flag_code} size={10} />
                      <span>{lang.code.toUpperCase()}</span>
                      <Tooltip content={`Remove ${lang.name}`}>
                        <button
                          type="button"
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-data-red)] cursor-pointer ml-0.5"
                          onClick={() => removeLanguage(lang.id)}
                          aria-label={`Remove ${lang.name}`}
                        >
                          &times;
                        </button>
                      </Tooltip>
                    </div>
                  </th>
                ))}
                <th className={`${TERMINAL_TH} px-2 py-1.5 text-center`}>
                  {showAddLang ? (
                    <select
                      className={`${TERMINAL_SELECT} w-24`}
                      value=""
                      onChange={(e) => { if (e.target.value) addLanguage(Number(e.target.value)); }}
                    >
                      <option value="">Select...</option>
                      {availableLanguages.map((l) => (
                        <option key={l.id} value={String(l.id)}>{l.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Button size="xs" variant="ghost" icon={<Plus size={12} />} onClick={() => setShowAddLang(true)} disabled={availableLanguages.length === 0}>
                      Add
                    </Button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTypes.map((type) => (
                <tr key={type.id} className={TERMINAL_DIVIDER}>
                  <td className={`px-2 py-1 ${TYPO_DATA} uppercase tracking-wide`}>
                    {type.name}
                  </td>
                  {configuredLanguages.map((lang) => {
                    const value = matrix.get(cellKey(type.id, lang.id)) ?? 0;
                    return (
                      <td key={lang.id} className="px-2 py-1 text-center">
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) => setCellValue(type.id, lang.id, Number(e.target.value))}
                          className={`${TYPO_DATA_CYAN} w-10 text-center bg-transparent border border-[var(--color-border-default)] rounded-[2px] px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]`}
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
