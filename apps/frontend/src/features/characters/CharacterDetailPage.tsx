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
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { ICON_ACTION_BTN } from "@/lib/ui-classes";
import { AlertCircle, ChevronLeft, ChevronRight, Edit3, User } from "@/tokens/icons";

import { CharacterEditModal } from "@/features/projects/components/CharacterEditModal";
import { useCharacterGroups } from "@/features/projects/hooks/use-character-groups";
import {
  useCharacter,
  useDeleteCharacter,
  useProjectCharacters,
  useUpdateCharacter,
} from "@/features/projects/hooks/use-project-characters";
import { useProject } from "@/features/projects/hooks/use-projects";
import {
  CHARACTER_TABS,
  type UpdateCharacter,
  characterStatusBadgeVariant,
  characterStatusLabel,
} from "@/features/projects/types";

import { CharacterDeliverablesTab } from "./tabs/CharacterDeliverablesTab";
import { CharacterImagesTab } from "./tabs/CharacterImagesTab";
import { CharacterMetadataTab } from "./tabs/CharacterMetadataTab";
import { CharacterOverviewTab } from "./tabs/CharacterOverviewTab";
import { CharacterScenesTab } from "./tabs/CharacterScenesTab";
import { CharacterSettingsTab } from "./tabs/CharacterSettingsTab";

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
  const { tab: tabParam } = useSearch({ strict: false }) as { tab?: string };

  const { data: project } = useProject(projectId);
  const { data: character, isLoading, error } = useCharacter(projectId, characterId);
  const { data: characters } = useProjectCharacters(projectId);
  const { data: groups } = useCharacterGroups(projectId);
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);

  const validTabIds = CHARACTER_TABS.map((t) => t.id) as readonly string[];
  const activeTab = tabParam && validTabIds.includes(tabParam) ? tabParam : CHARACTER_TABS[0].id;

  function setActiveTab(tab: string) {
    navigate({
      to: `/projects/${projectId}/characters/${characterId}`,
      search: { tab },
      replace: true,
    });
  }

  /* --- prev/next character navigation --- */
  const { prevId, nextId, currentIndex, totalCount } = useMemo(() => {
    if (!characters || characters.length === 0) {
      return { prevId: null, nextId: null, currentIndex: -1, totalCount: 0 };
    }
    const groupOrder = new Map<number, number>();
    if (groups) {
      for (const g of groups) groupOrder.set(g.id, g.sort_order);
    }
    const sorted = [...characters].sort((a, b) => {
      const aGroup = a.group_id != null ? (groupOrder.get(a.group_id) ?? 0) : Number.MAX_SAFE_INTEGER;
      const bGroup = b.group_id != null ? (groupOrder.get(b.group_id) ?? 0) : Number.MAX_SAFE_INTEGER;
      if (aGroup !== bGroup) return aGroup - bGroup;
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
    navigate({ to: `/projects/${projectId}/characters/${targetId}`, search: { tab: activeTab } });
  }

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
        title="Character not found"
        description="The requested character could not be loaded."
      />
    );
  }

  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);

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
          className="hover:text-[var(--color-text-primary)] transition-colors"
        >
          {project?.name ?? `Project ${projectId}`}
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="text-[var(--color-text-primary)] font-medium">{character.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <User size={24} className="text-[var(--color-text-muted)]" aria-hidden />
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{character.name}</h1>
        <Badge variant={badgeVariant} size="sm">
          {statusLabel}
        </Badge>
        <button
          type="button"
          className={ICON_ACTION_BTN}
          onClick={() => setEditOpen(true)}
          aria-label="Edit character"
        >
          <Edit3 size={16} aria-hidden />
        </button>

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
          groupName={character.group_id ? groups?.find((g) => g.id === character.group_id)?.name : undefined}
        />
      )}
      {activeTab === "images" && <CharacterImagesTab key={characterId} characterId={characterId} />}
      {activeTab === "scenes" && <CharacterScenesTab key={characterId} characterId={characterId} projectId={projectId} />}
      {activeTab === "deliverables" && <CharacterDeliverablesTab key={characterId} characterId={characterId} />}
      {activeTab === "metadata" && <CharacterMetadataTab key={characterId} characterId={characterId} />}
      {activeTab === "settings" && (
        <CharacterSettingsTab key={characterId} projectId={projectId} characterId={characterId} />
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
        title="Delete Character"
        entityName={character.name}
        onConfirm={handleDelete}
        loading={deleteCharacter.isPending}
      />
    </Stack>
  );
}
