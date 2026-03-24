/**
 * Dynamic avatar indicator dots for seed data completeness (PRD-148).
 *
 * Renders a vertical stack of small circles — green when present,
 * muted grey when missing — with tooltip labels. Fades to 30%
 * opacity when every dot is present.
 */

import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import type { IndicatorDot } from "../utils/build-indicator-dots";

interface AvatarIndicatorsProps {
  dots: IndicatorDot[];
}

export function AvatarIndicators({ dots }: AvatarIndicatorsProps) {
  if (dots.length === 0) return null;

  const allPresent = dots.every((d) => d.present);

  return (
    <div className={cn("flex flex-col gap-1 rounded-full bg-black/20 p-0.5 backdrop-blur-sm", allPresent && "opacity-30")}>
      {dots.map(({ key, label, present, icon: Icon }) => (
        <Tooltip key={key} content={`${label}: ${present ? "Present" : "Missing"}`} side="left">
          <span
            className="flex items-center justify-center size-[18px] rounded-full"
            style={{
              backgroundColor: present
                ? "var(--color-action-success)"
                : "var(--color-text-muted)",
            }}
          >
            <Icon
              size={10}
              className={present ? "text-white" : "text-[var(--color-surface-primary)]"}
              aria-hidden
            />
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
