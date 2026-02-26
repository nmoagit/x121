import { useState } from "react";

import { NavItem } from "@/app/NavItem";
import type { NavGroupDef } from "@/app/navigation";
import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";

interface NavGroupProps {
  group: NavGroupDef;
  collapsed: boolean;
}

export function NavGroup({ group, collapsed }: NavGroupProps) {
  const [open, setOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <NavItem key={item.path} item={item} collapsed />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
          "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
      >
        <span>{group.label}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "transition-transform duration-[var(--duration-fast)]",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map((item) => (
            <NavItem key={item.path} item={item} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}
