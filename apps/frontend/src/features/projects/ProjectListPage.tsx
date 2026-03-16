/**
 * Project list page with search, filter, and create drawer (PRD-112).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Grid } from "@/components/layout";
import { Badge, Button, FilterSelect, Input, LoadingPane, SearchInput, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useCharacterImport } from "./hooks/use-character-import";
import { FileAssignmentModal } from "@/features/characters/components";
import { ImportConfirmModal } from "./components/ImportConfirmModal";
import { ImportProgressBar } from "./components/ImportProgressBar";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { FolderKanban, Plus, Upload } from "@/tokens/icons";

import { ProjectCard } from "./components/ProjectCard";
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject } from "./hooks/use-projects";
import { useProjectCharacters } from "./hooks/use-project-characters";
import { useCharacterGroups } from "./hooks/use-character-groups";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "./types";
import type { FolderDropResult } from "./types";

/* --------------------------------------------------------------------------
   Sort options
   -------------------------------------------------------------------------- */

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  ...PROJECT_STATUSES.map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABELS[s] ?? s,
  })),
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectListPage() {
  useSetPageTitle("Projects", "Manage characters, scenes, and delivery across projects.");

  const navigate = useNavigate();
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  /* --- archive/unarchive/delete handlers --- */
  function handleArchive(id: number) {
    updateProject.mutate({ id, data: { status: "archived" } });
  }

  function handleUnarchive(id: number) {
    updateProject.mutate({ id, data: { status: "active" } });
  }

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteProject.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  /* --- local filter/sort state --- */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created-desc");
  const [hideArchived, setHideArchived] = useState(false);

  /* --- modal state --- */
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  /* --- filtered and sorted projects --- */
  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    let result = [...projects];

    // Text filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Hide archived toggle
    if (hideArchived) {
      result = result.filter((p) => p.status !== "archived");
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "created-asc":
          return a.created_at.localeCompare(b.created_at);
        case "created-desc":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });

    return result;
  }, [projects, searchQuery, statusFilter, sortBy, hideArchived]);

  /* --- folder drop → project creation → character import --- */
  const browseFolderRef = useRef<(() => void) | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{
    result: FolderDropResult;
    projectName: string;
    existingProjectId: number | null;
    groups: { name: string; characterCount: number }[];
    totalCharacters: number;
  } | null>(null);
  const [importProjectId, setImportProjectId] = useState<number>(0);
  const pendingFolderResult = useRef<FolderDropResult | null>(null);

  // Character import hook bound to the target project
  const charImport = useCharacterImport(importProjectId);
  const { data: importProjectCharacters } = useProjectCharacters(importProjectId);
  const { data: importProjectGroups } = useCharacterGroups(importProjectId);

  // When importProjectId is set and we have a pending folder result, trigger the import flow
  useEffect(() => {
    if (importProjectId > 0 && pendingFolderResult.current) {
      charImport.handleFolderDrop(pendingFolderResult.current);
      pendingFolderResult.current = null;
    }
  }, [importProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFolderDrop = useCallback(
    (result: FolderDropResult) => {
      const projectName = result.detectedProjectName;
      if (!projectName) return;

      const groups: { name: string; characterCount: number }[] = [];
      let totalCharacters = 0;
      for (const [groupName, payloads] of result.groupedPayloads) {
        groups.push({
          name: groupName || "Ungrouped",
          characterCount: payloads.length,
        });
        totalCharacters += payloads.length;
      }

      const existing = projects?.find(
        (p) => p.name.toLowerCase() === projectName.toLowerCase(),
      );

      setPendingDrop({
        result,
        projectName,
        existingProjectId: existing?.id ?? null,
        groups,
        totalCharacters,
      });
    },
    [projects],
  );

  function handleConfirmDrop() {
    if (!pendingDrop) return;
    pendingFolderResult.current = pendingDrop.result;

    if (pendingDrop.existingProjectId) {
      setImportProjectId(pendingDrop.existingProjectId);
      setPendingDrop(null);
    } else {
      createProject.mutate(
        { name: pendingDrop.projectName },
        {
          onSuccess: (created) => {
            setImportProjectId(created.id);
            setPendingDrop(null);
          },
        },
      );
    }
  }

  /* --- create handler --- */
  function handleCreate() {
    if (!newName.trim()) return;

    createProject.mutate(
      {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          setModalOpen(false);
          setNewName("");
          setNewDescription("");
        },
      },
    );
  }

  return (

    <FileDropZone
      onNamesDropped={() => {}}
      onFolderDropped={handleFolderDrop}
      className="min-h-[calc(100vh-8rem)]"
      browseFolderRef={browseFolderRef}
    >
    <Stack gap={6}>
      {/* Page header actions */}
      <div className="flex items-center justify-end gap-[var(--spacing-2)]">
        <Button
          size="sm"
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => browseFolderRef.current?.()}
        >
          Import Folder
        </Button>
        <Button
          size="sm"
          icon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          New Project
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
        <SearchInput
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] max-w-[320px]"
        />
        <FilterSelect
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-[160px]"
        />
        <FilterSelect
          options={SORT_OPTIONS}
          value={sortBy}
          onChange={setSortBy}
          className="w-[160px]"
        />
        <Toggle
          checked={hideArchived}
          onChange={setHideArchived}
          label="Hide archived"
          size="sm"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingPane />
      ) : error ? (
        <EmptyState
          icon={<FolderKanban size={32} />}
          title="Failed to load projects"
          description="An error occurred while fetching the project list."
        />
      ) : filteredProjects.length > 0 ? (
        <Grid cols={1} gap={4} className="sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate({ to: `/projects/${project.id}` })}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onDelete={(id) => setDeleteTarget({ id, name: project.name })}
              isUpdating={
                updateProject.isPending &&
                updateProject.variables?.id === project.id
              }
            />
          ))}
        </Grid>
      ) : (
        <EmptyState
          icon={<FolderKanban size={32} />}
          title="No projects found"
          description={
            projects && projects.length > 0
              ? "No projects match your filters. Try adjusting your search."
              : "Create your first project to get started."
          }
          action={
            !projects?.length ? (
              <Button
                icon={<Plus size={16} />}
                onClick={() => setModalOpen(true)}
              >
                New Project
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Create project modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setNewName("");
          setNewDescription("");
        }}
        title="New Project"
        size="sm"
      >
        <Stack gap={4}>
          <Input
            label="Project Name"
            placeholder="e.g. Season 3 Characters"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="Optional description..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <Button
            onClick={handleCreate}
            loading={createProject.isPending}
            disabled={!newName.trim()}
          >
            Create Project
          </Button>
        </Stack>
      </Modal>

      {/* Folder import confirmation */}
      <Modal
        open={pendingDrop !== null}
        onClose={() => setPendingDrop(null)}
        title="Import Project"
        size="md"
      >
        {pendingDrop && (
          <Stack gap={4}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  Project:
                </span>
                <span className="text-sm text-[var(--color-text-primary)] font-semibold">
                  {pendingDrop.projectName}
                </span>
                <Badge variant={pendingDrop.existingProjectId ? "info" : "success"} size="sm">
                  {pendingDrop.existingProjectId ? "Existing" : "New"}
                </Badge>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3">
                <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                  Contents
                </div>
                {pendingDrop.groups.map((g) => (
                  <div key={g.name} className="flex items-center justify-between py-1">
                    <span className="text-sm text-[var(--color-text-primary)]">{g.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {g.characterCount} character{g.characterCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--color-border-default)]">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">Total</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {pendingDrop.totalCharacters} character{pendingDrop.totalCharacters !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)]">
                {pendingDrop.existingProjectId
                  ? "Characters will be added to the existing project. You'll be taken to the project's characters tab to complete the import."
                  : "A new project will be created and you'll be taken to the characters tab to complete the import."}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPendingDrop(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmDrop} loading={createProject.isPending}>
                {pendingDrop.existingProjectId ? "Go to Project" : "Create & Import"}
              </Button>
            </div>
          </Stack>
        )}
      </Modal>

      {/* Delete project confirmation */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
        entityName={deleteTarget?.name ?? ""}
        warningText="This will permanently delete the project and all its characters, scenes, and deliverables."
        onConfirm={handleDeleteConfirm}
        loading={deleteProject.isPending}
      />

      {/* Character import progress */}
      {charImport.importProgress && charImport.importProgress.phase !== "done" && (
        <ImportProgressBar progress={charImport.importProgress} />
      )}

      {/* File assignment modal (unmatched files) */}
      <FileAssignmentModal
        open={charImport.unmatchedFiles.length > 0}
        onClose={charImport.dismissUnmatchedFiles}
        unmatchedFiles={charImport.unmatchedFiles}
        onConfirm={(assignments) => charImport.resolveUnmatchedFiles(assignments)}
      />

      {/* Character import confirmation modal */}
      {importProjectId > 0 && (
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={() => { charImport.closeImport(); setImportProjectId(0); }}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={importProjectId}
          projectName={projects?.find((p) => p.id === importProjectId)?.name}
          existingNames={importProjectCharacters?.map((c) => c.name) ?? []}
          characters={importProjectCharacters ?? []}
          onConfirm={charImport.handleImportConfirm}
          onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
          loading={charImport.bulkCreatePending}
          importProgress={charImport.importProgress}
          onAbort={charImport.abortImport}
          detectedProjectName={charImport.importResult?.detectedProjectName}
          existingGroupNames={importProjectGroups?.map((g) => g.name) ?? []}
          hashSummary={charImport.hashSummary}
        />
      )}
    </Stack>
    </FileDropZone>

  );
}
