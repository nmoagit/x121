/**
 * Ambilight ambient glow effect hook (PRD-036).
 *
 * Samples dominant colors from the four edges of a video frame using an
 * offscreen canvas, then returns a CSS gradient string to apply as a
 * background behind the video. Updates at ~100ms intervals during playback.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Downscaled canvas size for color sampling (kept small for speed). */
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;

/** How many pixels from each edge to sample (in sample-canvas coordinates). */
const EDGE_DEPTH = 3;

/** Minimum interval between color updates in ms. */
const UPDATE_INTERVAL_MS = 100;

/** CSS transition duration for smooth color blending. */
export const AMBILIGHT_TRANSITION = "background 300ms ease";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface AmbilightState {
  /** CSS gradient string ready to apply as a `background` property. */
  gradient: string;
  /** Whether the ambilight effect is currently active. */
  isActive: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function sampleEdgeAccumulated(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): RgbColor {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      r += data[idx]!;
      g += data[idx + 1]!;
      b += data[idx + 2]!;
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0 };

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function rgbStr(c: RgbColor, alpha = 0.6): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function buildGradient(top: RgbColor, right: RgbColor, bottom: RgbColor, left: RgbColor): string {
  // Radial glow from each edge, layered together
  return [
    `radial-gradient(ellipse at top center, ${rgbStr(top)} 0%, transparent 60%)`,
    `radial-gradient(ellipse at bottom center, ${rgbStr(bottom)} 0%, transparent 60%)`,
    `radial-gradient(ellipse at center left, ${rgbStr(left)} 0%, transparent 60%)`,
    `radial-gradient(ellipse at center right, ${rgbStr(right)} 0%, transparent 60%)`,
  ].join(", ");
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useAmbilight(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): AmbilightState {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);

  const [gradient, setGradient] = useState("");
  const [isActive, setIsActive] = useState(false);

  // Initialize the offscreen canvas once.
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
  }, []);

  const sampleColors = useCallback(() => {
    const video = videoRef.current;
    const ctx = ctxRef.current;
    if (!video || !ctx || video.paused || video.readyState < 2) return;

    const now = performance.now();
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(sampleColors);
      return;
    }
    lastUpdateRef.current = now;

    // Draw the current frame onto the small canvas.
    ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const imageData = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const { data } = imageData;

    // Sample the four edge strips.
    const top = sampleEdgeAccumulated(data, SAMPLE_WIDTH, 0, 0, SAMPLE_WIDTH, EDGE_DEPTH);
    const bottom = sampleEdgeAccumulated(
      data,
      SAMPLE_WIDTH,
      0,
      SAMPLE_HEIGHT - EDGE_DEPTH,
      SAMPLE_WIDTH,
      SAMPLE_HEIGHT,
    );
    const left = sampleEdgeAccumulated(data, SAMPLE_WIDTH, 0, 0, EDGE_DEPTH, SAMPLE_HEIGHT);
    const right = sampleEdgeAccumulated(
      data,
      SAMPLE_WIDTH,
      SAMPLE_WIDTH - EDGE_DEPTH,
      0,
      SAMPLE_WIDTH,
      SAMPLE_HEIGHT,
    );

    setGradient(buildGradient(top, right, bottom, left));

    rafRef.current = requestAnimationFrame(sampleColors);
  }, [videoRef]);

  // Start/stop sampling based on video play state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handlePlay() {
      setIsActive(true);
      rafRef.current = requestAnimationFrame(sampleColors);
    }

    function handlePause() {
      cancelAnimationFrame(rafRef.current);
      // Keep the last gradient visible (freeze on pause).
    }

    function handleEnded() {
      cancelAnimationFrame(rafRef.current);
      setIsActive(false);
    }

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    // If the video is already playing when the hook mounts:
    if (!video.paused) {
      setIsActive(true);
      rafRef.current = requestAnimationFrame(sampleColors);
    }

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, sampleColors]);

  return { gradient, isActive };
}
