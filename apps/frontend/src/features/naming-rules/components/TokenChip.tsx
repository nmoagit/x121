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
          bg-[#161b22] text-cyan-400
          border border-[var(--color-border-default)] rounded-[var(--radius-md)]
          hover:bg-[#0d1117] hover:text-cyan-300
          transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]
          cursor-pointer"
      >
        {`{${name}}`}
      </button>
    </Tooltip>
  );
}
