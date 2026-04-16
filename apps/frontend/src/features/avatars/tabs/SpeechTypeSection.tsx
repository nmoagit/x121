/**
 * Collapsible speech type group with language sub-sections (PRD-136).
 * Terminal-style dark panel matching the hacker aesthetic.
 * Supports drag-and-drop reordering within each language group.
 */

import { useCallback, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FlagIcon } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { TYPO_LABEL } from "@/lib/typography-tokens";
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
  onDragReorder: (orderedIds: number[]) => void;
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
  onDragReorder,
  saving,
}: SpeechTypeSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const totalItems = languageGroups.reduce((sum, g) => sum + g.items.length, 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (items: AvatarSpeech[], event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...items];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved!);
      onDragReorder(reordered.map((s) => s.id));
    },
    [onDragReorder],
  );

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-[var(--spacing-2)] w-full px-[var(--spacing-3)] py-[var(--spacing-2)]",
          "text-left bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors",
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
        <span className="text-[10px] font-mono text-[var(--color-data-cyan)]">{totalItems}</span>
      </button>

      {expanded && (
        <div>
          {languageGroups.map(({ langId, lang, items }) => (
            <div key={langId}>
              {/* Language sub-header */}
              <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-1 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]/50">
                {lang && <FlagIcon flagCode={lang.flag_code} size={10} />}
                <span className={TYPO_LABEL}>
                  {lang?.name ?? `Language ${langId}`}
                </span>
                <span className="text-[10px] font-mono text-[var(--color-data-cyan)]">{items.length}</span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(items, event)}
              >
                <SortableContext
                  items={items.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-[var(--color-border-default)]/30">
                    {items.map((speech) => (
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
                        saving={saving}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
