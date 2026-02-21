/**
 * Sound preference panel for job alerts.
 *
 * Lets users toggle sound alerts on/off, choose completion/failure sounds,
 * and preview each available sound.
 */

import { cn } from "@/lib/cn";
import { Play } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { useCallback } from "react";
import { Button, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  playSound,
  useSoundPreferencesStore,
  SOUND_IDS,
  SOUND_LABELS,
} from "./useSoundAlerts";
import type { SoundId } from "./useSoundAlerts";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface SoundPickerProps {
  label: string;
  value: SoundId;
  onChange: (id: SoundId) => void;
  disabled: boolean;
}

function SoundPicker({ label, value, onChange, disabled }: SoundPickerProps) {
  const handlePreview = useCallback((id: SoundId) => {
    playSound(id);
  }, []);

  return (
    <Stack direction="vertical" gap={1}>
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      <Stack direction="vertical" gap={1}>
        {SOUND_IDS.map((id) => (
          <Stack
            key={id}
            direction="horizontal"
            gap={2}
            align="center"
            className={cn(
              "px-2 py-1.5 rounded-[var(--radius-md)]",
              "transition-colors duration-[var(--duration-instant)]",
              value === id && "bg-[var(--color-action-primary)]/10",
              disabled && "opacity-50 pointer-events-none",
            )}
          >
            <button
              type="button"
              onClick={() => onChange(id)}
              disabled={disabled}
              className={cn(
                "flex-1 text-left text-sm",
                value === id
                  ? "text-[var(--color-action-primary)] font-medium"
                  : "text-[var(--color-text-primary)]",
              )}
            >
              {SOUND_LABELS[id]}
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Play size={iconSizes.sm} />}
              onClick={() => handlePreview(id)}
              disabled={disabled}
              aria-label={`Preview ${SOUND_LABELS[id]} sound`}
            />
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SoundPreferences() {
  const enabled = useSoundPreferencesStore((s) => s.enabled);
  const completionSound = useSoundPreferencesStore((s) => s.completionSound);
  const failureSound = useSoundPreferencesStore((s) => s.failureSound);
  const setEnabled = useSoundPreferencesStore((s) => s.setEnabled);
  const setCompletionSound = useSoundPreferencesStore((s) => s.setCompletionSound);
  const setFailureSound = useSoundPreferencesStore((s) => s.setFailureSound);

  return (
    <Stack direction="vertical" gap={4} className="p-4">
      <Stack direction="horizontal" gap={3} align="center" justify="between">
        <Stack direction="vertical" gap={0}>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Sound Alerts
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            Play a sound when a job completes or fails
          </span>
        </Stack>
        <Toggle checked={enabled} onChange={setEnabled} />
      </Stack>

      <SoundPicker
        label="Completion sound"
        value={completionSound}
        onChange={setCompletionSound}
        disabled={!enabled}
      />

      <SoundPicker
        label="Failure sound"
        value={failureSound}
        onChange={setFailureSound}
        disabled={!enabled}
      />
    </Stack>
  );
}
