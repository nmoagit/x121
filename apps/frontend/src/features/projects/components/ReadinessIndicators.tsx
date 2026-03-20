/**
 * Per-section readiness indicator circles for character cards (PRD-128).
 *
 * Renders 4 vertically-stacked colored circles (metadata, images, scenes,
 * speech) with tooltips and click-to-navigate to the corresponding tab.
 */

import { useNavigate } from "@tanstack/react-router";

import { Tooltip } from "@/components/primitives";
import { FileText, Film, Image, Mic } from "@/tokens/icons";

import type { SectionKey, SectionReadiness } from "../types";
import { SECTION_STATE_BG } from "../types";

/* --------------------------------------------------------------------------
   Section configuration (workflow order)
   -------------------------------------------------------------------------- */

const SECTIONS: { key: SectionKey; Icon: typeof FileText; tab: string }[] = [
  { key: "metadata", Icon: FileText, tab: "metadata" },
  { key: "images", Icon: Image, tab: "images" },
  { key: "scenes", Icon: Film, tab: "scenes" },
  { key: "speech", Icon: Mic, tab: "speech" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ReadinessIndicatorsProps {
  readiness: Record<SectionKey, SectionReadiness>;
  projectId: number;
  characterId: number;
  /** Which sections are blocking. Non-blocking sections render as muted. */
  blockingDeliverables?: string[];
}

export function ReadinessIndicators({ readiness, projectId, characterId, blockingDeliverables }: ReadinessIndicatorsProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-1 rounded-full bg-black/20 p-0.5 backdrop-blur-sm">
      {SECTIONS.map(({ key, Icon, tab }) => {
        const section = readiness[key];
        const isNonBlocking = blockingDeliverables != null && !blockingDeliverables.includes(key);
        const bg = isNonBlocking ? SECTION_STATE_BG.not_started : SECTION_STATE_BG[section.state];
        const isGrey = section.state === "not_started" || isNonBlocking;

        return (
          <Tooltip key={key} content={section.tooltip} side="left">
            <span
              role="button"
              tabIndex={0}
              aria-label={section.tooltip}
              className="flex items-center justify-center size-[18px] rounded-full cursor-pointer transition-transform hover:scale-110"
              style={{ backgroundColor: bg }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                navigate({
                  to: `/projects/${projectId}/models/${characterId}`,
                  search: { tab },
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  navigate({
                    to: `/projects/${projectId}/models/${characterId}`,
                    search: { tab },
                  });
                }
              }}
            >
              <Icon
                size={10}
                className={isGrey ? "text-[var(--color-surface-primary)]" : "text-white"}
                aria-hidden
              />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
