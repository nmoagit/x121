/**
 * Two-step selection widget: pick a project, then pick a character.
 *
 * Used by content pages that require a character context
 * (images, character-dashboard, scenes, storyboard, etc.).
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Select, Spinner } from "@/components/primitives";
import { EmptyState } from "@/components/domain/EmptyState";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useProjectCharacters } from "@/features/projects/hooks/use-project-characters";
import { toSelectOptions } from "@/lib/select-utils";
import { FolderKanban, User } from "@/tokens/icons";

interface ProjectCharacterPickerProps {
  /** Page title displayed above the selectors. */
  title: string;
  /** Short description shown below the title. */
  description: string;
  /**
   * Render-prop called when both project and character are selected.
   * Omit when using `onCharacterSelect` for navigate-on-select mode.
   */
  children?: (projectId: number, characterId: number) => React.ReactNode;
  /**
   * Navigate-on-select mode: called immediately when a character is chosen.
   * The character select resets after firing so the picker stays in "choose" state.
   */
  onCharacterSelect?: (projectId: number, characterId: number) => void;
}

export function ProjectCharacterPicker({
  title,
  description,
  children,
  onCharacterSelect,
}: ProjectCharacterPickerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const projectId = Number(selectedProjectId);
  const {
    data: characters,
    isLoading: charsLoading,
  } = useProjectCharacters(projectId);

  const characterId = Number(selectedCharacterId);
  const hasSelection = projectId > 0 && characterId > 0;

  const projectOptions = toSelectOptions(projects);
  const characterOptions = toSelectOptions(characters);

  return (
    <Stack gap={6}>
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {description}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
        <div className="w-[240px]">
          {projectsLoading ? (
            <Spinner size="sm" />
          ) : (
            <Select
              label="Project"
              placeholder="Select a project..."
              options={projectOptions}
              value={selectedProjectId}
              onChange={(v) => {
                setSelectedProjectId(v);
                setSelectedCharacterId("");
              }}
            />
          )}
        </div>

        <div className="w-[240px]">
          {projectId > 0 && charsLoading ? (
            <Spinner size="sm" />
          ) : (
            <Select
              label="Character"
              placeholder={
                projectId > 0
                  ? "Select a character..."
                  : "Select a project first"
              }
              options={characterOptions}
              value={onCharacterSelect ? "" : selectedCharacterId}
              onChange={(v) => {
                if (onCharacterSelect && v) {
                  onCharacterSelect(projectId, Number(v));
                } else {
                  setSelectedCharacterId(v);
                }
              }}
              disabled={projectId <= 0}
            />
          )}
        </div>
      </div>

      {hasSelection && children ? (
        children(projectId, characterId)
      ) : (
        <EmptyState
          icon={
            projectId > 0 ? <User size={32} /> : <FolderKanban size={32} />
          }
          title={
            projectId > 0
              ? "Select a character"
              : "Select a project"
          }
          description={
            projectId > 0
              ? "Choose a character from the dropdown above to continue."
              : "Choose a project from the dropdown above to get started."
          }
        />
      )}
    </Stack>
  );
}
