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
  const isActive = matchRoute({ to: item.path, fuzzy: !item.exact && item.path !== "/" });

  const link = (
    <Link
      to={item.path}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-[3px] text-[13px] font-normal",
        "transition-colors duration-[var(--duration-fast)]",
        isActive
          ? "bg-[var(--color-action-primary)] text-[var(--color-action-primary-text)]"
          : item.prominent
            ? "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]",
        collapsed && "justify-center px-0 w-8 mx-auto",
        !collapsed && item.indent && "pl-6",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <item.icon size={15} aria-hidden="true" className="shrink-0" />
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
