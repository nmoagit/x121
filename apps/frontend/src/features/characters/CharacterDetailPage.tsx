/**
 * Character detail page with tabbed sub-views (PRD-112).
 *
 * Shows breadcrumb (Projects > Project Name > Character Name),
 * character header with status badge, and tabbed content.
 */

import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ConfirmDeleteModal, Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, FlagIcon, LoadingPane, Tooltip } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { ICON_ACTION_BTN } from "@/lib/ui-classes";
import { AlertCircle, ChevronLeft, ChevronRight, Edit3, Power, User } from "@/tokens/icons";

import { useCharacterDashboard } from "@/features/character-dashboard";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { pickAvatarUrl } from "@/features/images/utils";
import { CharacterEditModal } from "@/features/projects/components/CharacterEditModal";
import { useCharacterGroups } from "@/features/projects/hooks/use-character-groups";
import {
  useCharacter,
  useDeleteCharacter,
  useProjectCharacters,
  useToggleCharacterEnabled,
  useUpdateCharacter,
} from "@/features/projects/hooks/use-project-characters";
import { useProject } from "@/features/projects/hooks/use-projects";
import {
  CHARACTER_TABS,
  type UpdateCharacter,
  characterStatusBadgeVariant,
  characterStatusLabel,
} from "@/features/projects/types";
import { ReadinessStateBadge } from "@/features/readiness/ReadinessStateBadge";
import type { ReadinessState } from "@/features/readiness/types";
import { ReviewStatusBadge, CharacterReviewControls, CharacterReviewAuditLog, REVIEW_STATUS_MAP } from "@/features/character-review";

import { useSpeechCompleteness } from "./hooks/use-character-speeches";
import { useLanguages } from "./hooks/use-languages";
import { CharacterDeliverablesTab } from "./tabs/CharacterDeliverablesTab";
import { CharacterImagesTab } from "./tabs/CharacterImagesTab";
import { CharacterMetadataTab } from "./tabs/CharacterMetadataTab";
import { CharacterOverviewTab } from "./tabs/CharacterOverviewTab";
import { CharacterScenesTab } from "./tabs/CharacterScenesTab";
import { CharacterSettingsTab } from "./tabs/CharacterSettingsTab";
import { CharacterSpeechTab } from "./tabs/CharacterSpeechTab";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterDetailPage() {
  const params = useParams({ strict: false }) as {
    projectId: string;
    characterId: string;
  };
  const projectId = Number(params.projectId);
  const characterId = Number(params.characterId);

  const navigate = useNavigate();
  const { tab: tabParam, scene: sceneParam, scene_type: sceneTypeParam, track: trackParam } = useSearch({ strict: false }) as { tab?: string; scene?: string; scene_type?: string; track?: string };

  const { data: project } = useProject(projectId);
  const { data: character, isLoading, error } = useCharacter(projectId, characterId);
  const { data: characters } = useProjectCharacters(projectId);
  const { data: groups } = useCharacterGroups(projectId);
  const { data: variants } = useImageVariants(characterId);
  const { data: dashboard } = useCharacterDashboard(characterId);
  const { data: speechCompleteness } = useSpeechCompleteness(characterId);
  const { data: allLanguages } = useLanguages();
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);
  const toggleEnabled = useToggleCharacterEnabled(projectId);

  useSetPageTitle(character?.name ?? "Model");

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
      to: `/projects/${projectId}/models/${characterId}`,
      search: { tab },
    });
  }

  /* --- prev/next character navigation --- */
  const { prevId, nextId, currentIndex, totalCount } = useMemo(() => {
    if (!characters || characters.length === 0) {
      return { prevId: null, nextId: null, currentIndex: -1, totalCount: 0 };
    }
    const groupNameMap = new Map<number, string>();
    if (groups) {
      for (const g of groups) groupNameMap.set(g.id, g.name);
    }
    const sorted = [...characters].sort((a, b) => {
      // Sort by group name alphabetically first; ungrouped characters go last
      const aName = a.group_id != null ? (groupNameMap.get(a.group_id) ?? "") : "\uffff";
      const bName = b.group_id != null ? (groupNameMap.get(b.group_id) ?? "") : "\uffff";
      const groupCmp = aName.localeCompare(bName);
      if (groupCmp !== 0) return groupCmp;
      return a.name.localeCompare(b.name);
    });
    const idx = sorted.findIndex((c) => c.id === characterId);
    return {
      prevId: idx > 0 ? sorted[idx - 1]!.id : null,
      nextId: idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
      currentIndex: idx,
      totalCount: sorted.length,
    };
  }, [characters, characterId, groups]);

  function navigateToCharacter(targetId: number) {
    navigate({ to: `/projects/${projectId}/models/${targetId}`, search: { tab: activeTab } });
  }

  /* --- scene focus state (auto-open scene detail modal) --- */
  const [focusSceneId, setFocusSceneId] = useState<number | undefined>(
    sceneParam ? Number(sceneParam) : undefined,
  );
  const focusSceneTypeId = sceneTypeParam ? Number(sceneTypeParam) : undefined;
  const focusTrackId = trackParam ? Number(trackParam) : undefined;

  /* --- edit/delete modal state --- */
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleSaveEdit(charId: number, data: UpdateCharacter) {
    updateCharacter.mutate({ characterId: charId, data }, { onSuccess: () => setEditOpen(false) });
  }

  function handleDelete() {
    if (!character) return;
    deleteCharacter.mutate(character.id, {
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

  if (error || !character) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} />}
        title="Model not found"
        description="The requested model could not be loaded."
      />
    );
  }

  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);
  const avatarUrl = pickAvatarUrl(variants ?? []);
  const groupName = character.group_id
    ? groups?.find((g) => g.id === character.group_id)?.name
    : undefined;

  return (
    <Stack gap={6}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-[var(--spacing-1)] text-sm text-[var(--color-text-muted)]">
        <Link to="/projects" className="hover:text-[var(--color-text-primary)] transition-colors">
          Projects
        </Link>
        <ChevronRight size={14} aria-hidden />
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(projectId) }}
          search={{ tab: undefined, group: undefined }}
          className="hover:text-[var(--color-text-primary)] transition-colors"
        >
          {project?.name ?? `Project ${projectId}`}
        </Link>
        {groupName && character.group_id != null && (
          <>
            <ChevronRight size={14} aria-hidden />
            <Link
              to="/projects/$projectId"
              params={{ projectId: String(projectId) }}
              search={{ tab: "characters", group: String(character.group_id) }}
              className="hover:text-[var(--color-text-primary)] transition-colors"
            >
              {groupName}
            </Link>
          </>
        )}
        <ChevronRight size={14} aria-hidden />
        <span className="text-[var(--color-text-primary)] font-medium">{character.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        {avatarUrl ? (
          <button
            type="button"
            className="h-8 w-8 rounded-full overflow-hidden cursor-pointer"
            onClick={() => setActiveTab("images")}
            aria-label="View images"
          >
            <img
              src={avatarUrl}
              alt={character.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          </button>
        ) : (
          <User size={24} className="text-[var(--color-text-muted)]" aria-hidden />
        )}
        <Badge variant={badgeVariant} size="sm">
          {statusLabel}
        </Badge>
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(projectId) }}
          search={{ tab: "characters", group: character.group_id != null ? String(character.group_id) : undefined }}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {groupName ?? "Ungrouped"}
        </Link>
        {character.review_status_id > 1 && (
          <ReviewStatusBadge
            status={REVIEW_STATUS_MAP[character.review_status_id] ?? "unassigned"}
            size="sm"
          />
        )}
        {dashboard?.readiness && (
          <ReadinessStateBadge
            state={dashboard.readiness.state as ReadinessState}
            missingItems={dashboard.readiness.missing_items}
          />
        )}
        {speechLanguageSummary.length > 0 && (
          <div className="flex items-center gap-1.5">
            {speechLanguageSummary.map((lang) => (
              <Tooltip key={lang.languageCode} content={`${lang.languageCode.toUpperCase()}: ${lang.count} approved`}>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setActiveTab("speech")}
                  aria-label={`${lang.languageCode.toUpperCase()} speech`}
                >
                  <FlagIcon flagCode={lang.flagCode} size={18} />
                  <span className="text-xs text-[var(--color-text-muted)]">{lang.count}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        <button
          type="button"
          className={ICON_ACTION_BTN}
          onClick={() => setEditOpen(true)}
          aria-label="Edit character"
        >
          <Edit3 size={16} aria-hidden />
        </button>
        <Button
          size="sm"
          variant={character.is_enabled ? "secondary" : "primary"}
          icon={<Power size={14} />}
          onClick={() => toggleEnabled.mutate({ characterId, isEnabled: !character.is_enabled })}
          loading={toggleEnabled.isPending}
        >
          {character.is_enabled ? "Disable" : "Enable"}
        </Button>

        {/* Prev / Next character navigation */}
        {totalCount > 1 && (
          <div className="flex items-center gap-[var(--spacing-1)] ml-auto">
            <span className="text-xs text-[var(--color-text-muted)]">
              {currentIndex + 1} / {totalCount}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={14} />}
              disabled={prevId === null}
              onClick={() => prevId !== null && navigateToCharacter(prevId)}
              aria-label="Previous character"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={14} />}
              disabled={nextId === null}
              onClick={() => nextId !== null && navigateToCharacter(nextId)}
              aria-label="Next character"
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

      {/* Tab content — key on characterId to reset state when navigating between characters */}
      {activeTab === "overview" && (
        <CharacterOverviewTab
          key={characterId}
          character={character}
          characterId={characterId}
          projectId={projectId}
          onSceneClick={(sceneId) => { setFocusSceneId(sceneId); setActiveTab("scenes"); }}
        />
      )}
      {activeTab === "images" && (
        <div className={!character.is_enabled ? "opacity-70 grayscale" : ""}>
          <CharacterImagesTab key={characterId} characterId={characterId} />
        </div>
      )}
      {activeTab === "scenes" && (
        <div className={!character.is_enabled ? "opacity-70 grayscale" : ""}>
          <CharacterScenesTab key={characterId} characterId={characterId} projectId={projectId} focusSceneId={focusSceneId} focusSceneTypeId={focusSceneTypeId} focusTrackId={focusTrackId} characterEnabled={character.is_enabled} />
        </div>
      )}
      {activeTab === "deliverables" && (
        <CharacterDeliverablesTab
          key={characterId}
          characterId={characterId}
          projectId={projectId}
          characterName={character.name}
          projectName={project?.name ?? ""}
        />
      )}
      {activeTab === "metadata" && <CharacterMetadataTab key={characterId} characterId={characterId} projectId={projectId} />}
      {activeTab === "speech" && <CharacterSpeechTab key={characterId} characterId={characterId} projectId={projectId} />}
      {activeTab === "review" && <CharacterReviewAuditLog key={characterId} characterId={characterId} />}
      {activeTab === "settings" && (
        <CharacterSettingsTab
          key={characterId}
          projectId={projectId}
          characterId={characterId}
          characterName={character.name}
          blockingDeliverables={character.blocking_deliverables}
          parentBlockingDeliverables={
            (character.group_id
              ? groups?.find((g) => g.id === character.group_id)?.blocking_deliverables
              : null)
            ?? project?.blocking_deliverables
            ?? ["metadata", "images", "scenes"]
          }
          onUpdateBlockingDeliverables={(next) =>
            updateCharacter.mutate({ characterId, data: { blocking_deliverables: next } })
          }
        />
      )}

      {/* Edit character modal */}
      <CharacterEditModal
        character={editOpen ? character : null}
        projectId={projectId}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveEdit}
        saving={updateCharacter.isPending}
        onDeleteRequest={() => setDeleteOpen(true)}
      />

      {/* Delete character confirmation */}
      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Model"
        entityName={character.name}
        onConfirm={handleDelete}
        loading={deleteCharacter.isPending}
      />

      {/* Review controls sticky footer */}
      <CharacterReviewControls
        characterId={characterId}
        reviewStatusId={character.review_status_id}
      />
    </Stack>
  );
}
