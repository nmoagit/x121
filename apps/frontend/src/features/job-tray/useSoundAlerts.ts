/**
 * Plays sound alerts on job completion or failure.
 *
 * Opt-in system: disabled by default. Users enable it via SoundPreferences.
 * Preferences are persisted in localStorage (will migrate to PRD-004 later).
 *
 * Uses the Web Audio API for reliable, low-latency playback.
 */

import { useCallback, useRef } from "react";
import { create } from "zustand";
import { useEventBus } from "@/hooks/useEventBus";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type SoundId = "chime" | "bell" | "ding" | "alert";

export interface SoundPreferences {
  enabled: boolean;
  completionSound: SoundId;
  failureSound: SoundId;
}

interface SoundPreferencesStore extends SoundPreferences {
  setEnabled: (enabled: boolean) => void;
  setCompletionSound: (sound: SoundId) => void;
  setFailureSound: (sound: SoundId) => void;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "x121-sound-prefs";

const DEFAULT_PREFS: SoundPreferences = {
  enabled: false,
  completionSound: "chime",
  failureSound: "alert",
};

/**
 * Sound definitions using the Web Audio API (oscillator-based).
 * No external audio files required.
 */
const SOUND_CONFIGS: Record<SoundId, { frequency: number; duration: number; type: OscillatorType }> = {
  chime:  { frequency: 880,  duration: 0.3, type: "sine" },
  bell:   { frequency: 660,  duration: 0.5, type: "triangle" },
  ding:   { frequency: 1200, duration: 0.15, type: "sine" },
  alert:  { frequency: 440,  duration: 0.4, type: "square" },
};

export const SOUND_LABELS: Record<SoundId, string> = {
  chime: "Chime",
  bell: "Bell",
  ding: "Ding",
  alert: "Alert",
};

export const SOUND_IDS: SoundId[] = ["chime", "bell", "ding", "alert"];

/* --------------------------------------------------------------------------
   Persistence helpers
   -------------------------------------------------------------------------- */

function loadPrefs(): SoundPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFS;
}

function savePrefs(prefs: SoundPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export const useSoundPreferencesStore = create<SoundPreferencesStore>((set, get) => {
  const initial = loadPrefs();

  return {
    ...initial,

    setEnabled(enabled) {
      set({ enabled });
      savePrefs({ ...get(), enabled });
    },

    setCompletionSound(completionSound) {
      set({ completionSound });
      savePrefs({ ...get(), completionSound });
    },

    setFailureSound(failureSound) {
      set({ failureSound });
      savePrefs({ ...get(), failureSound });
    },
  };
});

/* --------------------------------------------------------------------------
   Audio playback
   -------------------------------------------------------------------------- */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playSound(soundId: SoundId): void {
  const config = SOUND_CONFIGS[soundId];
  if (!config) return;

  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);

    // Fade out to avoid click
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + config.duration);
  } catch {
    // Audio playback failed (e.g., autoplay policy). Silently ignore.
  }
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

interface JobSoundEvent {
  jobId: string;
  jobName: string;
}

export function useSoundAlerts(): void {
  const enabled = useSoundPreferencesStore((s) => s.enabled);
  const completionSound = useSoundPreferencesStore((s) => s.completionSound);
  const failureSound = useSoundPreferencesStore((s) => s.failureSound);

  const prefsRef = useRef({ enabled, completionSound, failureSound });
  prefsRef.current = { enabled, completionSound, failureSound };

  useEventBus<JobSoundEvent>("job.completed", useCallback(() => {
    if (prefsRef.current.enabled) {
      playSound(prefsRef.current.completionSound);
    }
  }, []));

  useEventBus<JobSoundEvent>("job.failed", useCallback(() => {
    if (prefsRef.current.enabled) {
      playSound(prefsRef.current.failureSound);
    }
  }, []));
}
