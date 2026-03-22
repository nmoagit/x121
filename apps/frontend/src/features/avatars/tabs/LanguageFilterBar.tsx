/**
 * Row of language filter buttons with flag icons (PRD-136).
 */

import { FlagIcon } from "@/components/primitives";
import { Globe } from "@/tokens/icons";

import type { Language } from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface LanguageFilterBarProps {
  languageIds: number[];
  languageMap: Map<number, Language>;
  activeId: number | null;
  onSelect: (id: number | null) => void;
}

/* --------------------------------------------------------------------------
   Styles
   -------------------------------------------------------------------------- */

const PILL_BASE = "px-2 py-1 text-xs rounded-[var(--radius-md)] transition-colors cursor-pointer";
const PILL_ACTIVE = `${PILL_BASE} bg-[var(--color-action-primary)] text-white`;
const PILL_INACTIVE = `${PILL_BASE} bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]/80`;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LanguageFilterBar({
  languageIds,
  languageMap,
  activeId,
  onSelect,
}: LanguageFilterBarProps) {
  return (
    <div className="flex items-center gap-[var(--spacing-1)] flex-wrap">
      <Globe size={14} className="text-[var(--color-text-muted)] mr-1" />
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={activeId === null ? PILL_ACTIVE : PILL_INACTIVE}
      >
        All
      </button>
      {languageIds.map((langId) => {
        const lang = languageMap.get(langId);
        return (
          <button
            key={langId}
            type="button"
            onClick={() => onSelect(langId)}
            className={`flex items-center gap-1 ${activeId === langId ? PILL_ACTIVE : PILL_INACTIVE}`}
          >
            {lang && <FlagIcon flagCode={lang.flag_code} size={10} />}
            {lang?.name ?? `Lang ${langId}`}
          </button>
        );
      })}
    </div>
  );
}
