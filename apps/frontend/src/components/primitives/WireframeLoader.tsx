/**
 * Animated wireframe "X121" logo loader.
 *
 * Each character (X, 1, 2, 1) is drawn sequentially with stroke-dashoffset
 * animation in cyan, holds briefly, then fades out and redraws — matching
 * the terminal hacker aesthetic.
 */

import { cn } from "@/lib/cn";

interface WireframeLoaderProps {
  /** Overall size in pixels (width). @default 64 */
  size?: number;
  /** CSS class for the wrapper. */
  className?: string;
}

/*
 * Each glyph is a path in a 100×40 viewBox, positioned side by side:
 *   X  → x: 0–22
 *   1  → x: 26–38
 *   2  → x: 42–62
 *   1  → x: 66–78
 *
 * Strokes are designed to look hand-drawn / wireframe.
 */
const GLYPHS = [
  {
    // x — lowercase, two shorter diagonal strokes sitting on the baseline
    d: "M2,16 L20,36 M20,16 L2,36",
    len: 56,
    delay: 0,
  },
  {
    // 1 — serif base, vertical, top hook
    d: "M28,8 L32,4 L32,36 M28,36 L36,36",
    len: 52,
    delay: 0.4,
  },
  {
    // 2 — top arc, diagonal, base
    d: "M44,10 Q44,4 50,4 L56,4 Q62,4 62,10 Q62,16 56,20 L44,36 L62,36",
    len: 100,
    delay: 0.8,
  },
  {
    // 1 — serif base, vertical, top hook (second instance)
    d: "M68,8 L72,4 L72,36 M68,36 L76,36",
    len: 52,
    delay: 1.2,
  },
];

const DUR = 3.2;
const STROKE_COLOR = "var(--color-action-primary, #22d3ee)";

export function WireframeLoader({ size = 64, className }: WireframeLoaderProps) {
  // Maintain aspect ratio: viewBox is 80x40, so height = size * 0.5
  const height = Math.round(size * 0.5);

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={height}
        viewBox="0 0 80 40"
        fill="none"
        aria-label="Loading"
        role="img"
      >
        {/* Scan line */}
        <line x1="0" y1="0" x2="80" y2="0" stroke={STROKE_COLOR} strokeWidth="0.4" opacity="0.12">
          <animate attributeName="y1" values="0;40;0" dur={`${DUR}s`} repeatCount="indefinite" />
          <animate attributeName="y2" values="0;40;0" dur={`${DUR}s`} repeatCount="indefinite" />
        </line>

        {/* Each glyph drawn sequentially */}
        {GLYPHS.map((g, i) => (
          <path
            key={i}
            d={g.d}
            stroke={STROKE_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={g.len}
            strokeDashoffset={g.len}
            opacity="0"
          >
            {/* Draw stroke */}
            <animate
              attributeName="stroke-dashoffset"
              values={`${g.len};0;0;${g.len}`}
              keyTimes="0;0.35;0.7;1"
              dur={`${DUR}s`}
              begin={`${g.delay}s`}
              repeatCount="indefinite"
            />
            {/* Fade in → hold → fade out */}
            <animate
              attributeName="opacity"
              values="0;0.9;0.9;0"
              keyTimes="0;0.15;0.7;1"
              dur={`${DUR}s`}
              begin={`${g.delay}s`}
              repeatCount="indefinite"
            />
          </path>
        ))}

        {/* Subtle glow pulse behind text */}
        <rect x="10" y="8" width="60" height="24" rx="4" fill={STROKE_COLOR}>
          <animate attributeName="opacity" values="0;0.03;0" dur={`${DUR}s`} repeatCount="indefinite" />
        </rect>
      </svg>
    </div>
  );
}
