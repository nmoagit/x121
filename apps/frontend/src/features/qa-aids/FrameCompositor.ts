/**
 * FrameCompositor — Composites two video frames using Canvas 2D.
 *
 * Used by the ghosting overlay to superimpose a previous/next frame
 * on the current frame at adjustable opacity, revealing temporal
 * inconsistencies like jitter, drift, and boundary pops.
 */

/** Accepted input types for compositing. */
export type FrameInput = ImageData | HTMLVideoElement | HTMLCanvasElement;

export class FrameCompositor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("FrameCompositor: Failed to get 2D rendering context");
    }
    this.ctx = ctx;
  }

  /** Resize the internal canvas (call when video dimensions change). */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Get the internal canvas dimensions. */
  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  /**
   * Composite two frames with adjustable overlay opacity.
   *
   * Draws the base frame at full opacity, then overlays the second frame
   * using globalAlpha. The result captures temporal differences as visible
   * "doubled" edges.
   *
   * @param baseFrame - Current frame (drawn at 100% opacity)
   * @param overlayFrame - Previous or next frame (drawn at `opacity`)
   * @param opacity - Overlay opacity (0.0 to 1.0)
   * @returns Composited ImageData
   */
  composite(
    baseFrame: FrameInput,
    overlayFrame: FrameInput,
    opacity: number,
  ): ImageData {
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    const { ctx, canvas } = this;
    const { width, height } = canvas;

    // Draw the base frame at full opacity.
    ctx.globalAlpha = 1.0;
    this.drawFrame(baseFrame, width, height);

    // Overlay the ghost frame at reduced opacity.
    ctx.globalAlpha = clampedOpacity;
    this.drawFrame(overlayFrame, width, height);

    // Reset alpha and return the composited result.
    ctx.globalAlpha = 1.0;
    return ctx.getImageData(0, 0, width, height);
  }

  /**
   * Composite and draw directly onto a target canvas for zero-copy rendering.
   * More efficient than `composite()` when you just need to display the result.
   */
  compositeToCanvas(
    target: HTMLCanvasElement,
    baseFrame: FrameInput,
    overlayFrame: FrameInput,
    opacity: number,
  ): void {
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    const targetCtx = target.getContext("2d");
    if (!targetCtx) return;

    const { width, height } = target;

    targetCtx.clearRect(0, 0, width, height);

    // Draw base at full opacity.
    targetCtx.globalAlpha = 1.0;
    this.drawFrameToCtx(targetCtx, baseFrame, width, height);

    // Draw overlay at reduced opacity.
    targetCtx.globalAlpha = clampedOpacity;
    this.drawFrameToCtx(targetCtx, overlayFrame, width, height);

    targetCtx.globalAlpha = 1.0;
  }

  /** Draw a single frame source onto the internal canvas. */
  private drawFrame(frame: FrameInput, width: number, height: number): void {
    this.drawFrameToCtx(this.ctx, frame, width, height);
  }

  /** Draw a frame source onto any 2D context. */
  private drawFrameToCtx(
    ctx: CanvasRenderingContext2D,
    frame: FrameInput,
    width: number,
    height: number,
  ): void {
    if (frame instanceof ImageData) {
      ctx.putImageData(frame, 0, 0);
    } else {
      // HTMLVideoElement or HTMLCanvasElement
      ctx.drawImage(frame, 0, 0, width, height);
    }
  }
}
