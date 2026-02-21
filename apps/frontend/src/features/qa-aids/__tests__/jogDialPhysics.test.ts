import { describe, expect, it, vi } from "vitest";

import { JogDialPhysicsEngine } from "../jogDialPhysics";

describe("JogDialPhysicsEngine", () => {
  it("initializes with default state", () => {
    const engine = new JogDialPhysicsEngine();
    const state = engine.getState();

    expect(state.angle).toBe(0);
    expect(state.angularVelocity).toBe(0);
    expect(state.isDragging).toBe(false);
    expect(state.accumulatedDegrees).toBe(0);
  });

  it("sets isDragging to true when startDrag is called", () => {
    const engine = new JogDialPhysicsEngine();
    engine.startDrag(100, 0, 50, 50);

    expect(engine.getState().isDragging).toBe(true);
  });

  it("sets isDragging to false when endDrag is called", () => {
    const engine = new JogDialPhysicsEngine();
    engine.startDrag(100, 0, 50, 50);
    engine.endDrag();

    expect(engine.getState().isDragging).toBe(false);
  });

  it("emits forward steps for clockwise rotation", () => {
    const onStep = vi.fn();
    const engine = new JogDialPhysicsEngine({ degreesPerStep: 10 });
    engine.setOnStep(onStep);

    // Start at right side (0 degrees from center).
    engine.startDrag(100, 50, 50, 50);

    // Drag to below-right (positive angle increase = clockwise).
    engine.drag(100, 80);

    expect(onStep).toHaveBeenCalledWith("forward", expect.any(Number));
  });

  it("emits backward steps for counter-clockwise rotation", () => {
    const onStep = vi.fn();
    const engine = new JogDialPhysicsEngine({ degreesPerStep: 10 });
    engine.setOnStep(onStep);

    // Start at below-right.
    engine.startDrag(100, 80, 50, 50);

    // Drag to right side (negative angle change = counter-clockwise).
    engine.drag(100, 20);

    expect(onStep).toHaveBeenCalledWith("backward", expect.any(Number));
  });

  it("respects degreesPerStep configuration", () => {
    const onStep = vi.fn();
    // Very high degreesPerStep means a small drag won't trigger a step.
    const engine = new JogDialPhysicsEngine({ degreesPerStep: 180 });
    engine.setOnStep(onStep);

    engine.startDrag(100, 50, 50, 50);
    engine.drag(100, 55); // Tiny movement.

    expect(onStep).not.toHaveBeenCalled();
  });

  it("clamps maxFramesPerTick", () => {
    const onStep = vi.fn();
    const engine = new JogDialPhysicsEngine({
      degreesPerStep: 1,
      maxFramesPerTick: 3,
    });
    engine.setOnStep(onStep);

    engine.startDrag(100, 50, 50, 50);

    // Large drag that would produce many steps.
    engine.drag(50, 100);

    if (onStep.mock.calls.length > 0) {
      const frames = onStep.mock.calls[0]![1] as number;
      expect(frames).toBeLessThanOrEqual(3);
    }
  });

  it("allows runtime config changes", () => {
    const engine = new JogDialPhysicsEngine({ degreesPerStep: 15 });
    engine.setConfig({ degreesPerStep: 30 });

    // No crash, config is accepted.
    const state = engine.getState();
    expect(state.angle).toBe(0);
  });

  it("cleans up on dispose", () => {
    const onStep = vi.fn();
    const engine = new JogDialPhysicsEngine();
    engine.setOnStep(onStep);
    engine.dispose();

    // After dispose, dragging should not emit steps.
    engine.startDrag(100, 50, 50, 50);
    engine.drag(100, 100);
    expect(onStep).not.toHaveBeenCalled();
  });
});
