/**
 * Avatar detail page with tabbed sub-views (PRD-112).
 *
 * Shows breadcrumb (Projects > Project Name > Avatar Name),
 * avatar header with status badge, and tabbed content.
 */

import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteModal, Modal, Tabs } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { useAvatarImport } from "@/features/projects/hooks/use-avatar-import";
import { ImportConfirmModal } from "@/features/projects/components/ImportConfirmModal";
import { useBulkImportSpeeches } from "@/features/projects/hooks/use-project-speech-import";
import { SpeechImportResultModal } from "@/features/projects/components/SpeechImportResultModal";
import { FileAssignmentModal } from "./components";
import type { BulkImportReport } from "./types";
import { Button, FlagIcon, LoadingPane, Tooltip } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

import { AlertCircle, ChevronLeft, ChevronRight, Edit3, Power, User } from "@/tokens/icons";

import { useAvatarDashboard } from "@/features/avatar-dashboard";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { pickAvatarUrl } from "@/features/images/utils";
import { AvatarEditModal } from "@/features/projects/components/AvatarEditModal";
import { useAvatarGroups } from "@/features/projects/hooks/use-avatar-groups";
import {
  useAvatar,
  useDeleteAvatar,
  useProjectAvatars,
  useToggleAvatarEnabled,
  useUpdateAvatar,
} from "@/features/projects/hooks/use-project-avatars";
import { useProject } from "@/features/projects/hooks/use-projects";
import {
  CHARACTER_TABS,
  type UpdateAvatar,
  avatarStatusBadgeVariant,
  avatarStatusLabel,
} from "@/features/projects/types";
import { ReviewStatusBadge, AvatarReviewControls, AvatarReviewAuditLog, REVIEW_STATUS_MAP } from "@/features/avatar-review";

import { useSpeechCompleteness } from "./hooks/use-avatar-speeches";
import { useLanguages } from "./hooks/use-languages";
import { AvatarDeliverablesTab } from "./tabs/AvatarDeliverablesTab";
import { AvatarImagesTab } from "./tabs/AvatarImagesTab";
import { AvatarMetadataTab } from "./tabs/AvatarMetadataTab";
import { AvatarOverviewTab } from "./tabs/AvatarOverviewTab";
import { AvatarScenesTab } from "./tabs/AvatarScenesTab";
import { AvatarSettingsTab } from "./tabs/AvatarSettingsTab";
import { AvatarSpeechTab } from "./tabs/AvatarSpeechTab";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarDetailPage() {
  const params = useParams({ strict: false }) as {
    projectId: string;
    avatarId: string;
  };
  const projectId = Number(params.projectId);
  const avatarId = Number(params.avatarId);

  const navigate = useNavigate();
  const { tab: tabParam, scene: sceneParam, scene_type: sceneTypeParam, track: trackParam } = useSearch({ strict: false }) as { tab?: string; scene?: string; scene_type?: string; track?: string };

  const { data: project } = useProject(projectId);
  const { data: avatar, isLoading, error } = useAvatar(projectId, avatarId);
  const { data: avatars } = useProjectAvatars(projectId);
  const { data: groups } = useAvatarGroups(projectId);
  const { data: variants } = useImageVariants(avatarId);
  const { data: dashboard } = useAvatarDashboard(avatarId);
  const { data: speechCompleteness } = useSpeechCompleteness(avatarId);
  const { data: allLanguages } = useLanguages();
  const updateAvatar = useUpdateAvatar(projectId);
  const deleteAvatar = useDeleteAvatar(projectId);
  const toggleEnabled = useToggleAvatarEnabled(projectId);

  useSetPageTitle(avatar?.name ?? "Model");

  /* --- speech language summary for header flags --- */
  const speechLanguageSummary = useMemo(() => {
    if (!speechCompleteness?.breakdown || !allLanguages) return [];
    const langCounts = new Map<number, number>();
    for (const entry of speechCompleteness.breakdown) {
      langCounts.set(entry.language_id, (langCounts.get(entry.language_id) ?? 0) + entry.approved);
    }
    return Array.from(langCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([langId, count]) => {
        const lang = allLanguages.find((l) => l.id === langId);
        return lang ? { flagCode: lang.flag_code, languageCode: lang.code, count } : null;
      })
      .filter(Boolean) as { flagCode: string; languageCode: string; count: number }[];
  }, [speechCompleteness, allLanguages]);

  const validTabIds = CHARACTER_TABS.map((t) => t.id) as readonly string[];
  const activeTab = tabParam && validTabIds.includes(tabParam) ? tabParam : CHARACTER_TABS[0].id;

  function setActiveTab(tab: string) {
    navigate({
      to: `/projects/${projectId}/avatars/${avatarId}`,
      search: { tab },
    });
  }

  /* --- prev/next avatar navigation --- */
  const { prevId, nextId, currentIndex, totalCount } = useMemo(() => {
    if (!avatars || avatars.length === 0) {
      return { prevId: null, nextId: null, currentIndex: -1, totalCount: 0 };
    }
    const groupNameMap = new Map<number, string>();
    if (groups) {
      for (const g of groups) groupNameMap.set(g.id, g.name);
    }
    const sorted = [...avatars].sort((a, b) => {
      // Sort by group name alphabetically first; ungrouped avatars go last
      const aName = a.group_id != null ? (groupNameMap.get(a.group_id) ?? "") : "\uffff";
      const bName = b.group_id != null ? (groupNameMap.get(b.group_id) ?? "") : "\uffff";
      const groupCmp = aName.localeCompare(bName);
      if (groupCmp !== 0) return groupCmp;
      return a.name.localeCompare(b.name);
    });
    const idx = sorted.findIndex((c) => c.id === avatarId);
    return {
      prevId: idx > 0 ? sorted[idx - 1]!.id : null,
      nextId: idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
      currentIndex: idx,
      totalCount: sorted.length,
    };
  }, [avatars, avatarId, groups]);

  function navigateToAvatar(targetId: number) {
    navigate({ to: `/projects/${projectId}/avatars/${targetId}`, search: { tab: activeTab } });
  }

  /* --- scene focus state (auto-open scene detail modal) --- */
  const [focusSceneId, setFocusSceneId] = useState<number | undefined>(
    sceneParam ? Number(sceneParam) : undefined,
  );
  const focusSceneTypeId = sceneTypeParam ? Number(sceneTypeParam) : undefined;
  const focusTrackId = trackParam ? Number(trackParam) : undefined;

  /* --- resolved blocking deliverables (avatar → group → project → default) --- */
  const resolvedBlockingDeliverables = useMemo(() => {
    if (avatar?.blocking_deliverables) return avatar.blocking_deliverables;
    if (avatar?.group_id) {
      const group = groups?.find((g) => g.id === avatar.group_id);
      if (group?.blocking_deliverables) return group.blocking_deliverables;
    }
    if (project?.blocking_deliverables) return project.blocking_deliverables;
    return ["metadata", "images", "scenes"];
  }, [avatar?.blocking_deliverables, avatar?.group_id, groups, project?.blocking_deliverables]);

  /* --- folder drop (avatar import) --- */
  const { data: projectAvatars } = useProjectAvatars(projectId);
  const charImport = useAvatarImport(projectId, projectAvatars);

  /* --- speech file drop --- */
  const bulkSpeechImport = useBulkImportSpeeches(projectId);
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

  /* --- edit/delete modal state --- */
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleSaveEdit(charId: number, data: UpdateAvatar) {
    updateAvatar.mutate({ avatarId: charId, data }, { onSuccess: () => setEditOpen(false) });
  }

  function handleDelete() {
    if (!avatar) return;
    deleteAvatar.mutate(avatar.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setEditOpen(false);
        navigate({ to: `/projects/${projectId}` });
      },
    });
  }

  if (isLoading) {
    return <LoadingPane />;
  }

  if (error || !avatar) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} />}
        title="Avatar not found"
        description="The requested model could not be loaded."
      />
    );
  }

  const statusLabel = avatarStatusLabel(avatar.status_id);
  const badgeVariant = avatarStatusBadgeVariant(avatar.status_id);
  const avatarUrl = pickAvatarUrl(variants ?? []);
  const groupName = avatar.group_id
    ? groups?.find((g) => g.id === avatar.group_id)?.name
    : undefined;

  return (
    <FileDropZone
      onNamesDropped={() => {}}
      onFolderDropped={charImport.handleFolderDrop}
      onSpeechFileDropped={handleSpeechFileDrop}
    >
    <Stack gap={6}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-[var(--spacing-1)] text-xs font-mono text-[var(--color-text-muted)]">
        <Link to="/projects" className="hover:text-cyan-400 transition-colors">
          projects
        </Link>
        <ChevronRight size={12} aria-hidden className="opacity-40" />
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(projectId) }}
          search={{ tab: undefined, group: undefined }}
          className="hover:text-cyan-400 transition-colors"
        >
          {project?.name?.toLowerCase() ?? `project ${projectId}`}
        </Link>
        {groupName && avatar.group_id != null && (
          <>
            <ChevronRight size={12} aria-hidden className="opacity-40" />
            <Link
              to="/projects/$projectId"
              params={{ projectId: String(projectId) }}
              search={{ tab: "avatars", group: String(avatar.group_id) }}
              className="hover:text-cyan-400 transition-colors"
            >
              {groupName.toLowerCase()}
            </Link>
          </>
        )}
        <ChevronRight size={12} aria-hidden className="opacity-40" />
        <span className="text-[var(--color-text-primary)]">{avatar.name.toLowerCase()}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)]">
        {avatarUrl ? (
          <button
            type="button"
            className="h-7 w-7 rounded-full overflow-hidden cursor-pointer shrink-0"
            onClick={() => setActiveTab("images")}
            aria-label="View images"
          >
            <img
              src={avatarUrl}
              alt={avatar.name}
              className="h-7 w-7 rounded-full object-cover"
            />
          </button>
        ) : (
          <User size={20} className="text-[var(--color-text-muted)]" aria-hidden />
        )}
        <span className={`text-xs font-mono font-semibold ${
          badgeVariant === "success" ? "text-green-400"
          : badgeVariant === "danger" ? "text-red-400"
          : badgeVariant === "warning" ? "text-orange-400"
          : "text-cyan-400"
        }`}>
          {statusLabel.toLowerCase()}
        </span>
        <span className="text-[var(--color-text-muted)] opacity-30 font-mono">|</span>
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(projectId) }}
          search={{ tab: "avatars", group: avatar.group_id != null ? String(avatar.group_id) : undefined }}
          className="text-xs font-mono text-[var(--color-text-muted)] hover:text-cyan-400 transition-colors"
        >
          {groupName?.toLowerCase() ?? "ungrouped"}
        </Link>
        {avatar.review_status_id > 1 && (
          <>
            <span className="text-[var(--color-text-muted)] opacity-30 font-mono">|</span>
            <ReviewStatusBadge
              status={REVIEW_STATUS_MAP[avatar.review_status_id] ?? "unassigned"}
              size="sm"
            />
          </>
        )}
        {dashboard?.readiness && (
          <>
            <span className="text-[var(--color-text-muted)] opacity-30 font-mono">|</span>
            <span className={`text-xs font-mono ${
              dashboard.readiness.readiness_pct >= 100 ? "text-green-400" : "text-cyan-400"
            }`}>
              {dashboard.readiness.readiness_pct}%
            </span>
          </>
        )}
        {speechLanguageSummary.length > 0 && (
          <>
            <span className="text-[var(--color-text-muted)] opacity-30 font-mono">|</span>
            <div className="flex items-center gap-1">
              {speechLanguageSummary.map((lang) => (
                <Tooltip key={lang.languageCode} content={`${lang.languageCode.toUpperCase()}: ${lang.count} approved`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setActiveTab("speech")}
                    aria-label={`${lang.languageCode.toUpperCase()} speech`}
                  >
                    <FlagIcon flagCode={lang.flagCode} size={10} />
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{lang.count}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-0.5"
          onClick={() => setEditOpen(true)}
          aria-label="Edit avatar"
        >
          <Edit3 size={14} aria-hidden />
        </button>
        <Button
          size="xs"
          variant={avatar.is_enabled ? "secondary" : "primary"}
          icon={<Power size={12} />}
          onClick={() => toggleEnabled.mutate({ avatarId, isEnabled: !avatar.is_enabled })}
          loading={toggleEnabled.isPending}
        >
          {avatar.is_enabled ? "Disable" : "Enable"}
        </Button>

        {/* Prev / Next avatar navigation */}
        {totalCount > 1 && (
          <div className="flex items-center gap-[var(--spacing-1)] ml-auto">
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
              {currentIndex + 1}/{totalCount}
            </span>
            <Button
              variant="secondary"
              size="xs"
              icon={<ChevronLeft size={12} />}
              disabled={prevId === null}
              onClick={() => prevId !== null && navigateToAvatar(prevId)}
              aria-label="Previous avatar"
            />
            <Button
              variant="secondary"
              size="xs"
              icon={<ChevronRight size={12} />}
              disabled={nextId === null}
              onClick={() => nextId !== null && navigateToAvatar(nextId)}
              aria-label="Next avatar"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={CHARACTER_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pill"
      />

      {/* Tab content — key on avatarId to reset state when navigating between avatars */}
      {activeTab === "overview" && (
        <AvatarOverviewTab
          key={avatarId}
          avatar={avatar}
          avatarId={avatarId}
          projectId={projectId}
          blockingDeliverables={resolvedBlockingDeliverables}
          onSceneClick={(sceneId) => { setFocusSceneId(sceneId); setActiveTab("scenes"); }}
        />
      )}
      {activeTab === "images" && (
        <div className={!avatar.is_enabled ? "opacity-70 grayscale" : ""}>
          <AvatarImagesTab key={avatarId} avatarId={avatarId} />
        </div>
      )}
      {activeTab === "scenes" && (
        <div className={!avatar.is_enabled ? "opacity-70 grayscale" : ""}>
          <AvatarScenesTab key={avatarId} avatarId={avatarId} projectId={projectId} focusSceneId={focusSceneId} focusSceneTypeId={focusSceneTypeId} focusTrackId={focusTrackId} avatarEnabled={avatar.is_enabled} />
        </div>
      )}
      {activeTab === "deliverables" && (
        <AvatarDeliverablesTab
          key={avatarId}
          avatarId={avatarId}
          projectId={projectId}
          avatarName={avatar.name}
          projectName={project?.name ?? ""}
        />
      )}
      {activeTab === "metadata" && <AvatarMetadataTab key={avatarId} avatarId={avatarId} projectId={projectId} />}
      {activeTab === "speech" && <AvatarSpeechTab key={avatarId} avatarId={avatarId} projectId={projectId} />}
      {activeTab === "review" && <AvatarReviewAuditLog key={avatarId} avatarId={avatarId} />}
      {activeTab === "settings" && (
        <AvatarSettingsTab
          key={avatarId}
          projectId={projectId}
          avatarId={avatarId}
          avatarName={avatar.name}
          blockingDeliverables={avatar.blocking_deliverables}
          parentBlockingDeliverables={resolvedBlockingDeliverables}
          onUpdateBlockingDeliverables={(next) =>
            updateAvatar.mutate({ avatarId, data: { blocking_deliverables: next } })
          }
        />
      )}

      {/* Edit avatar modal */}
      <AvatarEditModal
        avatar={editOpen ? avatar : null}
        projectId={projectId}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveEdit}
        saving={updateAvatar.isPending}
        onDeleteRequest={() => setDeleteOpen(true)}
      />

      {/* Delete avatar confirmation */}
      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Model"
        entityName={avatar.name}
        onConfirm={handleDelete}
        loading={deleteAvatar.isPending}
      />

      {/* Review controls sticky footer */}
      <AvatarReviewControls
        avatarId={avatarId}
        reviewStatusId={avatar.review_status_id}
      />

      {/* Speech import confirmation */}
      {speechImport && (
        <Modal open onClose={() => setSpeechImport(null)} title="Import Speeches" size="md">
          <Stack gap={3}>
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              Detected <span className="text-cyan-400">{speechImport.format.toUpperCase()}</span> speech file.
              Existing duplicates will be skipped automatically.
            </p>
            <div className="flex gap-2 justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button variant="secondary" size="sm" onClick={() => setSpeechImport(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSpeechImportConfirm} loading={bulkSpeechImport.isPending}>
                Import
              </Button>
            </div>
          </Stack>
        </Modal>
      )}

      {/* Speech import result */}
      {speechImportResult && (
        <SpeechImportResultModal
          open
          onClose={() => setSpeechImportResult(null)}
          result={speechImportResult}
        />
      )}

      {/* Avatar import from folder drop */}
      <ImportConfirmModal
        open={charImport.importOpen}
        onClose={charImport.closeImport}
        names={charImport.importNames}
        payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
        projectId={projectId}
        projectName={project?.name}
        existingNames={projectAvatars?.map((c) => c.name) ?? []}
        avatars={projectAvatars ?? []}
        onConfirm={charImport.handleImportConfirm}
        onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
        loading={charImport.bulkCreatePending}
        importProgress={charImport.importProgress}
        onAbort={charImport.abortImport}
        detectedProjectName={charImport.importResult?.detectedProjectName}
        existingGroupNames={groups?.map((g) => g.name) ?? []}
        hashSummary={charImport.hashSummary}
      />

      {/* File assignment modal (unmatched files) */}
      <FileAssignmentModal
        open={charImport.unmatchedFiles.length > 0}
        onClose={charImport.dismissUnmatchedFiles}
        unmatchedFiles={charImport.unmatchedFiles}
        onConfirm={(assignments) => charImport.resolveUnmatchedFiles(assignments)}
      />
    </Stack>
    </FileDropZone>
  );
}
