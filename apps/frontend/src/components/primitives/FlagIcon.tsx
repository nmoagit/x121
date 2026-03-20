/**
 * Rectangular flag icon using flagcdn.com.
 *
 * Falls back to the uppercase country code text when the image fails to load.
 */

import { cn } from "@/lib/cn";
import { useState } from "react";

interface FlagIconProps {
  /** ISO 3166-1 alpha-2 flag code (lowercase), e.g. "us", "gb", "de". */
  flagCode: string;
  /** Height in pixels. Width is auto (3:2 aspect). Default 14. */
  size?: number;
  className?: string;
}

export function FlagIcon({ flagCode, size = 10, className }: FlagIconProps) {
  const [failed, setFailed] = useState(false);
  const code = flagCode.toLowerCase();
  const width = Math.round(size * 1.5);

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[2px]",
          "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]",
          "font-semibold font-mono leading-none select-none",
          className,
        )}
        style={{ width, height: size, fontSize: size * 0.45 }}
        aria-label={code.toUpperCase()}
      >
        {code.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={`${code.toUpperCase()} flag`}
      width={width}
      height={size}
      className={cn("inline-block rounded-[2px] shrink-0 object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
