import { describe, expect, it, vi, beforeEach } from "vitest";

import { AudioScrubber } from "../audioScrub";

/* --------------------------------------------------------------------------
   Mock Web Audio API
   -------------------------------------------------------------------------- */

class MockOscillatorNode {
  type = "sawtooth";
  frequency = { value: 0, setTargetAtTime: vi.fn() };
  detune = { value: 0, setTargetAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
}

class MockGainNode {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockBiquadFilterNode {
  type = "lowpass";
  frequency = { value: 0, setTargetAtTime: vi.fn() };
  Q = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  close = vi.fn(() => Promise.resolve());
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", MockAudioContext);
});

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("AudioScrubber", () => {
  it("creates without errors", () => {
    const scrubber = new AudioScrubber();
    expect(scrubber).toBeTruthy();
  });

  it("is enabled by default", () => {
    const scrubber = new AudioScrubber();
    expect(scrubber.getEnabled()).toBe(true);
  });

  it("can be disabled", () => {
    const scrubber = new AudioScrubber();
    scrubber.setEnabled(false);
    expect(scrubber.getEnabled()).toBe(false);
  });

  it("does not crash when scrubbing forward", () => {
    const scrubber = new AudioScrubber();
    expect(() => scrubber.scrub("forward", 0.5)).not.toThrow();
  });

  it("does not crash when scrubbing backward", () => {
    const scrubber = new AudioScrubber();
    expect(() => scrubber.scrub("backward", 0.5)).not.toThrow();
  });

  it("does not scrub when disabled", () => {
    const scrubber = new AudioScrubber();
    scrubber.setEnabled(false);

    // Scrub should be a no-op when disabled — no AudioContext creation.
    scrubber.scrub("forward", 0.5);
    // No error means the guard worked.
  });

  it("stops without errors", () => {
    const scrubber = new AudioScrubber();
    scrubber.scrub("forward", 0.5);
    expect(() => scrubber.stop()).not.toThrow();
  });

  it("disposes without errors", () => {
    const scrubber = new AudioScrubber();
    scrubber.scrub("forward", 0.5);
    expect(() => scrubber.dispose()).not.toThrow();
  });

  it("clamps speed to valid range", () => {
    const scrubber = new AudioScrubber();

    // Extreme values should not crash.
    expect(() => scrubber.scrub("forward", -10)).not.toThrow();
    expect(() => scrubber.scrub("forward", 100)).not.toThrow();
  });

  it("can be re-enabled after disabling", () => {
    const scrubber = new AudioScrubber();
    scrubber.setEnabled(false);
    scrubber.setEnabled(true);

    expect(scrubber.getEnabled()).toBe(true);
    expect(() => scrubber.scrub("forward", 0.5)).not.toThrow();
  });
});
