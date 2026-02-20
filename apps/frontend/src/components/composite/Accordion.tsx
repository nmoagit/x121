import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
}

export function Accordion({ items, allowMultiple = false }: AccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(allowMultiple ? prev : []);
        if (prev.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [allowMultiple],
  );

  return (
    <div className="divide-y divide-[var(--color-border-default)] border-y border-[var(--color-border-default)]">
      {items.map((item) => (
        <AccordionSection
          key={item.id}
          item={item}
          isOpen={openIds.has(item.id)}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

interface AccordionSectionProps {
  item: AccordionItem;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

function AccordionSection({ item, isOpen, onToggle }: AccordionSectionProps) {
  const contentId = `accordion-content-${item.id}`;
  const triggerId = `accordion-trigger-${item.id}`;

  return (
    <div>
      <button
        type="button"
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => onToggle(item.id)}
        className={cn(
          "flex items-center justify-between w-full py-3 px-4",
          "text-left text-sm font-medium text-[var(--color-text-primary)]",
          "hover:bg-[var(--color-surface-tertiary)]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
        )}
      >
        {item.title}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-[var(--color-text-muted)]",
            "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <section
        id={contentId}
        aria-labelledby={triggerId}
        className={cn(
          "grid transition-[grid-template-rows] duration-[var(--duration-normal)] ease-[var(--ease-default)]",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3 text-sm text-[var(--color-text-secondary)]">{item.content}</div>
        </div>
      </section>
    </div>
  );
}
