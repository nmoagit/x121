/**
 * Project overview tab showing stats and quick actions (PRD-112).
 */

import { useCallback, useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { FileDropZone, StatTicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { FileAssignmentModal } from "@/features/avatars/components";
import type { BulkImportReport } from "@/features/avatars/types";
import {
  TERMINAL_HEADER_TITLE,
} from "@/lib/ui-classes";

import { AvatarDeliverablesGrid } from "../components/AvatarDeliverablesGrid";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import { ImportProgressBar } from "../components/ImportProgressBar";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useAvatarImport } from "../hooks/use-avatar-import";
import { useProjectAvatars } from "../hooks/use-project-avatars";
import { SpeechImportResultModal } from "../components/SpeechImportResultModal";
import { VoiceImportConfirmModal, VoiceImportResultModal } from "../components/VoiceImportModals";
import { useBulkImportSpeeches } from "../hooks/use-project-speech-import";
import { useVoiceImportFlow } from "../hooks/use-voice-import-flow";
import type { ProjectStats } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectOverviewTabProps {
  projectId: number;
  stats?: ProjectStats;
}

export function ProjectOverviewTab({ projectId, stats }: ProjectOverviewTabProps) {
  const pipelineCtx = usePipelineContextSafe();
  const charImport = useAvatarImport(projectId, undefined, pipelineCtx?.pipelineId);
  const { data: avatars } = useProjectAvatars(projectId);
  const existingNames = avatars?.map((c) => c.name) ?? [];
  const bulkSpeechImport = useBulkImportSpeeches(projectId);

  /* --- speech import from dropped file --- */
  const [speechImport, setSpeechImport] = useState<{ format: "json" | "csv"; data: string } | null>(null);
  const [speechImportResult, setSpeechImportResult] = useState<BulkImportReport | null>(null);

  const handleSpeechFileDrop = useCallback((format: "json" | "csv", data: string) => {
    setSpeechImport({ format, data });
    setSpeechImportResult(null);
  }, []);

  function handleSpeechImportConfirm() {
    if (!speechImport) return;
    bulkSpeechImport.mutate(
      { format: speechImport.format, data: speechImport.data, skip_existing: true },
      {
        onSuccess: (result) => {
          setSpeechImportResult(result);
          setSpeechImport(null);
        },
      },
    );
  }

  /* --- voice ID import from dropped CSV --- */
  const voiceFlow = useVoiceImportFlow(projectId, avatars ?? []);

  if (!stats) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-4)]">
        Loading project statistics...
      </p>
    );
  }

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      onFolderDropped={charImport.handleFolderDrop}
      onSpeechFileDropped={handleSpeechFileDrop}
      onVoiceFileDropped={voiceFlow.handleVoiceFileDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
    <Stack gap={6}>
      {/* Avatar stats ticker */}
      <StatTicker stats={[
        { label: "Avatars", value: `${stats.avatars_ready}/${stats.avatar_count}`, tooltip: `${stats.avatars_ready} ready / ${stats.avatar_count} total`, complete: stats.avatar_count > 0 && stats.avatars_ready >= stats.avatar_count },
        { label: "Draft", value: stats.avatars_draft },
        { label: "Active", value: stats.avatars_active, complete: stats.avatars_active > 0 },
      ]} />

      {/* Scene stats ticker */}
      <StatTicker stats={[
        { label: "Scene Types", value: stats.scenes_enabled, tooltip: "Enabled scene types for this project" },
        { label: "Approved", value: stats.scenes_approved, complete: stats.scenes_approved > 0 },
        { label: "Generated", value: stats.scenes_generated },
        { label: "Rejected", value: stats.scenes_rejected },
        { label: "Pending", value: stats.scenes_pending },
      ]} />

      {/* Delivery readiness ticker */}
      <StatTicker stats={[
        {
          label: "Readiness",
          value: `${stats.delivery_readiness_pct.toFixed(1)}%`,
          complete: stats.delivery_readiness_pct >= 100,
        },
      ]} />

      {/* Per-avatar deliverables grid */}
      <div>
        <h2 className={`${TERMINAL_HEADER_TITLE} mb-[var(--spacing-3)]`}>
          Model Deliverables
        </h2>
        <AvatarDeliverablesGrid projectId={projectId} />
      </div>
    </Stack>

    {charImport.importProgress && charImport.importProgress.phase !== "done" && (
      <ImportProgressBar progress={charImport.importProgress} />
    )}

    <FileAssignmentModal
      open={charImport.unmatchedFiles.length > 0}
      onClose={charImport.dismissUnmatchedFiles}
      unmatchedFiles={charImport.unmatchedFiles}
      onConfirm={(assignments) => charImport.resolveUnmatchedFiles(assignments)}
    />

    <ImportConfirmModal
      open={charImport.importOpen}
      onClose={charImport.closeImport}
      names={charImport.importNames}
      payloads={charImport.importPayloads}
      projectId={projectId}
      existingNames={existingNames}
      avatars={avatars}
      onConfirm={charImport.handleImportConfirm}
      onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
      loading={charImport.bulkCreatePending}
      importProgress={charImport.importProgress}
      onAbort={charImport.abortImport}
      detectedProjectName={charImport.importResult?.detectedProjectName}
      existingGroupNames={charImport.importResult ? [...charImport.importResult.groupedPayloads.keys()].filter(Boolean) : undefined}
      hashSummary={charImport.hashSummary}
    />
    {/* Speech file import confirmation */}
    <ConfirmModal
      open={speechImport !== null}
      onClose={() => setSpeechImport(null)}
      title="Import Speech File"
      confirmLabel="Import"
      confirmVariant="primary"
      loading={bulkSpeechImport.isPending}
      onConfirm={handleSpeechImportConfirm}
    >
      {(() => {
        if (!speechImport) return null;
        try {
          const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

          // Build flat rows from either JSON or CSV
          type Row = { charSlug: string; type: string; lang: string; count: number; matched: boolean };
          const rows: Row[] = [];

          if (speechImport.format === "json") {
            const parsed = JSON.parse(speechImport.data) as Record<string, unknown>;
            for (const [charSlug, typesVal] of Object.entries(parsed)) {
              const matched = avatars?.some((c) => slugify(c.name) === slugify(charSlug)) ?? false;
              for (const [typeName, langsVal] of Object.entries(typesVal as Record<string, unknown>)) {
                for (const [langName, textsVal] of Object.entries(langsVal as Record<string, unknown>)) {
                  const count = Array.isArray(textsVal) ? textsVal.length : 0;
                  if (count > 0) rows.push({ charSlug, type: typeName, lang: langName, count, matched });
                }
              }
            }
          } else {
            // CSV: already normalised to 4-col format
            const lines = speechImport.data.split(/\r?\n/).filter((l) => l.trim());
            const counts = new Map<string, Row>();
            for (const line of lines.slice(1)) {
              const parts = line.match(/^([^,]*),([^,]*),([^,]*),(.*)$/);
              if (!parts) continue;
              const key = `${parts[1]}|${parts[2]}|${parts[3]}`;
              const existing = counts.get(key);
              if (existing) {
                existing.count += 1;
              } else {
                const charSlug = parts[1]!;
                counts.set(key, {
                  charSlug,
                  type: parts[2]!,
                  lang: parts[3]!,
                  count: 1,
                  matched: avatars?.some((c) => slugify(c.name) === slugify(charSlug)) ?? false,
                });
              }
            }
            rows.push(...counts.values());
          }

          const matchedCount = new Set(rows.filter((r) => r.matched).map((r) => r.charSlug)).size;
          const totalChars = new Set(rows.map((r) => r.charSlug)).size;
          const totalEntries = rows.reduce((sum, r) => sum + r.count, 0);

          return (
            <Stack gap={2}>
              <p className="text-xs font-mono">
                <span className="text-[var(--color-text-primary)]">{totalChars}</span> avatars, <span className="text-[var(--color-text-primary)]">{rows.length}</span> combinations, <span className="text-[var(--color-text-primary)]">{totalEntries}</span> entries total.
                {" "}<span className="text-[var(--color-text-muted)]">(<span className="text-green-400">{matchedCount} matched</span>, <span className="text-orange-400">{totalChars - matchedCount} unmatched</span>)</span>
              </p>
              <div className="max-h-80 overflow-y-auto rounded border border-[var(--color-border-default)]">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-[#161b22]">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Avatar</th>
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Speech Type</th>
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Language</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Entries</th>
                      <th className="text-center px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-[#161b22]">
                        <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.charSlug}</td>
                        <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.type}</td>
                        <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.lang}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-primary)]">{row.count}</td>
                        <td className="px-2 py-1 text-center">
                          <span className={row.matched ? "text-green-400" : "text-orange-400"}>
                            {row.matched ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Stack>
          );
        } catch {
          return <p>Invalid file data.</p>;
        }
      })()}
    </ConfirmModal>

    {/* Speech import result */}
    {speechImportResult && (
      <SpeechImportResultModal
        open
        onClose={() => setSpeechImportResult(null)}
        result={speechImportResult}
      />
    )}

    {/* Voice ID import */}
    {voiceFlow.voiceImport && (
      <VoiceImportConfirmModal
        open
        onClose={() => voiceFlow.setVoiceImport(null)}
        entries={voiceFlow.voiceImport}
        avatars={avatars ?? []}
        mode={voiceFlow.voiceImportMode}
        onModeChange={voiceFlow.setVoiceImportMode}
        loading={voiceFlow.bulkVoiceImport.isPending}
        onConfirm={voiceFlow.handleVoiceImportConfirm}
      />
    )}
    <VoiceImportResultModal
      result={voiceFlow.voiceImportResult}
      onClose={() => voiceFlow.setVoiceImportResult(null)}
    />

    </FileDropZone>
  );
}
