import { useCallback, useEffect, useRef, useState } from "react";

import { frameToSeconds, secondsToFrame } from "../frame-utils";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface UseVideoPlayerOptions {
  /** Frames per second of the video. Needed for frame-accurate operations. */
  framerate: number;
  /** Start playing immediately. */
  autoPlay?: boolean;
  /** Called whenever the current frame changes. */
  onFrameChange?: (frame: number) => void;
  /** Called when play/pause state changes. */
  onPlayStateChange?: (playing: boolean) => void;
}

export interface VideoPlayerControls {
  /** Ref to attach to the <video> element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the video is currently playing. */
  isPlaying: boolean;
  /** Current frame number (0-indexed). */
  currentFrame: number;
  /** Current playback time in seconds. */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
  /** Current playback speed. */
  speed: number;
  /** Volume (0-1). */
  volume: number;
  /** Whether audio is muted. */
  isMuted: boolean;
  /** Whether the video has loaded metadata. */
  isReady: boolean;
  /** Play the video. */
  play: () => void;
  /** Pause the video. */
  pause: () => void;
  /** Toggle play/pause. */
  togglePlay: () => void;
  /** Seek to a specific frame. */
  seekToFrame: (frame: number) => void;
  /** Seek to a specific time in seconds. */
  seekToTime: (time: number) => void;
  /** Set playback speed. */
  setSpeed: (speed: number) => void;
  /** Step forward one frame. */
  stepForward: () => void;
  /** Step backward one frame. */
  stepBackward: () => void;
  /** Set volume (0-1). */
  setVolume: (volume: number) => void;
  /** Toggle mute. */
  toggleMute: () => void;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useVideoPlayer(options: UseVideoPlayerOptions): VideoPlayerControls {
  const { framerate, autoPlay = false, onFrameChange, onPlayStateChange } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // --- Frame tracking via requestAnimationFrame ---
  const updateFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const time = video.currentTime;
    setCurrentTime(time);

    if (framerate > 0) {
      const frame = secondsToFrame(time, framerate);
      setCurrentFrame((prev) => {
        if (prev !== frame) {
          onFrameChange?.(frame);
          return frame;
        }
        return prev;
      });
    }

    if (!video.paused) {
      animFrameRef.current = requestAnimationFrame(updateFrame);
    }
  }, [framerate, onFrameChange]);

  // --- Video event listeners ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handlePlay() {
      setIsPlaying(true);
      onPlayStateChange?.(true);
      animFrameRef.current = requestAnimationFrame(updateFrame);
    }

    function handlePause() {
      setIsPlaying(false);
      onPlayStateChange?.(false);
      cancelAnimationFrame(animFrameRef.current);
      updateFrame(); // Snap to exact frame.
    }

    function handleLoadedMetadata() {
      if (video) {
        setDuration(video.duration);
        setIsReady(true);
        video.preservesPitch = true;
        if (autoPlay) {
          video.play().catch(() => {});
        }
      }
    }

    function handleSeeked() {
      updateFrame();
    }

    function handleEnded() {
      setIsPlaying(false);
      onPlayStateChange?.(false);
      cancelAnimationFrame(animFrameRef.current);
    }

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("ended", handleEnded);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [autoPlay, onPlayStateChange, updateFrame]);

  // --- Control functions ---
  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const seekToFrame = useCallback(
    (frame: number) => {
      const video = videoRef.current;
      if (!video || framerate <= 0) return;
      video.currentTime = frameToSeconds(frame, framerate);
    },
    [framerate],
  );

  const seekToTime = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, []);

  const setSpeed = useCallback((newSpeed: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0.1, Math.min(4, newSpeed));
    video.playbackRate = clamped;
    setSpeedState(clamped);
  }, []);

  const stepForward = useCallback(() => {
    const video = videoRef.current;
    if (!video || framerate <= 0) return;
    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + 1 / framerate);
  }, [framerate]);

  const stepBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video || framerate <= 0) return;
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - 1 / framerate);
  }, [framerate]);

  const setVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, v));
    video.volume = clamped;
    setVolumeState(clamped);
    if (clamped > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  return {
    videoRef,
    isPlaying,
    currentFrame,
    currentTime,
    duration,
    speed,
    volume,
    isMuted,
    isReady,
    play,
    pause,
    togglePlay,
    seekToFrame,
    seekToTime,
    setSpeed,
    stepForward,
    stepBackward,
    setVolume,
    toggleMute,
  };
}
