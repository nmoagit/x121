/**
 * Clickable token chip that inserts `{token}` into the template editor (PRD-116).
 */

import { Tooltip } from "@/components/primitives";

interface TokenChipProps {
  name: string;
  description: string;
  onClick: (token: string) => void;
}

export function TokenChip({ name, description, onClick }: TokenChipProps) {
  return (
    <Tooltip content={description} side="top">
      <button
        type="button"
        onClick={() => onClick(name)}
        className="inline-flex items-center px-2.5 py-1 text-xs font-mono
          bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]
          border border-[var(--color-border-default)] rounded-[var(--radius-md)]
          hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]
          transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]
          cursor-pointer"
      >
        {`{${name}}`}
      </button>
    </Tooltip>
  );
}
