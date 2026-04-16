/**
 * Modal shown when an admin drops a 3-level folder (project/group/avatar).
 *
 * Lists detected projects with checkboxes, badges for existing/new,
 * and group/avatar counts per project.
 */

import { useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox } from "@/components/primitives";
import type { Project } from "@/features/projects/types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface DetectedProject {
  name: string;
  groupCount: number;
  avatarCount: number;
}

interface ProjectConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Detected projects from the folder structure. */
  detectedProjects: DetectedProject[];
  /** Existing projects for matching. */
  existingProjects: Project[];
  /** Called with selected project names. */
  onConfirm: (selectedNames: string[]) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectConfirmModal({
  open,
  onClose,
  detectedProjects,
  existingProjects,
  onConfirm,
}: ProjectConfirmModalProps) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(detectedProjects.map((p) => p.name)),
  );

  const existingNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingProjects) set.add(p.name.toLowerCase());
    return set;
  }, [existingProjects]);

  function toggleProject(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === detectedProjects.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(detectedProjects.map((p) => p.name)));
    }
  }

  function handleConfirm() {
    onConfirm([...checked]);
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirm Projects" size="lg">
      <Stack gap={4}>
        <p className="text-xs font-mono text-[var(--color-text-secondary)]">
          The following projects were detected from the folder structure. Select which projects to import.
        </p>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {/* Select all header */}
          <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)]">
            <Checkbox
              checked={checked.size === detectedProjects.length}
              indeterminate={checked.size > 0 && checked.size < detectedProjects.length}
              onChange={toggleAll}
              label={`Select all (${detectedProjects.length})`}
            />
          </div>

          {detectedProjects.map((project) => {
            const isExisting = existingNameSet.has(project.name.toLowerCase());
            return (
              <div
                key={project.name}
                className="flex items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-white/5 last:border-b-0 hover:bg-[var(--color-surface-secondary)]"
              >
                <Checkbox
                  checked={checked.has(project.name)}
                  onChange={() => toggleProject(project.name)}
                  label={project.name}
                />
                <div className={`flex items-center gap-[var(--spacing-2)] ml-auto ${TYPO_DATA}`}>
                  <span className={isExisting ? "text-[var(--color-data-green)]" : "text-[var(--color-data-cyan)]"}>
                    {isExisting ? "existing" : "new"}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {project.groupCount} {project.groupCount === 1 ? "group" : "groups"},{" "}
                    {project.avatarCount} {project.avatarCount === 1 ? "model" : "models"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={checked.size === 0}>
            Import {checked.size} {checked.size === 1 ? "Project" : "Projects"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
