import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";

import { NavGroup } from "@/app/NavGroup";
import { NAV_GROUPS } from "@/app/navigation";
import type { NavGroupDef } from "@/app/navigation";
import { buildPipelineNavGroups } from "@/app/pipeline-navigation";
import { useSidebar } from "@/app/useSidebar";
import { hasAccess } from "@/components/ProtectedRoute";
import { Drawer } from "@/components/composite";
import { Spinner, Tooltip } from "@/components/primitives";
import {
  usePipelineByCode,
  usePipelines,
} from "@/features/pipelines/hooks/use-pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FolderKanban,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Workflow,
} from "@/tokens/icons";

const EXPANDED_WIDTH = "w-52";
const COLLAPSED_WIDTH = "w-12";

/* --------------------------------------------------------------------------
   Pipeline workspace sidebar content
   -------------------------------------------------------------------------- */

function PipelineSidebarContent({ collapsed, pipelineCode }: { collapsed: boolean; pipelineCode: string }) {
  const { data: pipeline } = usePipelineByCode(pipelineCode);
  const { data: projects } = useProjects(pipeline?.id);
  const { compactNav } = useSidebar();
  const pipelineName = pipeline?.name ?? pipelineCode;

  const navGroups = useMemo(() => {
    let groups = buildPipelineNavGroups(pipelineCode);

    // Inject dynamic project list under "All Projects" in the Projects group
    if (projects && projects.length > 0) {
      const projectsGroup = groups.find((g) => g.label === "Projects");
      if (projectsGroup) {
        const projectItems = projects.map((p) => ({
          label: p.name,
          path: `/pipelines/${pipelineCode}/projects/${p.id}`,
          icon: FolderKanban,
          indent: true,
          prominent: true,
        }));
        projectsGroup.items = [...projectsGroup.items, ...projectItems];
      }
    }

    // In compact mode, filter to only prominent items per group.
    if (compactNav) {
      groups = groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.prominent),
        }))
        .filter((group) => group.items.length > 0);
    }

    return groups;
  }, [pipelineCode, projects, compactNav]);

  return (
    <nav
      className={cn("flex flex-col gap-1 pt-2 h-full", collapsed ? "px-0.5" : "px-1.5")}
      aria-label="Pipeline navigation"
    >
      {/* Pipeline header */}
      {!collapsed && (
        <div className="px-2 pb-2 mb-1 border-b border-[var(--color-border-default)]">
          <div className="flex items-center gap-2">
            <Workflow size={14} className="text-[var(--color-action-primary)] shrink-0" />
            <span className="text-[11px] font-semibold text-[var(--color-text-primary)] truncate">
              {pipelineName}
            </span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1 mt-1.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <ArrowLeft size={10} />
            <span>Switch pipeline</span>
          </Link>
        </div>
      )}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 pb-1 mb-1 border-b border-[var(--color-border-default)]">
          <Tooltip content={`${pipelineName} — Switch pipeline`} side="right">
            <Link
              to="/"
              className="rounded-[var(--radius-sm)] p-1 text-[var(--color-action-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              <Workflow size={16} />
            </Link>
          </Tooltip>
        </div>
      )}

      {/* Nav groups */}
      <div className={cn("flex-1 overflow-y-auto space-y-1", collapsed ? "scrollbar-ultra-thin" : "scrollbar-thin")}>
        {navGroups.map((group, i) => (
          <NavGroup key={group.label} group={group} collapsed={collapsed} first={i === 0} />
        ))}
      </div>

      {/* Compact nav toggle */}
      <div className="shrink-0 border-t border-[var(--color-border-default)] h-7 flex items-center -mx-px">
        {!collapsed && <CompactNavToggle />}
        {collapsed && <CompactNavToggleCollapsed />}
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------------------
   Default (global) sidebar content
   -------------------------------------------------------------------------- */

function CompactNavToggle() {
  const { compactNav, toggleCompactNav } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleCompactNav}
      className={cn(
        "flex w-full items-center gap-2 px-2 h-7 text-[10px] font-mono uppercase tracking-wider",
        "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors",
      )}
    >
      {compactNav ? <Eye size={12} /> : <EyeOff size={12} />}
      <span>{compactNav ? "Show all" : "Compact"}</span>
    </button>
  );
}

function CompactNavToggleCollapsed() {
  const { compactNav, toggleCompactNav } = useSidebar();
  return (
    <Tooltip content={compactNav ? "Show all nav items" : "Hide non-essential nav"} side="right">
      <button
        type="button"
        onClick={toggleCompactNav}
        className="flex w-full items-center justify-center py-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        {compactNav ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </Tooltip>
  );
}

function GlobalSidebarContent({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((s) => s.user);
  const { compactNav } = useSidebar();
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines();

  const navGroups = useMemo<NavGroupDef[]>(() => {
    // Deep-copy groups so we never mutate the module-level NAV_GROUPS constant.
    let groups = NAV_GROUPS.map((g) => ({ ...g, items: [...g.items] }));

    // Inject active pipelines into the "Pipelines" group as indented sub-items,
    // right after "All Pipelines" but before other links (Overview Dashboard, etc.).
    const pipelinesGroup = groups.find((g) => g.label === "Pipelines");
    if (pipelinesGroup && pipelines) {
      const pipelineItems = pipelines
        .filter((p) => p.is_active)
        .map((p) => ({
          label: p.name,
          path: `/pipelines/${p.code}/dashboard`,
          icon: Layers,
          indent: true,
          prominent: true,
        }));
      // Insert after the first item ("All Pipelines")
      pipelinesGroup.items = [
        pipelinesGroup.items[0]!,
        ...pipelineItems,
        ...pipelinesGroup.items.slice(1),
      ];
    }

    // In compact mode, filter to only prominent items per group.
    if (compactNav) {
      groups = groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.prominent),
        }))
        .filter((group) => group.items.length > 0);
    }

    return groups;
  }, [compactNav, pipelines]);

  const visibleGroups = navGroups.filter((group) => {
    if (!user) return !group.requiredRole;
    return hasAccess(user.role, group.requiredRole);
  });

  // Split out the "Settings" group to pin at the bottom
  const scrollGroups = visibleGroups.filter((g) => g.label !== "Settings");
  const bottomGroup = visibleGroups.find((g) => g.label === "Settings");

  return (
    <nav
      className={cn("flex flex-col gap-1 pt-2 h-full", collapsed ? "px-0.5" : "px-1.5")}
      aria-label="Main navigation"
    >
      {/* Scrollable nav groups */}
      <div className={cn("flex-1 overflow-y-auto space-y-1", collapsed ? "scrollbar-ultra-thin" : "scrollbar-thin")}>
        {scrollGroups.map((group, i) => (
          <div key={group.label}>
            <NavGroup group={group} collapsed={collapsed} first={i === 0} />
            {group.label === "Pipelines" && pipelinesLoading && !collapsed && (
              <div className="flex items-center gap-2 px-4 py-1 text-[10px] text-[var(--color-text-muted)]">
                <Spinner size="sm" />
                <span>Loading pipelines...</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pinned bottom: Settings group (if any) */}
      {bottomGroup && (
        <div className="shrink-0">
          <NavGroup group={bottomGroup} collapsed={collapsed} first={collapsed} />
        </div>
      )}

      {/* Compact nav toggle — h-7 to match footer bar exactly */}
      <div className="shrink-0 border-t border-[var(--color-border-default)] h-7 flex items-center -mx-px">
        {!collapsed && <CompactNavToggle />}
        {collapsed && <CompactNavToggleCollapsed />}
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------------------
   Sidebar shell (shared between pipeline and global modes)
   -------------------------------------------------------------------------- */

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const params = useParams({ strict: false }) as { pipelineCode?: string };
  const isPipelineRoute = Boolean(params.pipelineCode);

  if (isPipelineRoute && params.pipelineCode) {
    return <PipelineSidebarContent collapsed={collapsed} pipelineCode={params.pipelineCode} />;
  }

  return <GlobalSidebarContent collapsed={collapsed} />;
}

function SidebarBrandBar({ collapsed }: { collapsed: boolean }) {
  const { toggle } = useSidebar();

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center",
        collapsed ? "justify-center px-0.5" : "justify-between px-3",
      )}
    >
      {collapsed ? (
        <Tooltip content="Expand sidebar" side="right">
          <button
            type="button"
            onClick={toggle}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </Tooltip>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[var(--color-action-primary)] flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-white leading-none">α</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              αN2N
            </span>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="hidden lg:flex rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </>
      )}
    </div>
  );
}

export function Sidebar() {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col shrink-0",
          "bg-[var(--color-surface-secondary)]",
          "transition-[width] duration-200 ease-[var(--ease-default)]",
          collapsed ? COLLAPSED_WIDTH : cn(EXPANDED_WIDTH, "overflow-hidden"),
        )}
      >
        <SidebarBrandBar collapsed={collapsed} />
        <div className={cn("flex-1 overflow-hidden border-r border-[var(--color-border-default)]", collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH)}>
          <SidebarContent collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Drawer open={mobileOpen} onClose={closeMobile} position="left" size="sm" title="Navigation">
        <SidebarContent collapsed={false} />
      </Drawer>
    </>
  );
}
