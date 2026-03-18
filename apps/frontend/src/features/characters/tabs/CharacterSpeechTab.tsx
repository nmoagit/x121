/**
 * Character speech tab — manage speech entries grouped by type and language (PRD-124, PRD-136).
 *
 * Shows voice configuration badge, speech entries grouped by speech type and language
 * with inline editing, approval workflow, reordering, and deliverable generation.
 */

import { useMemo, useState } from "react";

import { ConfirmDeleteModal } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { Check, Download, FileJson, MessageSquare, Plus, Upload } from "@/tokens/icons";

import { useCharacterSettings } from "../hooks/use-character-detail";
import { useCharacterSpeeches, useSpeechTypes } from "../hooks/use-character-speeches";
import { useLanguages } from "../hooks/use-languages";
import { useSpeechActions } from "../hooks/use-speech-actions";
import { getVoiceId } from "../types";
import type { CharacterSpeech, Language } from "../types";
import { AddSpeechModal } from "./AddSpeechModal";
import { LanguageFilterBar } from "./LanguageFilterBar";
import { SpeechImportModal } from "./SpeechImportModal";
import { SpeechTypeSection } from "./SpeechTypeSection";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CharacterSpeechTabProps {
  characterId: number;
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterSpeechTab({ characterId, projectId }: CharacterSpeechTabProps) {
  const { data: settings } = useCharacterSettings(projectId, characterId);
  const { data: speeches, isLoading: speechesLoading } = useCharacterSpeeches(characterId);
  const { data: speechTypes, isLoading: typesLoading } = useSpeechTypes();
  const { data: languages } = useLanguages();
  const actions = useSpeechActions(characterId);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<number | null>(null);

  const voiceId = getVoiceId(settings as Record<string, unknown> | null);

  /* --- maps for display --- */
  const languageMap = useMemo(() => {
    const map = new Map<number, Language>();
    for (const l of languages ?? []) map.set(l.id, l);
    return map;
  }, [languages]);

  const typeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of speechTypes ?? []) map.set(t.id, t.name);
    return map;
  }, [speechTypes]);

  /* --- distinct languages present in speeches --- */
  const presentLanguageIds = useMemo(() => {
    if (!speeches) return [];
    const ids = new Set<number>();
    for (const s of speeches) ids.add(s.language_id);
    return Array.from(ids).sort((a, b) => a - b);
  }, [speeches]);

  /* --- filter and group speeches: Type -> Language -> Variants --- */
  const grouped = useMemo(() => {
    const filtered = !speeches
      ? []
      : languageFilter
        ? speeches.filter((s) => s.language_id === languageFilter)
        : speeches;

    const groups = new Map<number, Map<number, CharacterSpeech[]>>();
    for (const s of filtered) {
      let typeGroup = groups.get(s.speech_type_id);
      if (!typeGroup) {
        typeGroup = new Map<number, CharacterSpeech[]>();
        groups.set(s.speech_type_id, typeGroup);
      }
      const langGroup = typeGroup.get(s.language_id) ?? [];
      langGroup.push(s);
      typeGroup.set(s.language_id, langGroup);
    }

    return Array.from(groups.entries())
      .map(([typeId, langMap]) => ({
        typeId,
        typeName: typeMap.get(typeId) ?? `Type ${typeId}`,
        languages: Array.from(langMap.entries())
          .map(([langId, items]) => ({
            langId,
            lang: languageMap.get(langId),
            items: items.sort((a, b) => a.sort_order - b.sort_order || a.version - b.version),
          }))
          .sort((a, b) => a.langId - b.langId),
      }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));
  }, [speeches, languageFilter, typeMap, languageMap]);

  if (speechesLoading || typesLoading) return <LoadingPane />;

  const isEmpty = !speeches || speeches.length === 0;

  return (
    <Stack gap={4}>
      {/* VoiceID badge */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        {voiceId ? (
          <Badge variant="info" size="sm">VoiceID: {voiceId}</Badge>
        ) : (
          <Badge variant="warning" size="sm">Voice not configured</Badge>
        )}
      </div>

      {/* Toolbar */}
      <SpeechToolbar
        isEmpty={isEmpty}
        onAdd={() => setAddOpen(true)}
        onImport={() => { actions.setImportResult(null); setImportOpen(true); }}
        onBulkApprove={() => actions.handleBulkApprove(languageFilter)}
        onDeliverable={actions.handleGenerateDeliverable}
        onExport={actions.handleExport}
        bulkApproving={actions.bulkApprove.isPending}
        generating={actions.generateDeliverable.isPending}
        exporting={actions.exportSpeeches.isPending}
      />

      {/* Language filter */}
      {presentLanguageIds.length > 1 && (
        <LanguageFilterBar
          languageIds={presentLanguageIds}
          languageMap={languageMap}
          activeId={languageFilter}
          onSelect={setLanguageFilter}
        />
      )}

      {/* Content */}
      {isEmpty ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No speeches yet"
          description="Add speech entries manually or import them from a CSV or JSON file."
          action={
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
              Add Speech
            </Button>
          }
        />
      ) : (
        <Stack gap={2}>
          {grouped.map((group) => (
            <SpeechTypeSection
              key={group.typeId}
              typeName={group.typeName}
              languageGroups={group.languages}
              languageMap={languageMap}
              editingId={actions.editingId}
              editText={actions.editText}
              onEditTextChange={actions.setEditText}
              onStartEdit={actions.startEdit}
              onCancelEdit={actions.cancelEdit}
              onSaveEdit={actions.saveEdit}
              onDelete={actions.setDeleteTarget}
              onApprove={actions.handleApprove}
              onReject={actions.handleReject}
              onMoveUp={actions.handleMoveUp}
              onMoveDown={actions.handleMoveDown}
              saving={actions.updateSpeech.isPending}
            />
          ))}
        </Stack>
      )}

      {/* Modals */}
      <AddSpeechModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        speechTypes={speechTypes ?? []}
        onCreateType={(name) => actions.createSpeechType.mutateAsync(name)}
        creatingType={actions.createSpeechType.isPending}
        onSave={(input) => {
          actions.createSpeech.mutate(input, { onSuccess: () => setAddOpen(false) });
        }}
        saving={actions.createSpeech.isPending}
        languages={languages}
      />

      <SpeechImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={actions.handleImport}
        importing={actions.importSpeeches.isPending}
        result={actions.importResult}
        languages={languages}
      />

      <ConfirmDeleteModal
        open={actions.deleteTarget !== null}
        onClose={() => actions.setDeleteTarget(null)}
        title="Delete Speech"
        entityName={
          actions.deleteTarget
            ? `${typeMap.get(actions.deleteTarget.speech_type_id) ?? "Speech"} v${actions.deleteTarget.version}`
            : ""
        }
        onConfirm={actions.confirmDelete}
        loading={actions.deleteSpeech.isPending}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   SpeechToolbar — extracted toolbar row
   -------------------------------------------------------------------------- */

interface SpeechToolbarProps {
  isEmpty: boolean;
  onAdd: () => void;
  onImport: () => void;
  onBulkApprove: () => void;
  onDeliverable: () => void;
  onExport: (format: string) => void;
  bulkApproving: boolean;
  generating: boolean;
  exporting: boolean;
}

function SpeechToolbar({
  isEmpty,
  onAdd,
  onImport,
  onBulkApprove,
  onDeliverable,
  onExport,
  bulkApproving,
  generating,
  exporting,
}: SpeechToolbarProps) {
  return (
    <div className="flex items-center gap-[var(--spacing-2)] flex-wrap">
      <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
        Add Speech
      </Button>
      <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={onImport}>
        Import
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<Check size={14} />}
        onClick={onBulkApprove}
        disabled={isEmpty || bulkApproving}
        loading={bulkApproving}
      >
        Bulk Approve
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<FileJson size={14} />}
        onClick={onDeliverable}
        disabled={isEmpty || generating}
        loading={generating}
      >
        Deliverable
      </Button>
      <div className="flex items-center gap-[var(--spacing-1)] ml-auto">
        <Button
          size="sm"
          variant="secondary"
          icon={<Download size={14} />}
          onClick={() => onExport("csv")}
          disabled={isEmpty || exporting}
        >
          CSV
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Download size={14} />}
          onClick={() => onExport("json")}
          disabled={isEmpty || exporting}
        >
          JSON
        </Button>
      </div>
    </div>
  );
}
