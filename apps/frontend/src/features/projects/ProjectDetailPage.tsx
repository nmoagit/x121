/**
 * Project detail page with tabbed sub-views (PRD-112).
 *
 * Renders breadcrumb, header with stats, and tab navigation.
 * Active tab is managed via URL search param `?tab=`.
 */

import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, LoadingPane } from "@/components/primitives";
import { useSetting } from "@/features/settings/hooks/use-settings";
import { formatDate } from "@/lib/format";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { AlertCircle, ChevronRight, Users } from "@/tokens/icons";

import { useProject, useProjectStats } from "./hooks/use-projects";
import { ProjectCharactersTab } from "./tabs/ProjectCharactersTab";
import { ProjectSettingsTab } from "./tabs/ProjectConfigTab";
import { ProjectDeliveryTab } from "./tabs/ProjectDeliveryTab";
import { ProjectOverviewTab } from "./tabs/ProjectOverviewTab";
import { ProjectProductionTab } from "./tabs/ProjectProductionTab";
import { PROJECT_STATUS_BADGE_VARIANT, PROJECT_STATUS_LABELS, PROJECT_TABS } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const id = Number(projectId);

  const navigate = useNavigate();
  const { tab: tabParam, group: groupParam } = useSearch({ strict: false }) as {
    tab?: string;
    group?: string;
  };

  const { data: project, isLoading, error } = useProject(id);
  const { data: stats } = useProjectStats(id);
  const { data: studioSetting } = useSetting("blocking_deliverables");

  useSetPageTitle(project?.name ?? "Project");

  const validTabIds = PROJECT_TABS.map((t) => t.id) as readonly string[];
  const activeTab = tabParam && validTabIds.includes(tabParam) ? tabParam : PROJECT_TABS[0].id;

  function setActiveTab(tab: string) {
    navigate({
      to: `/projects/${projectId}`,
      search: { tab },
    });
  }

  const scrollToGroupId = activeTab === "characters" && groupParam ? groupParam : undefined;

  /** Resolved blocking deliverables: project override > studio setting > hardcoded default. */
  const resolvedBlockingDeliverables = useMemo(() => {
    if (project?.blocking_deliverables) return project.blocking_deliverables;
    if (studioSetting?.value) return studioSetting.value.split(",").map((s) => s.trim()).filter(Boolean);
    return ["metadata", "images", "scenes"];
  }, [project?.blocking_deliverables, studioSetting?.value]);

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
        <Link to="/projects" className="hover:text-[var(--color-text-primary)] transition-colors">
          Projects
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="text-[var(--color-text-primary)] font-medium">{project.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-[var(--spacing-4)]">
        <div>
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Badge variant={variant} size="sm">
              {statusLabel}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{project.description}</p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Created {formatDate(project.created_at)}
            {" / "}
            Updated {formatDate(project.updated_at)}
          </p>
        </div>
        <Link
          to="/projects/$projectId/review-assignments"
          params={{ projectId: String(id) }}
          className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
        >
          <Users size={14} />
          Review Assignments
        </Link>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={PROJECT_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pill"
      />

      {/* Tab content */}
      {activeTab === "overview" && <ProjectOverviewTab projectId={id} stats={stats} />}
      {activeTab === "characters" && (
        <ProjectCharactersTab projectId={id} projectName={project.name} scrollToGroupId={scrollToGroupId} blockingDeliverables={resolvedBlockingDeliverables} />
      )}
      {activeTab === "production" && <ProjectProductionTab projectId={id} />}
      {activeTab === "delivery" && <ProjectDeliveryTab projectId={id} />}
      {activeTab === "settings" && <ProjectSettingsTab projectId={id} projectName={project.name} />}
    </Stack>
  );
}
