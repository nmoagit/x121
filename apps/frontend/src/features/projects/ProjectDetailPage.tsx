/**
 * Project detail page with tabbed sub-views (PRD-112).
 *
 * Renders breadcrumb, header with stats, and tab navigation.
 * Active tab is managed via URL search param `?tab=`.
 */

import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

import { Tabs } from "@/components/composite";
import { Badge, LoadingPane } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { EmptyState } from "@/components/domain";
import { AlertCircle, ChevronRight, FolderKanban } from "@/tokens/icons";
import { formatDate } from "@/lib/format";

import { useProject, useProjectStats } from "./hooks/use-projects";
import { ProjectOverviewTab } from "./tabs/ProjectOverviewTab";
import { ProjectCharactersTab } from "./tabs/ProjectCharactersTab";
import { ProjectGroupsTab } from "./tabs/ProjectGroupsTab";
import { ProjectSceneSettingsTab } from "./tabs/ProjectSceneSettingsTab";
import { ProjectProductionTab } from "./tabs/ProjectProductionTab";
import { ProjectDeliveryTab } from "./tabs/ProjectDeliveryTab";
import { ProjectConfigTab } from "./tabs/ProjectConfigTab";
import { PROJECT_STATUS_BADGE_VARIANT, PROJECT_STATUS_LABELS, PROJECT_TABS } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const id = Number(projectId);

  const { data: project, isLoading, error } = useProject(id);
  const { data: stats } = useProjectStats(id);

  const [activeTab, setActiveTab] = useState<string>(PROJECT_TABS[0].id);

  if (isLoading) {
    return <LoadingPane />;
  }

  if (error || !project) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} />}
        title="Project not found"
        description="The requested project could not be loaded."
      />
    );
  }

  const variant = PROJECT_STATUS_BADGE_VARIANT[project.status] ?? "default";
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status;

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
        <span className="text-[var(--color-text-primary)] font-medium">
          {project.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-[var(--spacing-4)]">
        <div>
          <div className="flex items-center gap-[var(--spacing-2)]">
            <FolderKanban
              size={24}
              className="text-[var(--color-text-muted)]"
              aria-hidden
            />
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {project.name}
            </h1>
            <Badge variant={variant} size="sm">
              {statusLabel}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {project.description}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Created {formatDate(project.created_at)}
            {" / "}
            Updated {formatDate(project.updated_at)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={PROJECT_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "overview" && <ProjectOverviewTab projectId={id} stats={stats} />}
      {activeTab === "characters" && <ProjectCharactersTab projectId={id} />}
      {activeTab === "groups" && <ProjectGroupsTab projectId={id} />}
      {activeTab === "scene-settings" && <ProjectSceneSettingsTab projectId={id} />}
      {activeTab === "production" && <ProjectProductionTab />}
      {activeTab === "delivery" && <ProjectDeliveryTab />}
      {activeTab === "config" && <ProjectConfigTab projectId={id} />}
    </Stack>
  );
}
