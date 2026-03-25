/**
 * Shared entity poster frame display (PRD-96).
 *
 * Renders loading, empty, and poster states for any entity type.
 * Used by AvatarPoster and ScenePoster to eliminate duplication (DRY-444).
 */

import type { ReactNode } from "react";

import { Button ,  ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { useGetPosterFrame } from "./hooks/use-poster-frame";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface EntityPosterProps {
  entityType: "avatar" | "scene";
  entityId: number;
  /** data-testid for testing. */
  testId: string;
  /** Alt text for the poster image. */
  altText: string;
  /** Optional extra content rendered at the start of the overlay (e.g., Badge). */
  overlayContent?: ReactNode;
  /** Callback when the user wants to change the poster. */
  onChange?: () => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function EntityPoster({
  entityType,
  entityId,
  testId,
  altText,
  overlayContent,
  onChange,
  className,
}: EntityPosterProps) {
  const { data: posterFrame, isLoading } = useGetPosterFrame(
    entityType,
    entityId,
  );

  if (isLoading) {
    return (
      <div
        data-testid={testId}
        className={cn(
          "flex aspect-video items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
          className,
        )}
      >
        <ContextLoader size={32} />
      </div>
    );
  }

  if (!posterFrame) {
    return (
      <div
        data-testid={testId}
        className={cn(
          "flex aspect-video flex-col items-center justify-center gap-2",
          "rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)]",
          "bg-[var(--color-surface-secondary)]",
          className,
        )}
      >
        <p className="text-xs text-[var(--color-text-muted)]">
          No poster frame set
        </p>
        {onChange && (
          <Button variant="secondary" size="sm" onClick={onChange}>
            Select frame
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-md)]",
        "border border-[var(--color-border-default)]",
        className,
      )}
    >
      <img
        src={posterFrame.image_path}
        alt={altText}
        className="aspect-video w-full object-cover"
        style={{
          filter: `brightness(${posterFrame.brightness}) contrast(${posterFrame.contrast})`,
        }}
      />

      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2",
          overlayContent
            ? "flex items-center justify-between"
            : "flex items-end justify-end",
        )}
      >
        {overlayContent}
        {onChange && (
          <Button
            variant="ghost"
            size="sm"
            className="text-white opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onChange}
          >
            Change
          </Button>
        )}
      </div>
    </div>
  );
}
