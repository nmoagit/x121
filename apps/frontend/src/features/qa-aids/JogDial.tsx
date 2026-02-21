/**
 * JogDial — Circular dial widget for frame-by-frame video navigation.
 *
 * Clockwise rotation = forward, counter-clockwise = backward.
 * Speed is proportional to rotation rate. Supports both mouse and touch.
 * Uses JogDialPhysicsEngine for momentum and deceleration.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { JogDialPhysicsEngine } from "./jogDialPhysics";
import type { JogDialPhysicsConfig } from "./jogDialPhysics";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface JogDialProps {
  /** Called when the dial steps forward or backward. */
  onStep: (direction: "forward" | "backward", frames: number) => void;
  /** Override physics configuration. */
  physicsConfig?: Partial<JogDialPhysicsConfig>;
  /** Dial diameter in pixels. Default: 120 */
  size?: number;
  /** Additional className. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_SIZE = 120;
const TICK_COUNT = 24;
const NOTCH_LENGTH = 8;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JogDial({
  onStep,
  physicsConfig,
  size = DEFAULT_SIZE,
  className,
}: JogDialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<JogDialPhysicsEngine | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize physics engine.
  useEffect(() => {
    const engine = new JogDialPhysicsEngine(physicsConfig);
    engine.setOnStep(onStep);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [onStep, physicsConfig]);

  // Sync rotation display with engine state via animation frame.
  useEffect(() => {
    let animId: number;

    function tick() {
      const state = engineRef.current?.getState();
      if (state) {
        setRotation(state.angle);
        setIsDragging(state.isDragging);
      }
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  /** Get the center of the dial element. */
  const getDialCenter = useCallback((): { cx: number; cy: number } => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    };
  }, []);

  /** Mouse down — start dragging the dial. */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const { cx, cy } = getDialCenter();
      engineRef.current?.startDrag(e.clientX, e.clientY, cx, cy);
    },
    [getDialCenter],
  );

  /** Touch start — start dragging the dial (touch). */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const { cx, cy } = getDialCenter();
      engineRef.current?.startDrag(touch.clientX, touch.clientY, cx, cy);
    },
    [getDialCenter],
  );

  // Global mouse/touch move and up handlers.
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      engineRef.current?.drag(e.clientX, e.clientY);
    }

    function handleMouseUp() {
      engineRef.current?.endDrag();
    }

    function handleTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      engineRef.current?.drag(touch.clientX, touch.clientY);
    }

    function handleTouchEnd() {
      engineRef.current?.endDrag();
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const radius = size / 2;
  const innerRadius = radius - NOTCH_LENGTH - 4;

  return (
    <div
      ref={dialRef}
      className={cn(
        "relative select-none touch-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="slider"
      aria-label="Jog dial for frame navigation"
      aria-valuetext={`Rotation: ${Math.round(rotation)} degrees`}
      tabIndex={0}
      data-testid="jog-dial"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        {/* Outer ring */}
        <circle
          cx={radius}
          cy={radius}
          r={radius - 2}
          fill="var(--color-surface-secondary)"
          stroke="var(--color-border-default)"
          strokeWidth={2}
        />

        {/* Inner ring */}
        <circle
          cx={radius}
          cy={radius}
          r={innerRadius}
          fill="var(--color-surface-primary)"
          stroke="var(--color-border-default)"
          strokeWidth={1}
        />

        {/* Tick marks (rotate with the dial) */}
        <g transform={`rotate(${rotation} ${radius} ${radius})`}>
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const angle = (i / TICK_COUNT) * 360;
            const rads = (angle * Math.PI) / 180;
            const outerR = radius - 4;
            const innerR = radius - 4 - NOTCH_LENGTH;

            const x1 = radius + Math.cos(rads) * innerR;
            const y1 = radius + Math.sin(rads) * innerR;
            const x2 = radius + Math.cos(rads) * outerR;
            const y2 = radius + Math.sin(rads) * outerR;

            const isMajor = i % 6 === 0;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  isMajor
                    ? "var(--color-text-primary)"
                    : "var(--color-text-muted)"
                }
                strokeWidth={isMajor ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Direction indicator dot */}
          <circle
            cx={radius}
            cy={radius - innerRadius + 6}
            r={3}
            fill="var(--color-action-primary)"
          />
        </g>

        {/* Center hub */}
        <circle
          cx={radius}
          cy={radius}
          r={8}
          fill="var(--color-surface-tertiary)"
          stroke="var(--color-border-default)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
