/**
 * AudioScrubber — Vinyl-scratch audio feedback for the jog dial.
 *
 * Uses Web Audio API to generate a filtered noise burst that follows
 * frame-stepping direction and speed, providing tactile audio feedback
 * similar to scrubbing tape on a professional editing deck.
 */

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Base frequency for the oscillator in Hz. */
const BASE_FREQUENCY = 220;

/** Minimum playback rate multiplier. */
const MIN_RATE = 0.1;

/** Maximum playback rate multiplier. */
const MAX_RATE = 4.0;

/** Fade-out duration in seconds when scrubbing stops. */
const FADE_OUT_DURATION = 0.08;

/** Fade-in duration in seconds when scrubbing starts. */
const FADE_IN_DURATION = 0.02;

/* --------------------------------------------------------------------------
   AudioScrubber Class
   -------------------------------------------------------------------------- */

export class AudioScrubber {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private enabled: boolean = true;
  private isPlaying: boolean = false;
  private stopTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // AudioContext is created lazily on first user interaction
    // to comply with browser autoplay policies.
  }

  /** Enable or disable audio scrubbing. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /** Whether audio scrubbing is currently enabled. */
  getEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Play audio in vinyl-scratch mode following frame stepping.
   *
   * @param direction - 'forward' for normal pitch, 'backward' for reversed
   * @param speed - Scrub speed multiplier (0.0 to 1.0 maps to slow-fast)
   */
  scrub(direction: "forward" | "backward", speed: number): void {
    if (!this.enabled) return;

    this.ensureContext();
    if (!this.audioContext || !this.gainNode || !this.oscillator || !this.filterNode) return;

    // Cancel any pending stop.
    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    const now = this.audioContext.currentTime;
    const clampedSpeed = Math.max(MIN_RATE, Math.min(MAX_RATE, speed));

    // Pitch follows direction: forward = normal, backward = lower pitch.
    const directionMultiplier = direction === "forward" ? 1.0 : -1.0;
    const frequency = BASE_FREQUENCY * clampedSpeed * Math.abs(directionMultiplier);

    // Detune for backward scrubbing to create the "reverse" feel.
    const detune = direction === "backward" ? -1200 : 0;

    this.oscillator.frequency.setTargetAtTime(frequency, now, 0.01);
    this.oscillator.detune.setTargetAtTime(detune, now, 0.01);

    // Vary the filter cutoff with speed for tonal variation.
    const cutoff = 400 + clampedSpeed * 2000;
    this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.01);

    // Fade in if not already playing.
    if (!this.isPlaying) {
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0, now);
      this.gainNode.gain.linearRampToValueAtTime(0.15, now + FADE_IN_DURATION);
      this.isPlaying = true;
    }
  }

  /** Stop scrub audio with a short fade-out. */
  stop(): void {
    if (!this.isPlaying || !this.audioContext || !this.gainNode) return;

    const now = this.audioContext.currentTime;

    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setTargetAtTime(0, now, FADE_OUT_DURATION);

    // Mark as stopped after fade-out completes.
    this.stopTimeoutId = setTimeout(() => {
      this.isPlaying = false;
      this.stopTimeoutId = null;
    }, FADE_OUT_DURATION * 1000 * 3);
  }

  /** Tear down the audio graph entirely. */
  dispose(): void {
    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.filterNode?.disconnect();
    this.gainNode?.disconnect();

    if (this.audioContext?.state !== "closed") {
      this.audioContext?.close().catch(() => {});
    }

    this.oscillator = null;
    this.filterNode = null;
    this.gainNode = null;
    this.audioContext = null;
    this.isPlaying = false;
  }

  /* --------------------------------------------------------------------------
     Private
     -------------------------------------------------------------------------- */

  /** Lazily create the AudioContext and audio graph. */
  private ensureContext(): void {
    if (this.audioContext) return;

    try {
      this.audioContext = new AudioContext();
    } catch {
      // Web Audio API not available.
      return;
    }

    // Build the audio graph: oscillator -> filter -> gain -> destination.
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = "sawtooth";
    this.oscillator.frequency.value = BASE_FREQUENCY;

    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 800;
    this.filterNode.Q.value = 2;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;

    this.oscillator.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.oscillator.start();
  }
}
