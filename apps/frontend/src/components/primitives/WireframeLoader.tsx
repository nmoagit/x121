/**
 * Animated wireframe logo loader.
 *
 * Draws the provided text avatar-by-avatar with stroke-dashoffset
 * animation in cyan, holds briefly, then fades out and redraws — matching
 * the terminal hacker aesthetic.
 *
 * Supports custom text per context:
 * - "αN2N" for the global app
 * - "x121" inside the x121 pipeline
 * - "y122" inside the y122 pipeline
 * - Or any short string
 */

import { cn } from "@/lib/cn";

interface WireframeLoaderProps {
  /** Overall size in pixels (width). @default 64 */
  size?: number;
  /** Text to render. @default "αN2N" */
  text?: string;
  /** CSS class for the wrapper. */
  className?: string;
}

/*
 * Glyph library — each avatar has an SVG path for a 20-unit wide cell
 * in a 0–40 height space. Avatars are positioned dynamically.
 */
interface Glyph {
  d: string;
  len: number;
}

const GLYPH_MAP: Record<string, Glyph> = {
  // Lowercase alpha (α) — a curved open shape
  α: { d: "M16,14 Q10,10 6,16 Q2,24 6,30 Q10,36 16,32 L16,14 L16,36", len: 80 },
  // Uppercase N
  N: { d: "M2,36 L2,4 L18,36 L18,4", len: 96 },
  // Digits
  "0": { d: "M10,4 Q2,4 2,20 Q2,36 10,36 Q18,36 18,20 Q18,4 10,4", len: 100 },
  "1": { d: "M8,8 L12,4 L12,36 M8,36 L16,36", len: 52 },
  "2": { d: "M4,10 Q4,4 10,4 L14,4 Q20,4 20,10 Q20,16 14,20 L4,36 L20,36", len: 100 },
  "3": { d: "M4,8 Q4,4 10,4 L14,4 Q20,4 20,10 Q20,16 14,20 Q20,24 20,30 Q20,36 14,36 L10,36 Q4,36 4,32", len: 110 },
  "4": { d: "M16,36 L16,4 L2,28 L20,28", len: 80 },
  "5": { d: "M18,4 L4,4 L4,18 Q4,16 10,16 Q18,16 18,24 Q18,36 10,36 Q4,36 4,32", len: 100 },
  "6": { d: "M16,4 L6,20 Q2,28 6,34 Q10,38 16,34 Q20,28 16,22 Q12,18 6,22", len: 100 },
  "7": { d: "M2,4 L18,4 L8,36", len: 60 },
  "8": { d: "M10,20 Q2,16 2,10 Q2,4 10,4 Q18,4 18,10 Q18,16 10,20 Q2,24 2,30 Q2,36 10,36 Q18,36 18,30 Q18,24 10,20", len: 130 },
  "9": { d: "M14,36 L14,20 Q18,12 14,6 Q10,2 4,6 Q0,12 4,18 Q8,22 14,18", len: 100 },
  // Lowercase x
  x: { d: "M2,16 L18,36 M18,16 L2,36", len: 56 },
  // Uppercase Y
  Y: { d: "M2,4 L10,20 L18,4 M10,20 L10,36", len: 60 },
};

const CELL_WIDTH = 20;
const GLYPH_GAP = 2;
const DUR = 1.6;
const STROKE_COLOR = "var(--color-action-primary, #22d3ee)";

function buildGlyphs(text: string) {
  const chars = [...text];
  const totalWidth = chars.length * CELL_WIDTH + (chars.length - 1) * GLYPH_GAP;
  const delayStep = (DUR * 0.5) / Math.max(chars.length, 1);

  return {
    totalWidth,
    glyphs: chars.map((ch, i) => {
      const glyph = GLYPH_MAP[ch] ?? GLYPH_MAP[ch.toLowerCase()] ?? GLYPH_MAP["0"]!;
      const offsetX = i * (CELL_WIDTH + GLYPH_GAP);
      return {
        d: glyph!.d,
        len: glyph!.len,
        delay: i * delayStep,
        offsetX,
      };
    }),
  };
}

export function WireframeLoader({ size = 64, text = "αN2N", className }: WireframeLoaderProps) {
  const { totalWidth, glyphs } = buildGlyphs(text);
  const viewHeight = 40;
  const height = Math.round(size * (viewHeight / totalWidth));

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${totalWidth} ${viewHeight}`}
        fill="none"
        aria-label="Loading"
        role="img"
      >
        {/* Scan line */}
        <line x1="0" y1="0" x2={totalWidth} y2="0" stroke={STROKE_COLOR} strokeWidth="0.4" opacity="0.12">
          <animate attributeName="y1" values={`0;${viewHeight};0`} dur={`${DUR}s`} repeatCount="indefinite" />
          <animate attributeName="y2" values={`0;${viewHeight};0`} dur={`${DUR}s`} repeatCount="indefinite" />
        </line>

        {/* Each glyph drawn sequentially */}
        {glyphs.map((g, i) => (
          <g key={i} transform={`translate(${g.offsetX}, 0)`}>
            <path
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
              <animate
                attributeName="stroke-dashoffset"
                values={`${g.len};0;0;${g.len}`}
                keyTimes="0;0.35;0.7;1"
                dur={`${DUR}s`}
                begin={`${g.delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0.9;0.9;0"
                keyTimes="0;0.15;0.7;1"
                dur={`${DUR}s`}
                begin={`${g.delay}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        ))}

        {/* Subtle glow pulse behind text */}
        <rect x={totalWidth * 0.1} y="8" width={totalWidth * 0.8} height="24" rx="4" fill={STROKE_COLOR}>
          <animate attributeName="opacity" values="0;0.03;0" dur={`${DUR}s`} repeatCount="indefinite" />
        </rect>
      </svg>
    </div>
  );
}
