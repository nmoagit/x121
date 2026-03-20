import { WireframeLoader } from "@/components/primitives";
/**
 * Searchable prompt fragment dropdown (PRD-115).
 *
 * Displays a filterable list of prompt fragments. Pinned fragments
 * for the given scene type appear first.
 */

import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { Input } from "@/components/primitives/Input";
import { cn } from "@/lib/cn";

import { usePromptFragments } from "./hooks/use-prompt-management";
import type { PromptFragment } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TRUNCATE_LENGTH = 80;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FragmentDropdownProps {
  sceneTypeId: number;
  onSelect: (fragment: PromptFragment) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FragmentDropdown({ sceneTypeId, onSelect }: FragmentDropdownProps) {
  const [search, setSearch] = useState("");
  const { data: fragments, isPending } = usePromptFragments({ scene_type_id: sceneTypeId });

  const filtered = useMemo(() => {
    if (!fragments) return [];
    if (!search.trim()) return fragments;
    const lower = search.toLowerCase();
    return fragments.filter(
      (f) =>
        f.text.toLowerCase().includes(lower) ||
        f.category?.toLowerCase().includes(lower) ||
        f.description?.toLowerCase().includes(lower),
    );
  }, [fragments, search]);

  const handleSelect = useCallback(
    (fragment: PromptFragment) => {
      onSelect(fragment);
      setSearch("");
    },
    [onSelect],
  );

  return (
    <div className="flex flex-col gap-2" data-testid="fragment-dropdown">
      <Input
        placeholder="Search fragments..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="fragment-search-input"
      />

      {isPending && (
        <div className="flex items-center justify-center py-4">
          <WireframeLoader size={32} />
        </div>
      )}

      {!isPending && filtered.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] py-2" data-testid="fragment-empty">
          No fragments found.
        </p>
      )}

      {!isPending && filtered.length > 0 && (
        <ul
          className={cn(
            "max-h-48 overflow-y-auto",
            "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
            "bg-[var(--color-surface-secondary)]",
          )}
          data-testid="fragment-list"
        >
          {filtered.map((fragment) => (
            <li key={fragment.id}>
              <button
                type="button"
                onClick={() => handleSelect(fragment)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm",
                  "hover:bg-[var(--color-surface-tertiary)]",
                  "transition-colors duration-[var(--duration-fast)]",
                  "border-b border-[var(--color-border-default)] last:border-b-0",
                )}
                data-testid={`fragment-item-${fragment.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-primary)] truncate">
                    {fragment.text.length > TRUNCATE_LENGTH
                      ? `${fragment.text.slice(0, TRUNCATE_LENGTH)}...`
                      : fragment.text}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                    {fragment.usage_count}
                  </span>
                </div>
                {fragment.category && (
                  <div className="mt-1">
                    <Badge variant="default" size="sm">
                      {fragment.category}
                    </Badge>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
