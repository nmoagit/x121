/**
 * Hold-to-record voice note button (PRD-55).
 *
 * Provides a large touch target for recording audio notes during review.
 * This is a UI placeholder - actual audio recording API integration will
 * be wired in when the backend supports audio uploads.
 */

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Volume2 } from "@/tokens/icons";

import { MIN_TOUCH_TARGET } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface MobileVoiceNoteProps {
  onRecordingComplete: (durationMs: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MobileVoiceNote({ onRecordingComplete }: MobileVoiceNoteProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setRecordingMs(0);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setRecordingMs(Date.now() - startRef.current);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startRef.current;
    if (elapsed > 300) {
      onRecordingComplete(elapsed);
    }
    setRecordingMs(0);
  }, [onRecordingComplete]);

  const formattedDuration = isRecording
    ? `${(recordingMs / 1000).toFixed(1)}s`
    : "Hold to record";

  return (
    <div data-testid="mobile-voice-note" className="flex flex-col items-center gap-2">
      <button
        type="button"
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        aria-label={isRecording ? "Recording voice note" : "Hold to record voice note"}
        className={cn(
          "flex items-center justify-center rounded-full transition-all",
          isRecording
            ? "bg-[var(--color-action-danger)] scale-110"
            : "bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-secondary)]",
        )}
        style={{
          width: MIN_TOUCH_TARGET * 1.5,
          height: MIN_TOUCH_TARGET * 1.5,
        }}
      >
        <Volume2
          size={24}
          className={cn(
            isRecording
              ? "text-white animate-pulse"
              : "text-[var(--color-text-muted)]",
          )}
          aria-hidden="true"
        />
      </button>

      <span
        className={cn(
          "text-xs",
          isRecording
            ? "font-medium text-[var(--color-action-danger)]"
            : "text-[var(--color-text-muted)]",
        )}
      >
        {formattedDuration}
      </span>
    </div>
  );
}
