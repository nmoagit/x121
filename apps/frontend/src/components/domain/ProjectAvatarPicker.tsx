/**
 * Two-step selection widget: pick a project, then pick a avatar.
 *
 * Used by content pages that require a avatar context
 * (images, avatar-dashboard, scenes, storyboard, etc.).
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Select ,  WireframeLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain/EmptyState";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useProjectAvatars } from "@/features/projects/hooks/use-project-avatars";
import { toSelectOptions } from "@/lib/select-utils";
import { FolderKanban, User } from "@/tokens/icons";

interface ProjectAvatarPickerProps {
  /** Page title displayed above the selectors. */
  title: string;
  /** Short description shown below the title. */
  description: string;
  /**
   * Render-prop called when both project and avatar are selected.
   * Omit when using `onAvatarSelect` for navigate-on-select mode.
   */
  children?: (projectId: number, avatarId: number) => React.ReactNode;
  /**
   * Navigate-on-select mode: called immediately when a avatar is chosen.
   * The avatar select resets after firing so the picker stays in "choose" state.
   */
  onAvatarSelect?: (projectId: number, avatarId: number) => void;
}

export function ProjectAvatarPicker({
  title,
  description,
  children,
  onAvatarSelect,
}: ProjectAvatarPickerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects, isLoading: projectsLoading } = useProjects(pipelineCtx?.pipelineId);
  const projectId = Number(selectedProjectId);
  const {
    data: avatars,
    isLoading: charsLoading,
  } = useProjectAvatars(projectId);

  const avatarId = Number(selectedAvatarId);
  const hasSelection = projectId > 0 && avatarId > 0;

  const projectOptions = toSelectOptions(projects);
  const avatarOptions = toSelectOptions(avatars);

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
            <WireframeLoader size={32} />
          ) : (
            <Select
              label="Project"
              placeholder="Select a project..."
              options={projectOptions}
              value={selectedProjectId}
              onChange={(v) => {
                setSelectedProjectId(v);
                setSelectedAvatarId("");
              }}
            />
          )}
        </div>

        <div className="w-[240px]">
          {projectId > 0 && charsLoading ? (
            <WireframeLoader size={32} />
          ) : (
            <Select
              label="Avatar"
              placeholder={
                projectId > 0
                  ? "Select an avatar..."
                  : "Select a project first"
              }
              options={avatarOptions}
              value={onAvatarSelect ? "" : selectedAvatarId}
              onChange={(v) => {
                if (onAvatarSelect && v) {
                  onAvatarSelect(projectId, Number(v));
                } else {
                  setSelectedAvatarId(v);
                }
              }}
              disabled={projectId <= 0}
            />
          )}
        </div>
      </div>

      {hasSelection && children ? (
        children(projectId, avatarId)
      ) : (
        <EmptyState
          icon={
            projectId > 0 ? <User size={32} /> : <FolderKanban size={32} />
          }
          title={
            projectId > 0
              ? "Select an avatar"
              : "Select a project"
          }
          description={
            projectId > 0
              ? "Choose an avatar from the dropdown above to continue."
              : "Choose a project from the dropdown above to get started."
          }
        />
      )}
    </Stack>
  );
}
