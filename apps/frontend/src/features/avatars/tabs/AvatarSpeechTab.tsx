/**
 * Avatar speech tab — manage speech entries grouped by type and language (PRD-124, PRD-136).
 *
 * Shows voice configuration badge, speech entries grouped by speech type and language
 * with inline editing, approval workflow, reordering, and deliverable generation.
 */

import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { useBulkImportSpeeches } from "@/features/projects/hooks/use-project-speech-import";
import { Check, Download, FileJson, MessageSquare, Plus, Upload } from "@/tokens/icons";

import { useAvatarSettings } from "../hooks/use-avatar-detail";
import { useAvatarSpeeches, useSpeechTypes } from "../hooks/use-avatar-speeches";
import { useLanguages } from "../hooks/use-languages";
import { useSpeechActions } from "../hooks/use-speech-actions";
import { getVoiceId } from "../types";
import type { BulkImportReport, AvatarSpeech, Language } from "../types";
import { AddSpeechModal } from "./AddSpeechModal";
import { LanguageFilterBar } from "./LanguageFilterBar";
import { SpeechImportModal } from "./SpeechImportModal";
import { SpeechTypeSection } from "./SpeechTypeSection";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarSpeechTabProps {
  avatarId: number;
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarSpeechTab({ avatarId, projectId }: AvatarSpeechTabProps) {
  const { data: settings } = useAvatarSettings(projectId, avatarId);
  const { data: speeches, isLoading: speechesLoading } = useAvatarSpeeches(avatarId);
  const { data: speechTypes, isLoading: typesLoading } = useSpeechTypes();
  const { data: languages } = useLanguages();
  const actions = useSpeechActions(avatarId);

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

    const groups = new Map<number, Map<number, AvatarSpeech[]>>();
    for (const s of filtered) {
      let typeGroup = groups.get(s.speech_type_id);
      if (!typeGroup) {
        typeGroup = new Map<number, AvatarSpeech[]>();
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

  // Speech drop analysis state
  interface ParsedEntry { type: string; language: string; text: string }
  interface DropAnalysis {
    format: "json" | "csv";
    data: string;
    isMultiModel: boolean;
    avatars: string[];
    entries: ParsedEntry[];
    existing: ParsedEntry[];
    newEntries: ParsedEntry[];
  }
  const [dropAnalysis, setDropAnalysis] = useState<DropAnalysis | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkImportReport | null>(null);
  const bulkImport = useBulkImportSpeeches(projectId);

  /** Parse speech entries from dropped file data. */
  const parseEntries = useCallback((format: "json" | "csv", data: string): { entries: ParsedEntry[]; avatars: string[] } => {
    const entries: ParsedEntry[] = [];
    const avatars: string[] = [];
    if (format === "json") {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const e of parsed) {
            if (e.type && e.text) entries.push({ type: e.type, language: e.language ?? "en", text: e.text });
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          for (const [slug, types] of Object.entries(parsed)) {
            avatars.push(slug);
            if (typeof types === "object" && types !== null) {
              for (const [typeName, langs] of Object.entries(types as Record<string, unknown>)) {
                if (typeof langs === "object" && langs !== null) {
                  for (const [lang, texts] of Object.entries(langs as Record<string, unknown>)) {
                    if (Array.isArray(texts)) {
                      for (const text of texts) {
                        if (typeof text === "string") entries.push({ type: typeName, language: lang, text });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch { /* ignore */ }
    } else {
      const lines = data.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length >= 2) {
        const slugs = new Set<string>();
        for (const line of lines.slice(1)) {
          const parts = line.split(",").map((p) => p.trim());
          if (parts.length >= 4) {
            slugs.add(parts[0]!);
            entries.push({ type: parts[1]!, language: parts[2]!, text: parts[3]! });
          } else if (parts.length >= 3) {
            entries.push({ type: "", language: parts[1]!, text: parts[2]! });
          }
        }
        avatars.push(...slugs);
      }
    }
    return { entries, avatars };
  }, []);

  /** Compare parsed entries against this avatar's existing speeches. */
  const analyzeEntries = useCallback((parsed: ParsedEntry[]): { existing: ParsedEntry[]; newEntries: ParsedEntry[] } => {
    // Build a set of existing speech keys matching on type+language+text.
    // Language can be matched by code ("en") or name ("English").
    const existingTexts = new Set<string>();
    for (const s of speeches ?? []) {
      const typeName = (typeMap.get(s.speech_type_id) ?? "").toLowerCase();
      const lang = languageMap.get(s.language_id);
      const text = s.text.toLowerCase();
      // Add both code-keyed and name-keyed versions for matching
      if (lang?.code) existingTexts.add(`${typeName}|${lang.code.toLowerCase()}|${text}`);
      if (lang?.name) existingTexts.add(`${typeName}|${lang.name.toLowerCase()}|${text}`);
    }
    const existing: ParsedEntry[] = [];
    const newEntries: ParsedEntry[] = [];
    for (const e of parsed) {
      const exactKey = `${e.type.toLowerCase()}|${e.language.toLowerCase()}|${e.text.toLowerCase()}`;
      if (existingTexts.has(exactKey)) {
        existing.push(e);
      } else {
        newEntries.push(e);
      }
    }
    return { existing, newEntries };
  }, [speeches, typeMap, languageMap]);

  /** Handle speech file drop — analyze and show confirmation. */
  const handleSpeechDrop = useCallback((format: "json" | "csv", data: string) => {
    const { entries, avatars } = parseEntries(format, data);
    const isMultiModel = avatars.length > 1;
    // Only compare against existing speeches for single-avatar imports.
    // Multi-model imports go to many avatars — per-entry comparison is misleading.
    const { existing, newEntries } = isMultiModel
      ? { existing: [] as ParsedEntry[], newEntries: entries }
      : analyzeEntries(entries);
    setDropAnalysis({ format, data, isMultiModel, avatars, entries, existing, newEntries });
    setBulkResult(null);
  }, [parseEntries, analyzeEntries]);

  if (speechesLoading || typesLoading) return <LoadingPane />;

  const isEmpty = !speeches || speeches.length === 0;

  return (
    <FileDropZone
      onNamesDropped={() => {}}
      onSpeechFileDropped={handleSpeechDrop}
    >
    <Stack gap={4}>
      {/* VoiceID status */}
      <div className="flex items-center rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs">
        <span className="uppercase tracking-wide text-[var(--color-text-muted)]">voice:</span>
        {voiceId ? (
          <span className="ml-1.5 text-cyan-400 truncate">{voiceId}</span>
        ) : (
          <span className="ml-1.5 text-orange-400">not configured</span>
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

      {/* Speech import analysis modal */}
      <Modal
        open={dropAnalysis !== null}
        onClose={() => setDropAnalysis(null)}
        title={dropAnalysis?.isMultiModel ? "Multi-Model Speech Import" : "Speech Import"}
        size="lg"
      >
        {dropAnalysis && !bulkResult && (
          <Stack gap={3}>
            {/* Summary */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <span><span className="text-cyan-400">{dropAnalysis.entries.length}</span> entries in file</span>
              {dropAnalysis.isMultiModel && (
                <>
                  <span className="text-white/20">|</span>
                  <span><span className="text-cyan-400">{dropAnalysis.avatars.length}</span> models</span>
                </>
              )}
              {!dropAnalysis.isMultiModel && dropAnalysis.existing.length > 0 && (
                <>
                  <span className="text-white/20">|</span>
                  <span><span className="text-green-400">{dropAnalysis.newEntries.length}</span> new</span>
                  <span className="text-white/20">|</span>
                  <span><span className="text-[var(--color-text-muted)]">{dropAnalysis.existing.length}</span> exist</span>
                </>
              )}
            </div>

            {/* Multi-model: avatar list */}
            {dropAnalysis.isMultiModel && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">models in file</p>
                <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                  {dropAnalysis.avatars.map((slug) => (
                    <div key={slug} className="px-2 py-0.5 font-mono text-xs text-[var(--color-text-primary)] border-b border-white/5 last:border-b-0 hover:bg-[#161b22]">
                      {slug}
                    </div>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-[var(--color-text-muted)] mt-1">
                  Existing speeches will be checked per-model on the server. Duplicates are automatically skipped.
                </p>
              </div>
            )}

            {/* Single-model: entry preview */}
            {!dropAnalysis.isMultiModel && (
              <>
                {dropAnalysis.newEntries.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-green-400 mb-1">
                      new ({dropAnalysis.newEntries.length})
                    </p>
                    <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                      {dropAnalysis.newEntries.slice(0, 50).map((e, i) => (
                        <div key={i} className="px-2 py-0.5 font-mono text-xs border-b border-white/5 last:border-b-0 hover:bg-[#161b22] flex items-center gap-2">
                          {e.type && <span className="text-cyan-400 shrink-0 w-20 truncate">{e.type}</span>}
                          <span className="text-[var(--color-text-muted)] shrink-0 w-8">{e.language}</span>
                          <span className="text-[var(--color-text-primary)] truncate">{e.text}</span>
                        </div>
                      ))}
                      {dropAnalysis.newEntries.length > 50 && (
                        <div className="px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                          …and {dropAnalysis.newEntries.length - 50} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {dropAnalysis.existing.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                      already exist ({dropAnalysis.existing.length})
                    </p>
                    <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                      {dropAnalysis.existing.slice(0, 20).map((e, i) => (
                        <div key={i} className="px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)] border-b border-white/5 last:border-b-0 flex items-center gap-2">
                          {e.type && <span className="shrink-0 w-20 truncate">{e.type}</span>}
                          <span className="shrink-0 w-8">{e.language}</span>
                          <span className="truncate">{e.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Entries preview (multi-model) */}
            {dropAnalysis.isMultiModel && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                  entries ({dropAnalysis.entries.length})
                </p>
                <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                  {dropAnalysis.entries.slice(0, 50).map((e, i) => (
                    <div key={i} className="px-2 py-0.5 font-mono text-xs border-b border-white/5 last:border-b-0 hover:bg-[#161b22] flex items-center gap-2">
                      {e.type && <span className="text-cyan-400 shrink-0 w-20 truncate">{e.type}</span>}
                      <span className="text-[var(--color-text-muted)] shrink-0 w-8">{e.language}</span>
                      <span className="text-[var(--color-text-primary)] truncate">{e.text}</span>
                    </div>
                  ))}
                  {dropAnalysis.entries.length > 50 && (
                    <div className="px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                      …and {dropAnalysis.entries.length - 50} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-default)]">
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {dropAnalysis.isMultiModel
                  ? `${dropAnalysis.entries.length} entries across ${dropAnalysis.avatars.length} models`
                  : `${dropAnalysis.newEntries.length} new · ${dropAnalysis.existing.length} existing`}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDropAnalysis(null)}>
                  Cancel
                </Button>
                {dropAnalysis.isMultiModel ? (
                  <Button
                    size="sm"
                    loading={bulkImport.isPending}
                    onClick={() => {
                      bulkImport.mutate(
                        { format: dropAnalysis.format, data: dropAnalysis.data, skip_existing: true },
                        { onSuccess: (result) => setBulkResult(result) },
                      );
                    }}
                  >
                    Add Missing
                  </Button>
                ) : (
                  <>
                    {dropAnalysis.existing.length > 0 && dropAnalysis.newEntries.length > 0 && (
                      <Button
                        size="sm"
                        loading={actions.importSpeeches.isPending}
                        onClick={() => {
                          const filtered = dropAnalysis.newEntries.map((e) => ({ type: e.type, text: e.text, language: e.language }));
                          actions.handleImport({ format: "json", data: JSON.stringify(filtered) });
                          setDropAnalysis(null);
                        }}
                      >
                        Add Missing ({dropAnalysis.newEntries.length})
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={dropAnalysis.existing.length > 0 ? "secondary" : "primary"}
                      loading={actions.importSpeeches.isPending}
                      onClick={() => {
                        actions.handleImport({ format: dropAnalysis.format, data: dropAnalysis.data });
                        setDropAnalysis(null);
                      }}
                    >
                      Import All ({dropAnalysis.entries.length})
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Stack>
        )}
        {bulkResult && (
          <Stack gap={3}>
            {/* Counts */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <span><span className="text-green-400">{bulkResult.imported}</span> imported</span>
              {bulkResult.skipped > 0 && (
                <>
                  <span className="text-white/20">|</span>
                  <span><span className="text-[var(--color-text-muted)]">{bulkResult.skipped}</span> skipped</span>
                </>
              )}
            </div>

            {/* Matched models — one per line */}
            {bulkResult.avatars_matched.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                  matched ({bulkResult.avatars_matched.length})
                </p>
                <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                  {bulkResult.avatars_matched.map((name) => (
                    <div key={name} className="px-2 py-0.5 font-mono text-xs text-cyan-400 border-b border-white/5 last:border-b-0">
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched models — one per line */}
            {bulkResult.avatars_unmatched.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-orange-400 mb-1">
                  unmatched ({bulkResult.avatars_unmatched.length})
                </p>
                <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                  {bulkResult.avatars_unmatched.map((name) => (
                    <div key={name} className="px-2 py-0.5 font-mono text-xs text-orange-400 border-b border-white/5 last:border-b-0">
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {bulkResult.errors.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-red-400 mb-1">
                  errors ({bulkResult.errors.length})
                </p>
                <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
                  {bulkResult.errors.map((e, i) => (
                    <div key={i} className="px-2 py-0.5 font-mono text-xs text-red-400 border-b border-white/5 last:border-b-0">
                      {e}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button size="sm" onClick={() => { setDropAnalysis(null); setBulkResult(null); }}>
                Done
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
    </FileDropZone>
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
      <Button size="xs" icon={<Plus size={12} />} onClick={onAdd}>
        Add Speech
      </Button>
      <Button size="xs" variant="secondary" icon={<Upload size={12} />} onClick={onImport}>
        Import
      </Button>
      <Button
        size="xs"
        variant="secondary"
        icon={<Check size={12} />}
        onClick={onBulkApprove}
        disabled={isEmpty || bulkApproving}
        loading={bulkApproving}
      >
        Bulk Approve
      </Button>
      <Button
        size="xs"
        variant="secondary"
        icon={<FileJson size={12} />}
        onClick={onDeliverable}
        disabled={isEmpty || generating}
        loading={generating}
      >
        Deliverable
      </Button>
      <div className="flex items-center gap-[var(--spacing-1)] ml-auto">
        <Button
          size="xs"
          variant="secondary"
          icon={<Download size={12} />}
          onClick={() => onExport("csv")}
          disabled={isEmpty || exporting}
        >
          CSV
        </Button>
        <Button
          size="xs"
          variant="secondary"
          icon={<Download size={12} />}
          onClick={() => onExport("json")}
          disabled={isEmpty || exporting}
        >
          JSON
        </Button>
      </div>
    </div>
  );
}
