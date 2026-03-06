/**
 * Character speech tab — manage speech entries grouped by type (PRD-124).
 *
 * Shows voice configuration badge, speech entries grouped by speech type
 * with inline editing, and import/export functionality.
 */

import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteModal } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/file-utils";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER, TEXTAREA_BASE } from "@/lib/ui-classes";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
} from "@/tokens/icons";

import { useCharacterSettings } from "../hooks/use-character-detail";
import {
  useCharacterSpeeches,
  useCreateSpeech,
  useCreateSpeechType,
  useDeleteSpeech,
  useExportSpeeches,
  useImportSpeeches,
  useSpeechTypes,
  useUpdateSpeech,
} from "../hooks/use-character-speeches";
import type { CharacterSpeech, ImportSpeechesResponse } from "../types";
import { AddSpeechModal } from "./AddSpeechModal";
import { SpeechImportModal } from "./SpeechImportModal";

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
  const createSpeech = useCreateSpeech(characterId);
  const updateSpeech = useUpdateSpeech(characterId);
  const deleteSpeech = useDeleteSpeech(characterId);
  const createSpeechType = useCreateSpeechType();
  const importSpeeches = useImportSpeeches(characterId);
  const exportSpeeches = useExportSpeeches(characterId);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportSpeechesResponse | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CharacterSpeech | null>(null);

  const voiceId = (settings?.elevenlabs_voice as string) ?? null;

  /* --- group speeches by type --- */
  const typeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of speechTypes ?? []) map.set(t.id, t.name);
    return map;
  }, [speechTypes]);

  const grouped = useMemo(() => {
    if (!speeches) return [];
    const groups = new Map<number, CharacterSpeech[]>();
    for (const s of speeches) {
      const list = groups.get(s.speech_type_id) ?? [];
      list.push(s);
      groups.set(s.speech_type_id, list);
    }
    return Array.from(groups.entries())
      .map(([typeId, items]) => ({
        typeId,
        typeName: typeMap.get(typeId) ?? `Type ${typeId}`,
        items: items.sort((a, b) => a.version - b.version),
      }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));
  }, [speeches, typeMap]);

  /* --- inline editing --- */
  function startEdit(speech: CharacterSpeech) {
    setEditingId(speech.id);
    setEditText(speech.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveEdit() {
    if (editingId === null) return;
    updateSpeech.mutate(
      { speechId: editingId, text: editText },
      { onSuccess: () => cancelEdit() },
    );
  }

  /* --- delete --- */
  function confirmDelete() {
    if (!deleteTarget) return;
    deleteSpeech.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  /* --- import --- */
  const handleImport = useCallback(
    (input: { format: string; data: string }) => {
      importSpeeches.mutate(input, {
        onSuccess: (data) => setImportResult(data),
      });
    },
    [importSpeeches],
  );

  /* --- export --- */
  function handleExport(format: string) {
    exportSpeeches.mutate(format, {
      onSuccess: (data) => {
        const blob = new Blob([data], {
          type: format === "json" ? "application/json" : "text/csv",
        });
        downloadBlob(blob, `speeches.${format}`);
      },
    });
  }

  if (speechesLoading || typesLoading) {
    return <LoadingPane />;
  }

  const isEmpty = !speeches || speeches.length === 0;

  return (
    <Stack gap={4}>
      {/* VoiceID badge */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        {voiceId ? (
          <Badge variant="info" size="sm">
            VoiceID: {voiceId}
          </Badge>
        ) : (
          <Badge variant="warning" size="sm">
            Voice not configured
          </Badge>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
          Add Speech
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => {
            setImportResult(null);
            setImportOpen(true);
          }}
        >
          Import
        </Button>
        <div className="flex items-center gap-[var(--spacing-1)] ml-auto">
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={() => handleExport("csv")}
            disabled={isEmpty || exportSpeeches.isPending}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={() => handleExport("json")}
            disabled={isEmpty || exportSpeeches.isPending}
          >
            Export JSON
          </Button>
        </div>
      </div>

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
            <SpeechTypeGroup
              key={group.typeId}
              typeName={group.typeName}
              items={group.items}
              editingId={editingId}
              editText={editText}
              onEditTextChange={setEditText}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSaveEdit={saveEdit}
              onDelete={setDeleteTarget}
              saving={updateSpeech.isPending}
            />
          ))}
        </Stack>
      )}

      {/* Add speech modal */}
      <AddSpeechModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        speechTypes={speechTypes ?? []}
        onCreateType={(name) => createSpeechType.mutateAsync(name)}
        creatingType={createSpeechType.isPending}
        onSave={(input) => {
          createSpeech.mutate(input, { onSuccess: () => setAddOpen(false) });
        }}
        saving={createSpeech.isPending}
      />

      {/* Import modal */}
      <SpeechImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        importing={importSpeeches.isPending}
        result={importResult}
      />

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Speech"
        entityName={
          deleteTarget
            ? `${typeMap.get(deleteTarget.speech_type_id) ?? "Speech"} v${deleteTarget.version}`
            : ""
        }
        onConfirm={confirmDelete}
        loading={deleteSpeech.isPending}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   SpeechTypeGroup — collapsible section for one speech type
   -------------------------------------------------------------------------- */

interface SpeechTypeGroupProps {
  typeName: string;
  items: CharacterSpeech[];
  editingId: number | null;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: (speech: CharacterSpeech) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (speech: CharacterSpeech) => void;
  saving: boolean;
}

function SpeechTypeGroup({
  typeName,
  items,
  editingId,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  saving,
}: SpeechTypeGroupProps) {
  const [expanded, setExpanded] = useState(true);

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
          {items.length}
        </Badge>
      </button>

      {expanded && (
        <div className="divide-y divide-[var(--color-border-default)]">
          {items.map((speech) => (
            <SpeechEntry
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
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   SpeechEntry — single speech row with inline edit
   -------------------------------------------------------------------------- */

interface SpeechEntryProps {
  speech: CharacterSpeech;
  typeName: string;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}

function SpeechEntry({
  speech,
  typeName,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  saving,
}: SpeechEntryProps) {
  return (
    <div className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
      <div className="flex items-start gap-[var(--spacing-2)]">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            {typeName}_{speech.version}
          </span>
          {isEditing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                rows={4}
                className={TEXTAREA_BASE}
              />
              <div className="flex gap-[var(--spacing-1)]">
                <Button size="sm" onClick={onSaveEdit} loading={saving}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
              {speech.text}
            </p>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
            <button
              type="button"
              onClick={onStartEdit}
              className={ICON_ACTION_BTN}
              aria-label="Edit speech"
            >
              <Edit3 size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className={ICON_ACTION_BTN_DANGER}
              aria-label="Delete speech"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

