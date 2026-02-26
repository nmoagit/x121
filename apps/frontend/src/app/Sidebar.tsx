import { NavGroup } from "@/app/NavGroup";
import { NAV_GROUPS } from "@/app/navigation";
import { useSidebar } from "@/app/useSidebar";
import { hasAccess } from "@/components/ProtectedRoute";
import { Drawer } from "@/components/composite";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";

function SidebarContent() {
  const user = useAuthStore((s) => s.user);

  const visibleGroups = NAV_GROUPS.filter((group) => {
    if (!user) return !group.requiredRole;
    return hasAccess(user.role, group.requiredRole);
  });

  return (
    <nav className="flex flex-col gap-4 px-2 py-3" aria-label="Main navigation">
      <div className="px-3 pb-1">
        <span className="text-base font-bold text-[var(--color-text-primary)]">X121</span>
      </div>
      {visibleGroups.map((group) => (
        <NavGroup key={group.label} group={group} collapsed={false} />
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:block shrink-0 overflow-hidden",
          "border-r border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]",
          "transition-[width] duration-200 ease-[var(--ease-default)]",
          collapsed ? "w-0 border-r-0" : "w-60",
        )}
      >
        <div className="w-60 overflow-y-auto h-full scrollbar-thin">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Drawer open={mobileOpen} onClose={closeMobile} position="left" size="sm" title="Navigation">
        <SidebarContent />
      </Drawer>
    </>
  );
}
