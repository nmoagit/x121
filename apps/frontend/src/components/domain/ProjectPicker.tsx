/**
 * Single-step project selector with render-prop pattern.
 *
 * Used by pages that need only a project context (no avatar).
 * Once a project is selected, renders the children render-prop
 * with the selected project ID.
 */

import { useState, type ReactNode } from "react";

import { Stack } from "@/components/layout";
import { Select ,  WireframeLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain/EmptyState";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { toSelectOptions } from "@/lib/select-utils";
import { FolderKanban } from "@/tokens/icons";

interface ProjectPickerProps {
  /** Page title displayed above the selector. */
  title: string;
  /** Short description shown below the title. */
  description: string;
  /** Render-prop called when a project is selected. */
  children: (projectId: number) => ReactNode;
}

export function ProjectPicker({
  title,
  description,
  children,
}: ProjectPickerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const { data: projects, isLoading } = useProjects();

  const projectId = Number(selectedProjectId);

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

      <div className="w-[240px]">
        {isLoading ? (
          <WireframeLoader size={32} />
        ) : (
          <Select
            label="Project"
            placeholder="Select a project..."
            options={toSelectOptions(projects)}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
          />
        )}
      </div>

      {projectId > 0 ? (
        children(projectId)
      ) : (
        <EmptyState
          icon={<FolderKanban size={32} />}
          title="Select a project"
          description="Choose a project from the dropdown above to continue."
        />
      )}
    </Stack>
  );
}
