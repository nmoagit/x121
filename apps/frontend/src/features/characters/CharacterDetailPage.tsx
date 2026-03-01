/**
 * Character detail page with tabbed sub-views (PRD-112).
 *
 * Shows breadcrumb (Projects > Project Name > Character Name),
 * character header with status badge, and tabbed content.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { Modal, Tabs } from "@/components/composite";
import { Badge, Button, Input, LoadingPane, Select } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { toSelectOptions } from "@/lib/select-utils";
import { AlertCircle, ChevronRight, Edit3, User } from "@/tokens/icons";

import { useCharacterGroups } from "@/features/projects/hooks/use-character-groups";
import { useProject } from "@/features/projects/hooks/use-projects";
import {
  useCharacter,
  useDeleteCharacter,
  useUpdateCharacter,
} from "@/features/projects/hooks/use-project-characters";
import {
  CHARACTER_TABS,
  characterStatusBadgeVariant,
  characterStatusLabel,
} from "@/features/projects/types";

import { CharacterOverviewTab } from "./tabs/CharacterOverviewTab";
import { CharacterImagesTab } from "./tabs/CharacterImagesTab";
import { CharacterScenesTab } from "./tabs/CharacterScenesTab";
import { CharacterAssetsTab } from "./tabs/CharacterAssetsTab";
import { CharacterMetadataTab } from "./tabs/CharacterMetadataTab";
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
  const { data: groups } = useCharacterGroups(projectId);
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);

  const [activeTab, setActiveTab] = useState<string>(CHARACTER_TABS[0].id);

  /* --- edit modal state --- */
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");

  /* --- delete confirmation state --- */
  const [deleteOpen, setDeleteOpen] = useState(false);

  const groupOptions = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  function openEdit() {
    if (!character) return;
    setEditName(character.name);
    setEditGroupId(character.group_id ? String(character.group_id) : "");
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!character || !editName.trim()) return;

    const data: { name?: string; group_id?: number | null } = {};
    if (editName.trim() !== character.name) {
      data.name = editName.trim();
    }
    const newGroupId = editGroupId ? Number(editGroupId) : null;
    if (newGroupId !== character.group_id) {
      data.group_id = newGroupId;
    }

    if (Object.keys(data).length === 0) {
      setEditOpen(false);
      return;
    }

    updateCharacter.mutate(
      { characterId: character.id, data },
      { onSuccess: () => setEditOpen(false) },
    );
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
        <Link
          to="/projects"
          className="hover:text-[var(--color-text-primary)] transition-colors"
        >
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
        <span className="text-[var(--color-text-primary)] font-medium">
          {character.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <User size={24} className="text-[var(--color-text-muted)]" aria-hidden />
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {character.name}
        </h1>
        <Badge variant={badgeVariant} size="sm">
          {statusLabel}
        </Badge>
        <button
          type="button"
          className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer"
          onClick={openEdit}
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
      />

      {/* Tab content */}
      {activeTab === "overview" && (
        <CharacterOverviewTab character={character} />
      )}
      {activeTab === "images" && <CharacterImagesTab />}
      {activeTab === "scenes" && <CharacterScenesTab />}
      {activeTab === "assets" && <CharacterAssetsTab />}
      {activeTab === "metadata" && (
        <CharacterMetadataTab characterId={characterId} />
      )}
      {activeTab === "settings" && (
        <CharacterSettingsTab
          projectId={projectId}
          characterId={characterId}
        />
      )}
      {/* Edit character modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Character"
        size="sm"
      >
        <Stack gap={4}>
          <Input
            label="Character Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Select
            label="Group"
            options={groupOptions}
            value={editGroupId}
            onChange={setEditGroupId}
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-xs text-[var(--color-action-danger)] hover:text-[var(--color-action-danger-hover)] hover:underline cursor-pointer"
              onClick={() => setDeleteOpen(true)}
            >
              Delete character
            </button>
            <div className="flex gap-[var(--spacing-2)]">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                loading={updateCharacter.isPending}
                disabled={!editName.trim()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Stack>
      </Modal>

      {/* Delete character confirmation */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Character"
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Are you sure you want to delete{" "}
            <strong>{character.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-[var(--spacing-2)] justify-end">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleteCharacter.isPending}
            >
              Delete
            </Button>
          </div>
        </Stack>
      </Modal>
    </Stack>
  );
}
