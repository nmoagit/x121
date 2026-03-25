/**
 * Metadata Preview Panel (PRD-13).
 *
 * Displays avatar or video metadata JSON in a formatted, read-only view.
 * Supports both entity types via a `mode` prop.
 */

import { Card } from "@/components/composite/Card";
import { ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useAvatarMetadataPreview,
  useVideoMetadataPreview,
} from "./hooks/use-metadata";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface MetadataPreviewProps {
  /** Determines which metadata type to fetch and display. */
  mode: "avatar" | "video";
  /** Avatar ID when `mode === "avatar"`. */
  avatarId?: number;
  /** Scene ID when `mode === "video"`. */
  sceneId?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataPreview({
  mode,
  avatarId,
  sceneId,
}: MetadataPreviewProps) {
  const avatarQuery = useAvatarMetadataPreview(
    mode === "avatar" ? (avatarId ?? 0) : 0,
  );
  const videoQuery = useVideoMetadataPreview(
    mode === "video" ? (sceneId ?? 0) : 0,
  );

  const query = mode === "avatar" ? avatarQuery : videoQuery;
  const title =
    mode === "avatar" ? "Avatar Metadata" : "Video Metadata";

  return (
    <Stack gap={4}>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>

      {query.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <ContextLoader size={48} />
        </div>
      ) : query.error ? (
        <Card padding="md">
          <p className="text-sm text-[var(--color-text-danger)]">
            Failed to load metadata:{" "}
            {query.error instanceof Error
              ? query.error.message
              : "Unknown error"}
          </p>
        </Card>
      ) : query.data ? (
        <Card padding="none">
          <pre className="max-h-[600px] overflow-auto p-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {JSON.stringify(query.data, null, 2)}
          </pre>
        </Card>
      ) : null}
    </Stack>
  );
}
