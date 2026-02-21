import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFocusMode, type FocusMode } from "./useFocusMode";

interface FocusModeTransitionProps {
  /** The focus mode this panel belongs to. If null, shown when no focus is active. */
  mode: FocusMode;
  children: ReactNode;
}

/** Duration of the fade/slide transition in ms. */
const TRANSITION_MS = 200;

/**
 * Wrapper that shows or hides its children based on the current focus mode.
 *
 * - When the current focus mode matches `mode`, content is visible.
 * - When `mode` is `null`, content is visible only when no focus mode is active.
 * - Non-matching panels fade out and are set to `display: none` after the
 *   animation completes.
 */
export function FocusModeTransition({
  mode,
  children,
}: FocusModeTransitionProps) {
  const { focusMode } = useFocusMode();

  // A panel is "active" if focus matches mode, OR if both are null (no focus).
  const isActive = focusMode === mode;

  // Track display state separately so the panel stays in DOM during exit animation.
  const [isVisible, setIsVisible] = useState(isActive);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive) {
      // Immediately make visible so the enter animation plays.
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      setIsVisible(true);
    } else {
      // Delay hiding until exit animation completes.
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, TRANSITION_MS);
    }

    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, [isActive]);

  if (!isVisible && !isActive) {
    return null;
  }

  return (
    <div
      className={cn(
        "transition-[opacity,transform] ease-[var(--ease-default)]",
        isActive
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-1 pointer-events-none",
      )}
      style={{ transitionDuration: `${TRANSITION_MS}ms` }}
    >
      {children}
    </div>
  );
}
