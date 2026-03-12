import { useMemo } from "react";

import { NavGroup } from "@/app/NavGroup";
import { NAV_GROUPS } from "@/app/navigation";
import type { NavGroupDef } from "@/app/navigation";
import { useSidebar } from "@/app/useSidebar";
import { hasAccess } from "@/components/ProtectedRoute";
import { Drawer } from "@/components/composite";
import { Tooltip } from "@/components/primitives";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { Folder, PanelLeftClose, PanelLeftOpen } from "@/tokens/icons";

const EXPANDED_WIDTH = "w-52";
const COLLAPSED_WIDTH = "w-12";

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((s) => s.user);
  const { data: projects } = useProjects();

  const navGroups = useMemo<NavGroupDef[]>(() => {
    return NAV_GROUPS.map((group) => {
      if (group.label !== "Projects" || !projects || projects.length === 0) return group;
      return {
        ...group,
        items: [
          ...group.items,
          ...projects.map((p) => ({
            label: p.name,
            path: `/projects/${p.id}`,
            icon: Folder,
            prominent: true,
          })),
        ],
      };
    });
  }, [projects]);

  const visibleGroups = navGroups.filter((group) => {
    if (!user) return !group.requiredRole;
    return hasAccess(user.role, group.requiredRole);
  });

  // Split out the "Settings" group to pin at the bottom
  const scrollGroups = visibleGroups.filter((g) => g.label !== "Settings");
  const bottomGroup = visibleGroups.find((g) => g.label === "Settings");

  return (
    <nav
      className={cn("flex flex-col gap-1 py-2 h-full", collapsed ? "px-0.5" : "px-1.5")}
      aria-label="Main navigation"
    >
      {/* Scrollable nav groups */}
      <div className={cn("flex-1 overflow-y-auto space-y-1", collapsed ? "scrollbar-ultra-thin" : "scrollbar-thin")}>
        {scrollGroups.map((group, i) => (
          <NavGroup key={group.label} group={group} collapsed={collapsed} first={i === 0} />
        ))}
      </div>

      {/* Pinned bottom: Settings group */}
      {bottomGroup && (
        <div className={cn("shrink-0 pt-1 mt-1", !collapsed && "border-t border-[var(--color-border-default)]")}>
          <NavGroup group={bottomGroup} collapsed={collapsed} first={collapsed} />
        </div>
      )}
    </nav>
  );
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
              <span className="text-[10px] font-bold text-white leading-none">x</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              x121
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
