import { cn } from "@/lib/cn";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  delay?: number;
}

const DEFAULT_DELAY = 300;

const POSITION_CLASSES: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({ content, children, side = "top", delay = DEFAULT_DELAY }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      <span
        role="tooltip"
        className={cn(
          "absolute z-50 whitespace-nowrap pointer-events-none",
          "px-2.5 py-1.5 text-sm rounded-[var(--radius-md)]",
          "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]",
          "shadow-[var(--shadow-md)]",
          "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          POSITION_CLASSES[side],
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
