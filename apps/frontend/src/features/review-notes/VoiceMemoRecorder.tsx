/**
 * Voice memo recorder component for review notes (PRD-38).
 *
 * Provides a hold-to-record button using the MediaRecorder API,
 * recording indicator, and playback controls. UI-only -- actual
 * upload is handled by the parent component.
 */

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/primitives/Button";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VoiceMemoRecorderProps {
  /** Called when recording is complete with the audio blob. */
  onRecordComplete: (blob: Blob) => void;
  /** Whether the recorder is disabled. */
  disabled?: boolean;
}

type RecorderState = "idle" | "recording" | "recorded";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VoiceMemoRecorder({
  onRecordComplete,
  disabled = false,
}: VoiceMemoRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("recorded");
        onRecordComplete(blob);

        // Stop all tracks to release the microphone.
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setState("recording");
    } catch {
      // Microphone access denied or not available.
      setState("idle");
    }
  }, [disabled, onRecordComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setState("idle");
  }, [audioUrl]);

  return (
    <div className="flex items-center gap-3" data-testid="voice-memo-recorder">
      {state === "idle" && (
        <Button
          size="sm"
          variant="secondary"
          onMouseDown={startRecording}
          disabled={disabled}
          aria-label="Hold to record voice memo"
        >
          Hold to Record
        </Button>
      )}

      {state === "recording" && (
        <>
          {/* Pulsing recording indicator */}
          <span
            className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500"
            aria-label="Recording in progress"
            data-testid="recording-indicator"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            Recording...
          </span>
          <Button size="sm" variant="danger" onClick={stopRecording}>
            Stop
          </Button>
        </>
      )}

      {state === "recorded" && audioUrl && (
        <>
          {/* Playback controls */}
          <audio
            src={audioUrl}
            controls
            className="h-8"
            data-testid="voice-memo-playback"
          />
          <Button size="sm" variant="ghost" onClick={resetRecording}>
            Re-record
          </Button>
        </>
      )}
    </div>
  );
}
