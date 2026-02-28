/**
 * Visual feedback overlay shown during a swipe gesture (PRD-55).
 *
 * Displays a color tint and icon corresponding to the swipe direction:
 * - Right = Approve (green)
 * - Left = Reject (red)
 * - Up = Flag (yellow)
 */

import { cn } from "@/lib/cn";
import { AlertTriangle, Check, XCircle } from "@/tokens/icons";

import type { SwipeDirection } from "./hooks/use-swipe-gesture";
import { SWIPE_ACTION_COLOR, SWIPE_ACTION_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SwipeOverlayProps {
  direction: SwipeDirection;
  progress: number;
}

/* --------------------------------------------------------------------------
   Direction mapping
   -------------------------------------------------------------------------- */

const DIRECTION_CONFIG: Record<
  NonNullable<SwipeDirection>,
  { label: string; color: string; icon: typeof Check }
> = {
  right: { label: SWIPE_ACTION_LABEL.approve, color: SWIPE_ACTION_COLOR.approve, icon: Check },
  left: { label: SWIPE_ACTION_LABEL.reject, color: SWIPE_ACTION_COLOR.reject, icon: XCircle },
  up: { label: SWIPE_ACTION_LABEL.flag, color: SWIPE_ACTION_COLOR.flag, icon: AlertTriangle },
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SwipeOverlay({ direction, progress }: SwipeOverlayProps) {
  if (!direction || progress <= 0) return null;

  const config = DIRECTION_CONFIG[direction];
  const Icon = config.icon;
  const opacity = Math.min(progress * 0.6, 0.6);

  return (
    <div
      data-testid="swipe-overlay"
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center",
        "rounded-[var(--radius-md)] pointer-events-none transition-opacity",
      )}
      style={{ backgroundColor: config.color, opacity }}
      aria-hidden="true"
    >
      <Icon size={48} className="text-white" />
      <span className="mt-2 text-lg font-bold text-white">{config.label}</span>
    </div>
  );
}
