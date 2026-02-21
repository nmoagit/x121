/**
 * jogDialPhysics — Physics engine for the virtual jog dial.
 *
 * Handles rotation tracking from mouse/touch input, momentum-based
 * deceleration, and configurable sensitivity. Converts angular
 * displacement into discrete frame steps.
 */

/* --------------------------------------------------------------------------
   Configuration
   -------------------------------------------------------------------------- */

export interface JogDialPhysicsConfig {
  /** Degrees of rotation per frame step. Lower = more sensitive. Default: 15 */
  degreesPerStep: number;
  /** Friction coefficient for momentum deceleration (0-1). Default: 0.92 */
  friction: number;
  /** Minimum angular velocity (deg/s) below which momentum stops. Default: 5 */
  stopThreshold: number;
  /** Maximum frames per momentum tick. Prevents runaway scrolling. Default: 10 */
  maxFramesPerTick: number;
}

const DEFAULT_CONFIG: JogDialPhysicsConfig = {
  degreesPerStep: 15,
  friction: 0.92,
  stopThreshold: 5,
  maxFramesPerTick: 10,
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */

export interface JogDialPhysicsState {
  /** Current cumulative angle in degrees. */
  angle: number;
  /** Angular velocity in degrees per second (positive = clockwise). */
  angularVelocity: number;
  /** Whether the user is actively dragging. */
  isDragging: boolean;
  /** Accumulated fractional steps (sub-step precision). */
  accumulatedDegrees: number;
}

/* --------------------------------------------------------------------------
   Engine
   -------------------------------------------------------------------------- */

export class JogDialPhysicsEngine {
  private config: JogDialPhysicsConfig;
  private state: JogDialPhysicsState;
  private lastTimestamp: number = 0;
  private animFrameId: number = 0;
  private onStep: ((direction: "forward" | "backward", frames: number) => void) | null = null;

  // Drag tracking
  private centerX: number = 0;
  private centerY: number = 0;
  private lastAngleFromCenter: number = 0;
  private lastDragTimestamp: number = 0;

  constructor(config: Partial<JogDialPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      angle: 0,
      angularVelocity: 0,
      isDragging: false,
      accumulatedDegrees: 0,
    };
  }

  /** Set the callback for frame steps. */
  setOnStep(cb: (direction: "forward" | "backward", frames: number) => void): void {
    this.onStep = cb;
  }

  /** Update configuration at runtime. */
  setConfig(config: Partial<JogDialPhysicsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get current read-only state. */
  getState(): Readonly<JogDialPhysicsState> {
    return { ...this.state };
  }

  /* --------------------------------------------------------------------------
     Drag API — call from mouse/touch event handlers
     -------------------------------------------------------------------------- */

  /** Start a drag from a pointer position relative to the dial center. */
  startDrag(pointerX: number, pointerY: number, dialCenterX: number, dialCenterY: number): void {
    this.centerX = dialCenterX;
    this.centerY = dialCenterY;
    this.lastAngleFromCenter = this.angleFromPointer(pointerX, pointerY);
    this.lastDragTimestamp = performance.now();
    this.state.isDragging = true;
    this.state.angularVelocity = 0;
    this.stopMomentum();
  }

  /** Continue drag — returns number of frame steps to emit this tick. */
  drag(pointerX: number, pointerY: number): void {
    if (!this.state.isDragging) return;

    const now = performance.now();
    const currentAngle = this.angleFromPointer(pointerX, pointerY);
    let delta = currentAngle - this.lastAngleFromCenter;

    // Handle wrap-around at +/-180 degrees.
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Track velocity for momentum.
    const dt = (now - this.lastDragTimestamp) / 1000;
    if (dt > 0) {
      this.state.angularVelocity = delta / dt;
    }

    this.state.angle += delta;
    this.state.accumulatedDegrees += delta;
    this.lastAngleFromCenter = currentAngle;
    this.lastDragTimestamp = now;

    this.emitSteps();
  }

  /** End the drag and begin momentum deceleration. */
  endDrag(): void {
    this.state.isDragging = false;
    if (Math.abs(this.state.angularVelocity) > this.config.stopThreshold) {
      this.startMomentum();
    }
  }

  /* --------------------------------------------------------------------------
     Momentum
     -------------------------------------------------------------------------- */

  private startMomentum(): void {
    this.stopMomentum();
    this.lastTimestamp = performance.now();
    this.tickMomentum();
  }

  private stopMomentum(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  private tickMomentum = (): void => {
    const now = performance.now();
    const dt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    // Apply friction.
    this.state.angularVelocity *= this.config.friction;

    // Stop if below threshold.
    if (Math.abs(this.state.angularVelocity) < this.config.stopThreshold) {
      this.state.angularVelocity = 0;
      this.animFrameId = 0;
      return;
    }

    // Advance angle by velocity.
    const delta = this.state.angularVelocity * dt;
    this.state.angle += delta;
    this.state.accumulatedDegrees += delta;

    this.emitSteps();

    this.animFrameId = requestAnimationFrame(this.tickMomentum);
  };

  /* --------------------------------------------------------------------------
     Step Emission
     -------------------------------------------------------------------------- */

  /** Convert accumulated degrees into discrete frame steps. */
  private emitSteps(): void {
    const { degreesPerStep, maxFramesPerTick } = this.config;
    const accumulated = this.state.accumulatedDegrees;

    const rawSteps = Math.trunc(accumulated / degreesPerStep);
    if (rawSteps === 0) return;

    const clampedSteps = Math.min(Math.abs(rawSteps), maxFramesPerTick);
    const direction: "forward" | "backward" = rawSteps > 0 ? "forward" : "backward";

    // Consume the degrees that produced these steps.
    this.state.accumulatedDegrees -= rawSteps * degreesPerStep;

    this.onStep?.(direction, clampedSteps);
  }

  /* --------------------------------------------------------------------------
     Helpers
     -------------------------------------------------------------------------- */

  /** Calculate the angle (in degrees) from the dial center to a pointer position. */
  private angleFromPointer(x: number, y: number): number {
    return Math.atan2(y - this.centerY, x - this.centerX) * (180 / Math.PI);
  }

  /** Cleanup any running animations. */
  dispose(): void {
    this.stopMomentum();
    this.onStep = null;
  }
}
