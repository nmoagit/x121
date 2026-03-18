/**
 * Collapsible speech type group with language sub-sections (PRD-136).
 */

import { useState } from "react";

import { Badge, FlagIcon } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import type { CharacterSpeech, Language } from "../types";
import { SpeechEntryRow } from "./SpeechEntryRow";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LanguageGroup {
  langId: number;
  lang: Language | undefined;
  items: CharacterSpeech[];
}

interface SpeechTypeSectionProps {
  typeName: string;
  languageGroups: LanguageGroup[];
  languageMap: Map<number, Language>;
  editingId: number | null;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: (speech: CharacterSpeech) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (speech: CharacterSpeech) => void;
  onApprove: (speechId: number) => void;
  onReject: (speechId: number) => void;
  onMoveUp: (speech: CharacterSpeech, groupItems: CharacterSpeech[]) => void;
  onMoveDown: (speech: CharacterSpeech, groupItems: CharacterSpeech[]) => void;
  saving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SpeechTypeSection({
  typeName,
  languageGroups,
  editingId,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onApprove,
  onReject,
  onMoveUp,
  onMoveDown,
  saving,
}: SpeechTypeSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const totalItems = languageGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="border border-[var(--color-border-default)] rounded-[var(--radius-md)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-[var(--spacing-2)] w-full px-[var(--spacing-3)] py-[var(--spacing-2)]",
          "text-left text-sm font-medium text-[var(--color-text-primary)]",
          "hover:bg-[var(--color-surface-tertiary)] transition-colors",
        )}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{typeName}</span>
        <Badge variant="default" size="sm">
          {totalItems}
        </Badge>
      </button>

      {expanded && (
        <div>
          {languageGroups.map(({ langId, lang, items }) => (
            <div key={langId}>
              {/* Language sub-header */}
              {languageGroups.length > 1 && (
                <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-1.5 bg-[var(--color-surface-secondary)] border-t border-[var(--color-border-default)]">
                  {lang && <FlagIcon flagCode={lang.flag_code} size={14} />}
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">
                    {lang?.name ?? `Language ${langId}`}
                  </span>
                  <Badge variant="default" size="sm">
                    {items.length}
                  </Badge>
                </div>
              )}

              <div className="divide-y divide-[var(--color-border-default)]">
                {items.map((speech, idx) => (
                  <SpeechEntryRow
                    key={speech.id}
                    speech={speech}
                    typeName={typeName}
                    isEditing={editingId === speech.id}
                    editText={editText}
                    onEditTextChange={onEditTextChange}
                    onStartEdit={() => onStartEdit(speech)}
                    onCancelEdit={onCancelEdit}
                    onSaveEdit={onSaveEdit}
                    onDelete={() => onDelete(speech)}
                    onApprove={() => onApprove(speech.id)}
                    onReject={() => onReject(speech.id)}
                    onMoveUp={() => onMoveUp(speech, items)}
                    onMoveDown={() => onMoveDown(speech, items)}
                    isFirst={idx === 0}
                    isLast={idx === items.length - 1}
                    saving={saving}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
