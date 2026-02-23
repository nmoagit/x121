/**
 * Client-side PNG export utility for frame annotations (PRD-70).
 *
 * Creates an offscreen canvas, draws all annotation objects,
 * and returns the canvas for compositing with a video frame.
 */

import type { DrawingObject } from "./types";

/**
 * Render annotation objects onto an offscreen canvas.
 *
 * Returns an `HTMLCanvasElement` that can be composited with the
 * video frame and exported as PNG via `canvas.toDataURL("image/png")`.
 */
export function exportAnnotatedFrame(
  annotations: DrawingObject[],
  frameWidth: number,
  frameHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  for (const annotation of annotations) {
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (annotation.tool) {
      case "pen":
      case "highlight": {
        const points = annotation.data.points as
          | Array<{ x: number; y: number }>
          | undefined;
        if (!points || points.length < 2) break;

        if (annotation.tool === "highlight") {
          ctx.globalAlpha = 0.4;
        }

        const first = points[0];
        if (first) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < points.length; i++) {
            const pt = points[i];
            if (pt) ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
        break;
      }

      case "circle": {
        const { startX, startY, endX, endY } = annotation.data as {
          startX: number;
          startY: number;
          endX: number;
          endY: number;
        };
        const cx = (startX + endX) / 2;
        const cy = (startY + endY) / 2;
        const rx = Math.abs(endX - startX) / 2;
        const ry = Math.abs(endY - startY) / 2;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case "rectangle": {
        const { startX, startY, endX, endY } = annotation.data as {
          startX: number;
          startY: number;
          endX: number;
          endY: number;
        };
        ctx.strokeRect(
          Math.min(startX, endX),
          Math.min(startY, endY),
          Math.abs(endX - startX),
          Math.abs(endY - startY),
        );
        break;
      }

      case "arrow": {
        const { startX, startY, endX, endY } = annotation.data as {
          startX: number;
          startY: number;
          endX: number;
          endY: number;
        };
        const headLen = Math.max(10, annotation.strokeWidth * 3);
        const angle = Math.atan2(endY - startY, endX - startX);

        // Shaft
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
        break;
      }

      case "text": {
        const { x, y, content, fontSize } = annotation.data as {
          x: number;
          y: number;
          content: string;
          fontSize: number;
        };
        ctx.font = `${fontSize ?? 16}px sans-serif`;
        ctx.fillText(content ?? "", x, y);
        break;
      }
    }
  }

  return canvas;
}
