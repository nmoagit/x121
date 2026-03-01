/**
 * Character detail page with tabbed sub-views (PRD-112).
 *
 * Shows breadcrumb (Projects > Project Name > Character Name),
 * character header with status badge, and tabbed content.
 */

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { ConfirmDeleteModal, Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, LoadingPane } from "@/components/primitives";
import { AlertCircle, ChevronRight, Edit3, User } from "@/tokens/icons";

import { CharacterEditModal } from "@/features/projects/components/CharacterEditModal";
import { useCharacterGroups } from "@/features/projects/hooks/use-character-groups";
import {
  useCharacter,
  useDeleteCharacter,
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

  const { data: project } = useProject(projectId);
  const { data: character, isLoading, error } = useCharacter(projectId, characterId);
  useCharacterGroups(projectId); // pre-fetch for CharacterEditModal
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);

  const [activeTab, setActiveTab] = useState<string>(CHARACTER_TABS[0].id);

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
          className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer"
          onClick={() => setEditOpen(true)}
          aria-label="Edit character"
        >
          <Edit3 size={16} aria-hidden />
        </button>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={CHARACTER_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pill"
      />

      {/* Tab content */}
      {activeTab === "overview" && (
        <CharacterOverviewTab character={character} characterId={characterId} />
      )}
      {activeTab === "images" && <CharacterImagesTab characterId={characterId} />}
      {activeTab === "scenes" && <CharacterScenesTab characterId={characterId} projectId={projectId} />}
      {activeTab === "deliverables" && <CharacterDeliverablesTab characterId={characterId} />}
      {activeTab === "metadata" && <CharacterMetadataTab characterId={characterId} />}
      {activeTab === "settings" && (
        <CharacterSettingsTab projectId={projectId} characterId={characterId} />
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
