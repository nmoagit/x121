/**
 * BlurredMedia component (PRD-82).
 *
 * Renders an image or video with a CSS blur filter based on the
 * current sensitivity level. For the "placeholder" level, a
 * silhouette icon is shown instead of the actual media.
 */

import { cn } from "@/lib/cn";
import { User } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useSensitivity } from "./SensitivityProvider";
import { BLUR_CSS } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BlurredMediaProps {
  src: string;
  alt?: string;
  type?: "image" | "video";
  /** Which view this media is in (for per-view overrides) */
  viewContext?: string;
  className?: string;
  children?: React.ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BlurredMedia({
  src,
  alt = "",
  type = "image",
  viewContext,
  className,
  children,
}: BlurredMediaProps) {
  const { getViewLevel } = useSensitivity();
  const level = getViewLevel(viewContext ?? "");
  const isPlaceholder = level === "placeholder";

  return (
    <div
      data-testid="blurred-media"
      className={cn(
        "relative overflow-hidden",
        className,
      )}
    >
      {isPlaceholder ? (
        <div
          className={cn(
            "flex items-center justify-center w-full h-full",
            "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]",
          )}
          aria-label="Content hidden"
        >
          <User size={iconSizes.xl} aria-hidden="true" />
        </div>
      ) : (
        <>
          {type === "video" ? (
            <video
              src={src}
              className="w-full h-full object-cover"
              style={{ filter: BLUR_CSS[level] }}
              aria-label={alt}
            />
          ) : (
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
              style={{ filter: BLUR_CSS[level] }}
            />
          )}
        </>
      )}
      {children}
    </div>
  );
}
