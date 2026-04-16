/**
 * Shared primitives used across all footer segments.
 *
 * - FooterSegment: clickable wrapper that renders as <Link> or <button>
 * - StatusDot: 8 px coloured circle mapped to service health
 * - Separator: thin vertical divider between segments
 * - MiniProgressBar: ~60 px inline progress indicator
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { ServiceHealth } from "./types";

/* --------------------------------------------------------------------------
   FooterSegment
   -------------------------------------------------------------------------- */

interface FooterSegmentLinkProps {
  href: string;
  onClick?: never;
  children: ReactNode;
  className?: string;
  label: string;
}

interface FooterSegmentButtonProps {
  href?: never;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}

type FooterSegmentProps = FooterSegmentLinkProps | FooterSegmentButtonProps;

const SEGMENT_CLASSES = cn(
  "flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono",
  "text-[var(--color-text-muted)]",
  "transition-colors duration-150",
  "hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]",
  "rounded-[2px]",
);

export function FooterSegment({ href, onClick, children, className, label }: FooterSegmentProps) {
  if (href) {
    return (
      <Link to={href} className={cn(SEGMENT_CLASSES, className)} aria-label={label}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(SEGMENT_CLASSES, className)} aria-label={label}>
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------------
   StatusDot
   -------------------------------------------------------------------------- */

const DOT_COLORS: Record<ServiceHealth, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  down: "bg-red-500",
};

interface StatusDotProps {
  health: ServiceHealth;
}

export function StatusDot({ health }: StatusDotProps) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT_COLORS[health])} />;
}

/* --------------------------------------------------------------------------
   Separator
   -------------------------------------------------------------------------- */

export function Separator() {
  return <span className="mx-1 h-3.5 w-px shrink-0 bg-white/10" aria-hidden="true" />;
}

/* --------------------------------------------------------------------------
   MiniProgressBar
   -------------------------------------------------------------------------- */

interface MiniProgressBarProps {
  progress: number; // 0–100
}

export function MiniProgressBar({ progress }: MiniProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <span
      className="relative inline-block h-1.5 w-[60px] overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-cyan-400 transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
