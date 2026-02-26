import { Link, useMatchRoute } from "@tanstack/react-router";

import type { NavItemDef } from "@/app/navigation";
import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";

interface NavItemProps {
  item: NavItemDef;
  collapsed: boolean;
}

export function NavItem({ item, collapsed }: NavItemProps) {
  const matchRoute = useMatchRoute();
  const isActive = matchRoute({ to: item.path, fuzzy: item.path !== "/" });

  const link = (
    <Link
      to={item.path}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium",
        "transition-colors duration-[var(--duration-fast)]",
        isActive
          ? "bg-[var(--color-action-primary)] text-[var(--color-action-primary-text)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]",
        collapsed && "justify-center px-2",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <item.icon size={18} aria-hidden="true" className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right">
        {link}
      </Tooltip>
    );
  }

  return link;
}
