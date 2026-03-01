/**
 * Project characters tab with group headers and character grid (PRD-112).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Grid, Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import { toSelectOptions } from "@/lib/select-utils";
import { Plus, Upload, User } from "@/tokens/icons";

import { CharacterCard } from "../components/CharacterCard";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import { useCharacterGroups, useCreateGroup } from "../hooks/use-character-groups";
import { useCharacterImport } from "../hooks/use-character-import";
import {
  useCreateCharacter,
  useProjectCharacters,
} from "../hooks/use-project-characters";
import type { CharacterGroup } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCharactersTabProps {
  projectId: number;
}

export function ProjectCharactersTab({ projectId }: ProjectCharactersTabProps) {
  const navigate = useNavigate();

  const { data: characters, isLoading: charsLoading } =
    useProjectCharacters(projectId);
  const { data: groups, isLoading: groupsLoading } =
    useCharacterGroups(projectId);
  const createCharacter = useCreateCharacter(projectId);
  const createGroup = useCreateGroup(projectId);
  const charImport = useCharacterImport(projectId);

  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  /* --- modal state --- */
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  /* --- group filter options --- */
  const groupOptions = useMemo(
    () => [
      { value: "", label: "All Groups" },
      ...toSelectOptions(groups),
      ...(groups?.length ? [{ value: "ungrouped", label: "Ungrouped" }] : []),
    ],
    [groups],
  );

  /* --- modal group options --- */
  const modalGroupOptions = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  /* --- group lookup map --- */
  const groupMap = useMemo(() => {
    const map = new Map<number, CharacterGroup>();
    if (groups) {
      for (const g of groups) {
        map.set(g.id, g);
      }
    }
    return map;
  }, [groups]);

  /* --- filtered characters --- */
  const filteredCharacters = useMemo(() => {
    if (!characters) return [];

    let result = [...characters];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (groupFilter === "ungrouped") {
      result = result.filter((c) => c.group_id === null);
    } else if (groupFilter) {
      const gid = Number(groupFilter);
      result = result.filter((c) => c.group_id === gid);
    }

    return result;
  }, [characters, searchQuery, groupFilter]);

  /* --- grouped character sections --- */
  const groupedSections = useMemo(() => {
    if (!groups || groupFilter) return null;

    const sections: Array<{
      label: string;
      characters: typeof filteredCharacters;
    }> = [];

    for (const g of groups) {
      const chars = filteredCharacters.filter((c) => c.group_id === g.id);
      if (chars.length > 0) {
        sections.push({ label: g.name, characters: chars });
      }
    }

    const ungrouped = filteredCharacters.filter((c) => c.group_id === null);
    if (ungrouped.length > 0) {
      sections.push({ label: "Ungrouped", characters: ungrouped });
    }

    return sections;
  }, [groups, groupFilter, filteredCharacters]);

  /* --- create handler --- */
  function handleCreate() {
    if (!newName.trim()) return;

    const groupId = selectedGroupId ? Number(selectedGroupId) : undefined;
    createCharacter.mutate(
      { name: newName.trim(), group_id: groupId },
      {
        onSuccess: () => {
          setModalOpen(false);
          setNewName("");
          setSelectedGroupId("");
          setShowNewGroup(false);
          setNewGroupName("");
        },
      },
    );
  }

  function handleCreateNewGroup() {
    const name = newGroupName.trim();
    if (!name) return;

    createGroup.mutate(
      { name },
      {
        onSuccess: (created) => {
          setSelectedGroupId(String(created.id));
          setNewGroupName("");
          setShowNewGroup(false);
        },
      },
    );
  }

  const isLoading = charsLoading || groupsLoading;

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
    <Stack gap={4}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
        <div className="flex-1 min-w-[200px] max-w-[280px]">
          <Input
            placeholder="Search characters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-[160px]">
          <Select
            options={groupOptions}
            value={groupFilter}
            onChange={setGroupFilter}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={charImport.browseFolder}
        >
          Import Folder
        </Button>
        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setModalOpen(true)}
        >
          Add Character
        </Button>
      </div>

      {/* Content */}
      {filteredCharacters.length === 0 ? (
        <EmptyState
          icon={<User size={32} />}
          title="No characters"
          description={
            characters && characters.length > 0
              ? "No characters match your filter."
              : "Add a character to this project."
          }
          action={
            !characters?.length ? (
              <Button
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setModalOpen(true)}
              >
                Add Character
              </Button>
            ) : undefined
          }
        />
      ) : groupedSections ? (
        <Stack gap={6}>
          {groupedSections.map((section) => (
            <div key={section.label}>
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-[var(--spacing-2)]">
                {section.label} ({section.characters.length})
              </h3>
              <Grid cols={1} gap={3} className="sm:grid-cols-2 lg:grid-cols-3">
                {section.characters.map((char) => (
                  <CharacterCard
                    key={char.id}
                    character={char}
                    group={char.group_id ? groupMap.get(char.group_id) : undefined}
                    onClick={() =>
                      navigate({
                        to: `/projects/${projectId}/characters/${char.id}`,
                      })
                    }
                  />
                ))}
              </Grid>
            </div>
          ))}
        </Stack>
      ) : (
        <Grid cols={1} gap={3} className="sm:grid-cols-2 lg:grid-cols-3">
          {filteredCharacters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              group={char.group_id ? groupMap.get(char.group_id) : undefined}
              onClick={() =>
                navigate({
                  to: `/projects/${projectId}/characters/${char.id}`,
                })
              }
            />
          ))}
        </Grid>
      )}

      {/* Add character modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Character"
        size="sm"
      >
        <Stack gap={4}>
          <Input
            label="Character Name"
            placeholder="e.g. Aria"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          {/* Group selection */}
          <div>
            <Select
              label="Group"
              options={modalGroupOptions}
              value={selectedGroupId}
              onChange={setSelectedGroupId}
            />
            {!showNewGroup ? (
              <button
                type="button"
                className="mt-[var(--spacing-1)] text-xs text-[var(--color-text-link)] hover:underline"
                onClick={() => setShowNewGroup(true)}
              >
                + Create new group
              </button>
            ) : (
              <div className="mt-[var(--spacing-2)] flex items-end gap-[var(--spacing-2)]">
                <div className="flex-1">
                  <Input
                    placeholder="New group name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateNewGroup}
                  loading={createGroup.isPending}
                  disabled={!newGroupName.trim()}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowNewGroup(false);
                    setNewGroupName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <Button
            onClick={handleCreate}
            loading={createCharacter.isPending}
            disabled={!newName.trim()}
          >
            Create Character
          </Button>
        </Stack>
      </Modal>

      {/* Import confirmation modal */}
      <ImportConfirmModal
        open={charImport.importOpen}
        onClose={charImport.closeImport}
        names={charImport.importNames}
        projectId={projectId}
        existingNames={characters?.map((c) => c.name) ?? []}
        onConfirm={charImport.handleImportConfirm}
        loading={charImport.bulkCreatePending}
      />
    </Stack>
    </FileDropZone>
  );
}
