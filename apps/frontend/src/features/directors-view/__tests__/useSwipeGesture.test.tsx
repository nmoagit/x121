/**
 * Tests for useSwipeGesture hook (PRD-55).
 *
 * Simulates touch events to verify swipe direction detection,
 * threshold enforcement, and callback invocation.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSwipeGesture } from "../hooks/use-swipe-gesture";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function createTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  clientX: number,
  clientY: number,
): TouchEvent {
  const touch = { clientX, clientY } as Touch;
  const event = new Event(type, { bubbles: true }) as unknown as TouchEvent;

  Object.defineProperty(event, "touches", { value: [touch] });
  Object.defineProperty(event, "changedTouches", { value: [touch] });

  return event;
}

function createElementRef(): React.RefObject<HTMLDivElement> {
  const element = document.createElement("div");
  document.body.appendChild(element);

  return { current: element };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("useSwipeGesture", () => {
  it("returns null direction when no swipe has occurred", () => {
    const ref = createElementRef();
    const callbacks = {
      onSwipeRight: vi.fn(),
      onSwipeLeft: vi.fn(),
      onSwipeUp: vi.fn(),
    };

    const { result } = renderHook(() => useSwipeGesture(ref, callbacks));

    expect(result.current.swipeDirection).toBeNull();
    expect(result.current.swipeProgress).toBe(0);
  });

  it("detects right swipe and calls onSwipeRight", () => {
    const ref = createElementRef();
    const callbacks = {
      onSwipeRight: vi.fn(),
      onSwipeLeft: vi.fn(),
      onSwipeUp: vi.fn(),
    };

    renderHook(() => useSwipeGesture(ref, callbacks));
    const el = ref.current!;

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", 100, 200));
      // Fast swipe to the right (>80px threshold, high velocity)
      el.dispatchEvent(createTouchEvent("touchmove", 250, 200));
      el.dispatchEvent(createTouchEvent("touchend", 250, 200));
    });

    expect(callbacks.onSwipeRight).toHaveBeenCalledOnce();
    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
  });

  it("detects left swipe and calls onSwipeLeft", () => {
    const ref = createElementRef();
    const callbacks = {
      onSwipeRight: vi.fn(),
      onSwipeLeft: vi.fn(),
      onSwipeUp: vi.fn(),
    };

    renderHook(() => useSwipeGesture(ref, callbacks));
    const el = ref.current!;

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", 300, 200));
      el.dispatchEvent(createTouchEvent("touchmove", 100, 200));
      el.dispatchEvent(createTouchEvent("touchend", 100, 200));
    });

    expect(callbacks.onSwipeLeft).toHaveBeenCalledOnce();
    expect(callbacks.onSwipeRight).not.toHaveBeenCalled();
  });

  it("detects upward swipe and calls onSwipeUp", () => {
    const ref = createElementRef();
    const callbacks = {
      onSwipeRight: vi.fn(),
      onSwipeLeft: vi.fn(),
      onSwipeUp: vi.fn(),
    };

    renderHook(() => useSwipeGesture(ref, callbacks));
    const el = ref.current!;

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", 200, 300));
      el.dispatchEvent(createTouchEvent("touchmove", 200, 150));
      el.dispatchEvent(createTouchEvent("touchend", 200, 150));
    });

    expect(callbacks.onSwipeUp).toHaveBeenCalledOnce();
  });

  it("does not trigger for small movements below threshold", () => {
    const ref = createElementRef();
    const callbacks = {
      onSwipeRight: vi.fn(),
      onSwipeLeft: vi.fn(),
      onSwipeUp: vi.fn(),
    };

    renderHook(() => useSwipeGesture(ref, callbacks));
    const el = ref.current!;

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", 200, 200));
      // Move only 30px right (below 80px threshold)
      el.dispatchEvent(createTouchEvent("touchmove", 230, 200));
      el.dispatchEvent(createTouchEvent("touchend", 230, 200));
    });

    expect(callbacks.onSwipeRight).not.toHaveBeenCalled();
    expect(callbacks.onSwipeLeft).not.toHaveBeenCalled();
    expect(callbacks.onSwipeUp).not.toHaveBeenCalled();
  });
});
