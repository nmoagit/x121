/**
 * Token chip list for a naming category (PRD-116).
 *
 * Shows available template tokens as clickable chips that insert into the editor.
 */

import { Spinner } from "@/components/primitives";

import { useCategoryTokens } from "../hooks/use-naming-rules";
import { TokenChip } from "./TokenChip";

interface TokenListProps {
  categoryId: number;
  onTokenClick: (tokenName: string) => void;
}

export function TokenList({ categoryId, onTokenClick }: TokenListProps) {
  const { data: tokens, isLoading } = useCategoryTokens(categoryId);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">
        Available tokens
      </span>
      {isLoading ? (
        <Spinner size="sm" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tokens?.map((t) => (
            <TokenChip
              key={t.name}
              name={t.name}
              description={t.description}
              onClick={onTokenClick}
            />
          ))}
          {tokens?.length === 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              No tokens available for this category.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
