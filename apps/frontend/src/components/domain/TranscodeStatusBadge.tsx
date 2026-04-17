import { Badge, Tooltip } from "@/components/primitives";
import { Loader2 } from "@/tokens/icons";

/**
 * Four-state transcode surface values matching the backend CHECK constraint
 * on `scene_video_versions.transcode_state` (PRD-169).
 */
export type TranscodeState = "pending" | "in_progress" | "completed" | "failed";

export interface TranscodeStatusBadgeProps {
  state: TranscodeState;
  /** Populated when `state === "failed"`; rendered inside a tooltip. */
  error?: string | null;
  /** Optional size override. Matches the shared `Badge` sizes. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Displays a "Processing" / "Transcode failed" badge on clip, scene, and media
 * cards when a video is not yet browser-playable (PRD-169 Requirement 1.9).
 *
 * Returns `null` for `"completed"` so callsites can unconditionally render
 * the badge without a wrapping guard.
 */
export function TranscodeStatusBadge({
  state,
  error,
  size = "sm",
  className,
}: TranscodeStatusBadgeProps) {
  if (state === "completed") {
    return null;
  }

  if (state === "failed") {
    const badge = (
      <Badge variant="danger" size={size} className={className}>
        Transcode failed
      </Badge>
    );
    // Wrap in a tooltip only when we have an error to surface.
    if (error) {
      return <Tooltip content={error}>{badge}</Tooltip>;
    }
    return badge;
  }

  // `pending` or `in_progress` — neutral processing badge with a spinner.
  return (
    <Badge variant="warning" size={size} className={className}>
      <Loader2 size={12} className="animate-spin mr-1" aria-hidden="true" />
      Processing
    </Badge>
  );
}
