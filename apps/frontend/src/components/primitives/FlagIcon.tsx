/**
 * Circular flag icon using the circle-flags SVG library (PRD-136).
 *
 * Uses the hatscripts/circle-flags CDN for SVG flags.
 * Falls back to the uppercase country code text when the image fails to load.
 */

import { cn } from "@/lib/cn";
import { useState } from "react";

const FLAG_CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";

interface FlagIconProps {
  /** ISO 3166-1 alpha-2 flag code (lowercase), e.g. "us", "gb", "de". */
  flagCode: string;
  /** Size in pixels. Default 20. */
  size?: number;
  className?: string;
}

export function FlagIcon({ flagCode, size = 20, className }: FlagIconProps) {
  const [failed, setFailed] = useState(false);
  const code = flagCode.toLowerCase();

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]",
          "font-semibold leading-none select-none",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label={code.toUpperCase()}
      >
        {code.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`${FLAG_CDN_BASE}/${code}.svg`}
      alt={`${code.toUpperCase()} flag`}
      width={size}
      height={size}
      className={cn("inline-block rounded-full shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}
