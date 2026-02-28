/**
 * Dual-player synchronization hook (PRD-101).
 *
 * Coordinates two `useVideoPlayer` instances so play, pause, seek, and
 * frame-stepping operations are applied to both players simultaneously.
 * The left player acts as the leader; the right player follows via
 * `onFrameChange`.
 */

import { useCallback } from "react";

import { useVideoPlayer } from "@/features/video-player";
import type { VideoPlayerControls } from "@/features/video-player";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_FRAMERATE = 24;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface DualSyncControls {
  leftPlayer: VideoPlayerControls;
  rightPlayer: VideoPlayerControls;
  isPlaying: boolean;
  currentFrame: number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekToFrame: (frame: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useDualSync(framerate = DEFAULT_FRAMERATE): DualSyncControls {
  // Right player needs to stay in sync with left. We use the left player's
  // onFrameChange callback to seek the right player to the same frame.
  const rightPlayer = useVideoPlayer({ framerate });

  const syncRightToFrame = useCallback(
    (frame: number) => {
      rightPlayer.seekToFrame(frame);
    },
    [rightPlayer],
  );

  const leftPlayer = useVideoPlayer({
    framerate,
    onFrameChange: syncRightToFrame,
  });

  const play = useCallback(() => {
    leftPlayer.play();
    rightPlayer.play();
  }, [leftPlayer, rightPlayer]);

  const pause = useCallback(() => {
    leftPlayer.pause();
    rightPlayer.pause();
  }, [leftPlayer, rightPlayer]);

  const togglePlay = useCallback(() => {
    if (leftPlayer.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [leftPlayer.isPlaying, pause, play]);

  const seekToFrame = useCallback(
    (frame: number) => {
      leftPlayer.seekToFrame(frame);
      rightPlayer.seekToFrame(frame);
    },
    [leftPlayer, rightPlayer],
  );

  const stepForward = useCallback(() => {
    leftPlayer.stepForward();
    rightPlayer.stepForward();
  }, [leftPlayer, rightPlayer]);

  const stepBackward = useCallback(() => {
    leftPlayer.stepBackward();
    rightPlayer.stepBackward();
  }, [leftPlayer, rightPlayer]);

  return {
    leftPlayer,
    rightPlayer,
    isPlaying: leftPlayer.isPlaying,
    currentFrame: leftPlayer.currentFrame,
    play,
    pause,
    togglePlay,
    seekToFrame,
    stepForward,
    stepBackward,
  };
}
