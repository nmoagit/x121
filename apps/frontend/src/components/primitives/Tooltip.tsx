import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Placement direction for tooltips, hints, and popovers. */
export type Placement = "top" | "bottom" | "left" | "right";

/** @deprecated Use `Placement` instead. */
type TooltipSide = Placement;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  delay?: number;
}

const DEFAULT_DELAY = 100;

/** CSS positioning classes for each placement direction. Shared by Tooltip and ContextualHint. */
export const PLACEMENT_CLASSES: Record<Placement, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const TOOLTIP_GAP = 8;

/** Estimated tooltip height for overflow detection (px). */
const ESTIMATED_TOOLTIP_HEIGHT = 160;

function rawPosition(rect: DOMRect, side: Placement): { top: number; left: number } {
  switch (side) {
    case "top":
      return { top: rect.top - TOOLTIP_GAP, left: rect.left + rect.width / 2 };
    case "bottom":
      return { top: rect.bottom + TOOLTIP_GAP, left: rect.left + rect.width / 2 };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - TOOLTIP_GAP };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + TOOLTIP_GAP };
  }
}

/** Compute position with automatic flip when the tooltip would overflow the viewport. */
function computePosition(
  rect: DOMRect,
  side: Placement,
): { top: number; left: number; resolvedSide: Placement } {
  const pos = rawPosition(rect, side);
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  let resolvedSide = side;

  // Check if the tooltip overflows and flip if needed
  if (side === "bottom" && pos.top + ESTIMATED_TOOLTIP_HEIGHT > vh) {
    resolvedSide = "top";
  } else if (side === "top" && pos.top - ESTIMATED_TOOLTIP_HEIGHT < 0) {
    resolvedSide = "bottom";
  } else if (side === "right" && pos.left + ESTIMATED_TOOLTIP_HEIGHT > vw) {
    resolvedSide = "left";
  } else if (side === "left" && pos.left - ESTIMATED_TOOLTIP_HEIGHT < 0) {
    resolvedSide = "right";
  }

  if (resolvedSide !== side) {
    const flipped = rawPosition(rect, resolvedSide);
    return { ...flipped, resolvedSide };
  }

  return { ...pos, resolvedSide };
}

const TRANSFORM: Record<Placement, string> = {
  top: "translate(-50%, -100%)",
  bottom: "translate(-50%, 0)",
  left: "translate(-100%, -50%)",
  right: "translate(0, -50%)",
};

export function Tooltip({ content, children, side = "top", delay = DEFAULT_DELAY }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; resolvedSide: Placement } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPos(computePosition(rect, side));
      }
      setVisible(true);
    }, delay);
  }, [delay, side]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setPos(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && pos && createPortal(
        <span
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: TRANSFORM[pos.resolvedSide],
            zIndex: 9999,
          }}
          className={cn(
            "whitespace-nowrap pointer-events-none",
            "px-2.5 py-1.5 text-xs rounded-[var(--radius-md)]",
            "bg-[var(--color-surface-tooltip)] text-[var(--color-text-tooltip)]",
            "shadow-[var(--shadow-md)]",
            "animate-[fadeIn_var(--duration-instant)_var(--ease-default)]",
          )}
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  );
}
