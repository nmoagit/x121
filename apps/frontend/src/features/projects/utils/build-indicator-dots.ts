/**
 * Build dynamic indicator dots for avatar cards (PRD-148).
 *
 * Produces an ordered list of dots based on the pipeline's blocking
 * deliverables configuration. Each dot describes a piece of seed data
 * that must be present before an avatar is considered "complete".
 */

import type { ComponentType } from "react";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/avatars/types";
import { FileText, Film, Image, Mic } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface IndicatorDot {
  key: string;
  label: string;
  present: boolean;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Which avatar detail tab this dot relates to. */
  tab: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

// Default deliverable sections that require user input.
// Scenes are generated (not user-provided), so excluded from default indicators.
const DEFAULT_BLOCKING = ["images", "metadata", "speech"];

/* --------------------------------------------------------------------------
   Builder
   -------------------------------------------------------------------------- */

export function buildIndicatorDots(opts: {
  /** Pipeline tracks that need seed images. */
  tracks: { name: string; slug: string }[];
  blockingDeliverables: string[] | null;
  avatarVariantTypes: Set<string>;
  avatarMetadata: Record<string, unknown> | null;
  hasScenes?: boolean;
  hasSpeech?: boolean;
  /** When true, only show indicators for user-provided inputs (images, metadata, speech) — exclude generated outputs (scenes). */
  inputsOnly?: boolean;
}): IndicatorDot[] {
  const blocking = (opts.blockingDeliverables ?? DEFAULT_BLOCKING)
    .filter((b) => !opts.inputsOnly || b !== "scenes");
  if (blocking.length === 0) return [];

  const dots: IndicatorDot[] = [];

  // Images — one dot per pipeline track
  if (blocking.includes("images")) {
    for (const track of opts.tracks) {
      dots.push({
        key: `img-${track.slug}`,
        label: `${track.name} image`,
        present: opts.avatarVariantTypes.has(track.slug.toLowerCase()),
        icon: Image,
        tab: "images",
      });
    }
  }

  // Metadata — Bio + Tone of Voice
  if (blocking.includes("metadata")) {
    const meta = opts.avatarMetadata;
    dots.push({
      key: "meta-bio",
      label: "Bio",
      present: meta?.[SOURCE_KEY_BIO] != null,
      icon: FileText,
      tab: "metadata",
    });
    dots.push({
      key: "meta-tov",
      label: "Tone of Voice",
      present: meta?.[SOURCE_KEY_TOV] != null,
      icon: FileText,
      tab: "metadata",
    });
  }

  // Scenes
  if (blocking.includes("scenes")) {
    dots.push({
      key: "scenes",
      label: "Scenes",
      present: opts.hasScenes ?? false,
      icon: Film,
      tab: "scenes",
    });
  }

  // Speech
  if (blocking.includes("speech")) {
    dots.push({
      key: "speech",
      label: "Speech",
      present: opts.hasSpeech ?? false,
      icon: Mic,
      tab: "speech",
    });
  }

  return dots;
}
