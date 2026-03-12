import { useState } from "react";

import { NavItem } from "@/app/NavItem";
import type { NavGroupDef } from "@/app/navigation";
import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";

interface NavGroupProps {
  group: NavGroupDef;
  collapsed: boolean;
  /** When true, omit the top divider in collapsed mode (first group). */
  first?: boolean;
}

export function NavGroup({ group, collapsed, first }: NavGroupProps) {
  const [open, setOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="space-y-px">
        {!first && <div className="mx-1 my-1 border-t border-[var(--color-border-default)]" />}
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
          "flex w-full items-center justify-between px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
      >
        <span>{group.label}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={cn(
            "transition-transform duration-[var(--duration-fast)]",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-px space-y-px">
          {group.items.map((item) => (
            <NavItem key={item.path} item={item} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}
