/**
 * Project list page with search, filter, and create drawer (PRD-112).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Modal } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Grid } from "@/components/layout";
import { Button, Input, LoadingPane, Select, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { FolderKanban, Plus } from "@/tokens/icons";

import { ProjectCard } from "./components/ProjectCard";
import { useCreateProject, useProjects } from "./hooks/use-projects";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "./types";

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
    <Stack gap={6}>
      {/* Page header actions */}
      <div className="flex items-center justify-end">
        <Button
          icon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          New Project
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
        <div className="flex-1 min-w-[200px] max-w-[320px]">
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-[160px]">
          <Select
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="w-[160px]">
          <Select
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
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
    </Stack>
  );
}
