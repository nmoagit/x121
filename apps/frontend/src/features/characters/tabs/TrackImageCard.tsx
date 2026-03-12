/**
 * TrackImageCard — displays a seed image card for a single track.
 *
 * Shows the hero image variant (if any), track badge, status/provenance badges,
 * and action buttons for uploading and generating images.
 */

import { useCallback, useRef, useState } from "react";

import { Card } from "@/components/composite/Card";
import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/primitives";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Image as ImageIcon, Upload, Wand2 } from "@/tokens/icons";

import { TrackBadge } from "@/features/scene-catalogue/TrackBadge";
import { MediaPlaceholder } from "./MediaPlaceholder";
import type { Track } from "@/features/scene-catalogue/types";
import {
  IMAGE_ACCEPT_STRING,
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
} from "@/features/images/types";
import type { ImageVariant } from "@/features/images/types";
import { variantImageUrl } from "@/features/images/utils";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TrackImageCardProps {
  track: Track;
  heroVariant: ImageVariant | null;
  canGenerate: boolean;
  generateEnabled: boolean;
  generateDisabledReason: string | null;
  onGenerate: () => void;
  generating: boolean;
  onUpload: (file: File, trackSlug: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TrackImageCard({
  track,
  heroVariant,
  canGenerate,
  generateEnabled,
  generateDisabledReason,
  onGenerate,
  generating,
  onUpload,
}: TrackImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file, track.slug);
      // Reset so the same file can be re-selected
      e.target.value = "";
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        onUpload(file, track.slug);
      }
    },
    [onUpload, track.slug],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the card entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const generateButton = canGenerate ? (
    <Button
      size="sm"
      variant="secondary"
      disabled={!generateEnabled || generating}
      onClick={onGenerate}
      icon={<Wand2 size={14} />}
    >
      {generating ? "Generating…" : "Generate"}
    </Button>
  ) : null;

  return (
    <Card
      padding="none"
      className={cn(
        "group/card transition-colors overflow-hidden",
        dragOver && "ring-2 ring-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]",
      )}
    >
      <div
        className="flex flex-col"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Image preview / drop target */}
        {dragOver ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-action-primary)] aspect-video">
            <Upload size={24} className="text-[var(--color-action-primary)]" />
            <span className="text-xs text-[var(--color-action-primary)] mt-1">Drop image here</span>
          </div>
        ) : heroVariant?.file_path ? (
          <img
            src={variantImageUrl(heroVariant.file_path)}
            alt={`${track.name} seed image`}
            className="w-full aspect-video object-cover bg-black"
          />
        ) : (
          <MediaPlaceholder
            icon={<ImageIcon size={24} className="text-[var(--color-text-muted)]" />}
            label="No image"
          />
        )}

        {/* Content below image */}
        <div className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
          {/* Header: track name + badge */}
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {track.name}
            </span>
            <span className="shrink-0 ml-auto">
              <TrackBadge name={track.name} slug={track.slug} />
            </span>
          </div>

          {/* Status + provenance badges */}
          {heroVariant && (
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Badge variant="default" size="sm">
                {IMAGE_VARIANT_STATUS_LABEL[heroVariant.status_id]}
              </Badge>
              <Badge variant="default" size="sm">
                {PROVENANCE_LABEL[heroVariant.provenance]}
              </Badge>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload size={14} />}
            >
              Upload
            </Button>

            {generateButton && (generateEnabled ? (
              generateButton
            ) : (
              <Tooltip content={generateDisabledReason ?? "Cannot generate"}>
                {generateButton}
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT_STRING}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </Card>
  );
}
