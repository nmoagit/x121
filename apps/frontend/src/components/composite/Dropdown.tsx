import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface DropdownItem {
  label: string;
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}

type DropdownAlign = "left" | "right";

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  onSelect: (value: string) => void;
  align?: DropdownAlign;
}

const ALIGN_CLASSES: Record<DropdownAlign, string> = {
  left: "left-0",
  right: "right-0",
};

export function Dropdown({ trigger, items, onSelect, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const selectItem = useCallback(
    (item: DropdownItem) => {
      if (item.disabled) return;
      onSelect(item.value);
      close();
    },
    [onSelect, close],
  );

  useClickOutside(containerRef, close, open);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
          setActiveIndex(0);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % items.length);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const item = items[activeIndex];
          if (item) selectItem(item);
          break;
        }
        case "Escape": {
          e.preventDefault();
          close();
          break;
        }
      }
    },
    [open, items, activeIndex, selectItem, close],
  );

  useEffect(() => {
    if (activeIndex < 0 || !menuRef.current) return;
    const el = menuRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative inline-flex" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex"
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          className={cn(
            "absolute top-full mt-1 z-50 min-w-[180px]",
            "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
            "rounded-[var(--radius-md)] shadow-[var(--shadow-md)]",
            "py-1 overflow-auto max-h-64",
            "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
            ALIGN_CLASSES[align],
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              disabled={item.disabled}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm text-left",
                "transition-colors duration-[var(--duration-instant)]",
                item.danger
                  ? "text-[var(--color-action-danger)] hover:bg-[var(--color-action-danger)]/10"
                  : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
                item.disabled && "opacity-50 pointer-events-none",
                index === activeIndex && !item.danger && "bg-[var(--color-surface-tertiary)]",
                index === activeIndex && item.danger && "bg-[var(--color-action-danger)]/10",
              )}
              onClick={() => selectItem(item)}
            >
              {item.icon && (
                <span className="shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
