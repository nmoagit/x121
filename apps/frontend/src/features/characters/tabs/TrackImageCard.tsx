/**
 * TrackImageCard — displays a seed image card for a single track.
 *
 * Terminal-style dark card with hero image preview, track badge, status info,
 * and compact action buttons for uploading and generating images.
 */

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Image as ImageIcon, Upload, Wand2 } from "@/tokens/icons";

import { MediaPlaceholder } from "./MediaPlaceholder";
import type { Track } from "@/features/scene-catalogue/types";
import {
  IMAGE_ACCEPT_STRING,
  IMAGE_VARIANT_STATUS,
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
} from "@/features/images/types";
import type { ImageVariant } from "@/features/images/types";
import { variantImageUrl } from "@/features/images/utils";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";

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
  /** Called when the card image area is clicked (opens detail modal). */
  onClick?: () => void;
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
  onClick,
}: TrackImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file, track.slug);
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const generateButton = canGenerate ? (
    <Button
      size="xs"
      variant="secondary"
      disabled={!generateEnabled || generating}
      onClick={onGenerate}
      icon={<Wand2 size={12} />}
    >
      {generating ? "Generating…" : "Generate"}
    </Button>
  ) : null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden",
        dragOver && "ring-2 ring-[var(--color-action-primary)]",
        heroVariant?.status_id === IMAGE_VARIANT_STATUS.APPROVED && "!border-2 !border-green-500",
        heroVariant?.status_id === IMAGE_VARIANT_STATUS.REJECTED && "!border-2 !border-red-500",
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
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-action-primary)] aspect-video bg-[#161b22]">
            <Upload size={24} className="text-[var(--color-action-primary)]" />
            <span className="text-xs text-[var(--color-action-primary)] mt-1 font-mono">Drop image here</span>
          </div>
        ) : heroVariant?.file_path ? (
          <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
            className="cursor-pointer"
          >
            <img
              src={variantImageUrl(heroVariant.file_path)}
              alt={`${track.name} seed image`}
              className="w-full aspect-video object-cover"
            />
          </div>
        ) : (
          <MediaPlaceholder
            icon={<ImageIcon size={24} className="text-[var(--color-text-muted)]" />}
            label="No image"
          />
        )}

        {/* Content below image */}
        <div className="flex flex-col gap-1.5 px-[var(--spacing-2)] py-[var(--spacing-2)]">
          {/* Header: status left, track label right */}
          <div className="flex items-center justify-between gap-1 min-w-0 font-mono text-[10px]">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)] truncate">
              {heroVariant ? (
                <>
                  <span className={heroVariant.status_id === IMAGE_VARIANT_STATUS.APPROVED ? "text-green-400" : "text-cyan-400"}>
                    {IMAGE_VARIANT_STATUS_LABEL[heroVariant.status_id]?.toLowerCase()}
                  </span>
                  <span className="opacity-30">|</span>
                  <span>{PROVENANCE_LABEL[heroVariant.provenance]?.toLowerCase()}</span>
                </>
              ) : (
                <span className="text-[var(--color-text-muted)]">no image</span>
              )}
            </div>
            <span className={`shrink-0 text-xs font-medium uppercase tracking-wide ${TRACK_TEXT_COLORS[track.slug] ?? "text-[var(--color-text-primary)]"}`}>
              {track.name}
            </span>
          </div>

          {/* Action buttons — xs size */}
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload size={12} />}
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
    </div>
  );
}
