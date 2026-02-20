import { cn } from "@/lib/cn";
import { useState } from "react";

type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

/** Deterministic hue from a string — used for fallback background color. */
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/** Extract up to two initials from a name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0]?.[0] ?? "").toUpperCase();
  return `${(parts[0]?.[0] ?? "").toUpperCase()}${(parts[parts.length - 1]?.[0] ?? "").toUpperCase()}`;
}

export function Avatar({ src, alt, name, size = "md" }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  const fallbackBg = name ? `hsl(${nameToHue(name)}, 50%, 40%)` : "var(--color-surface-tertiary)";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-full)] overflow-hidden shrink-0",
        "font-medium text-[var(--color-text-inverse)]",
        SIZE_CLASSES[size],
      )}
      style={showImage ? undefined : { backgroundColor: fallbackBg }}
      aria-label={alt ?? name}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt ?? name ?? ""}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span aria-hidden="true">{name ? getInitials(name) : "?"}</span>
      )}
    </span>
  );
}
