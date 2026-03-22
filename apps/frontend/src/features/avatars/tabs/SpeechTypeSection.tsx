/**
 * Collapsible speech type group with language sub-sections (PRD-136).
 * Terminal-style dark panel matching the hacker aesthetic.
 */

import { useState } from "react";

import { FlagIcon } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import type { AvatarSpeech, Language } from "../types";
import { SpeechEntryRow } from "./SpeechEntryRow";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LanguageGroup {
  langId: number;
  lang: Language | undefined;
  items: AvatarSpeech[];
}

interface SpeechTypeSectionProps {
  typeName: string;
  languageGroups: LanguageGroup[];
  languageMap: Map<number, Language>;
  editingId: number | null;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: (speech: AvatarSpeech) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (speech: AvatarSpeech) => void;
  onApprove: (speechId: number) => void;
  onReject: (speechId: number) => void;
  onMoveUp: (speech: AvatarSpeech, groupItems: AvatarSpeech[]) => void;
  onMoveDown: (speech: AvatarSpeech, groupItems: AvatarSpeech[]) => void;
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-[var(--spacing-2)] w-full px-[var(--spacing-3)] py-[var(--spacing-2)]",
          "text-left bg-[#161b22] hover:bg-[#1c2333] transition-colors",
        )}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
        )}
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
          {typeName}
        </span>
        <span className="text-[10px] font-mono text-cyan-400">{totalItems}</span>
      </button>

      {expanded && (
        <div>
          {languageGroups.map(({ langId, lang, items }) => (
            <div key={langId}>
              {/* Language sub-header — always visible */}
              <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-1 border-t border-[var(--color-border-default)] bg-[#161b22]/50">
                {lang && <FlagIcon flagCode={lang.flag_code} size={10} />}
                <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
                  {lang?.name ?? `Language ${langId}`}
                </span>
                <span className="text-[10px] font-mono text-cyan-400">{items.length}</span>
              </div>

              <div className="divide-y divide-[var(--color-border-default)]/30">
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
