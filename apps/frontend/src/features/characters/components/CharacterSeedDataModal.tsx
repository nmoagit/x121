/**
 * Modal showing a character's seed images and metadata JSONs,
 * with drop zones for uploading missing items.
 */

import { useState } from "react";

import { Modal } from "@/components/composite";
import { Badge, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useImageVariants, useUploadImageVariant } from "@/features/images/hooks/use-image-variants";
import { IMAGE_ACCEPT_STRING, IMAGE_VARIANT_STATUS_LABEL, statusBadgeVariant, type ImageVariant, type ImageVariantStatusId } from "@/features/images/types";
import { variantImageUrl, variantThumbnailUrl } from "@/features/images/utils";
import { useUpdateCharacterMetadata } from "@/features/characters/hooks/use-character-detail";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/characters/types";
import { flattenMetadata } from "@/features/characters/lib/metadata-flatten";
import { generateMetadata } from "@/features/characters/lib/metadata-transform";
import { readFileAsJson } from "@/lib/file-types";
import { cn } from "@/lib/cn";
import { Eye } from "@/tokens/icons";
import type { Character } from "@/features/projects/types";

import { SeedDataDropSlot } from "./SeedDataDropSlot";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterSeedDataModalProps {
  character: Character | null;
  projectId: number;
  onClose: () => void;
}

const VARIANT_SLOTS = [
  { type: "clothed", label: "Clothed" },
  { type: "topless", label: "Topless" },
] as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterSeedDataModal({ character, projectId: _projectId, onClose }: CharacterSeedDataModalProps) {
  const characterId = character?.id ?? 0;
  const open = character !== null;

  const { data: variants, isLoading: variantsLoading } = useImageVariants(characterId);
  const uploadVariant = useUploadImageVariant(characterId);

  const updateMetadata = useUpdateCharacterMetadata(characterId);

  // Bio/ToV source data lives in the character's flat metadata field
  const metadata = character?.metadata ?? null;

  const [viewingJson, setViewingJson] = useState<{ label: string; data: unknown } | null>(null);
  const [jsonUploading, setJsonUploading] = useState<"bio" | "tov" | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Find best variant per slot — prefer hero, then approved, then highest version
  function findVariant(variantType: string): ImageVariant | undefined {
    if (!variants) return undefined;
    const matching = variants.filter(
      (v) => v.variant_type?.toLowerCase() === variantType.toLowerCase() && !v.deleted_at,
    );
    if (matching.length === 0) return undefined;
    // Sort: hero first, then approved (status 2), then by version desc
    return matching.sort((a, b) => {
      if (a.is_hero !== b.is_hero) return a.is_hero ? -1 : 1;
      if (a.status_id !== b.status_id) {
        if (a.status_id === 2) return -1;
        if (b.status_id === 2) return 1;
      }
      return b.version - a.version;
    })[0];
  }

  // Bio/ToV source data lives in the flat metadata field
  const bioData = metadata?.[SOURCE_KEY_BIO] ?? null;
  const tovData = metadata?.[SOURCE_KEY_TOV] ?? null;
  const hasBio = bioData != null;
  const hasTov = tovData != null;

  async function handleJsonUpload(slot: "bio" | "tov", file: File) {
    setJsonUploading(slot);
    try {
      const parsed = await readFileAsJson(file);
      if (!parsed) return;

      const existing = metadata ?? {};
      const draft: Record<string, unknown> = { ...existing };

      if (slot === "bio") {
        const generated = generateMetadata(parsed, null, character?.name ?? "");
        Object.assign(draft, flattenMetadata(generated));
        draft[SOURCE_KEY_BIO] = parsed;
      } else {
        const generated = generateMetadata(null, parsed, character?.name ?? "");
        Object.assign(draft, flattenMetadata(generated));
        draft[SOURCE_KEY_TOV] = parsed;
      }

      await updateMetadata.mutateAsync(draft);
    } finally {
      setJsonUploading(null);
    }
  }

  const isLoading = variantsLoading;

  return (
    <Modal open={open} onClose={onClose} title={character?.name ?? ""} size="2xl">
      {isLoading ? (
        <div className="flex items-center justify-center py-[var(--spacing-8)]">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--spacing-6)] sm:grid-cols-2">
          {/* Left column: Seed Images */}
          <Stack gap={4}>
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
              Seed Images
            </h3>
            {VARIANT_SLOTS.map(({ type, label }) => {
              const variant = findVariant(type);
              const isUploading = uploadVariant.isPending && uploadVariant.variables?.variant_type === type;

              if (variant) {
                return (
                  <div key={type} className="space-y-[var(--spacing-1)]">
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(variantImageUrl(variant.file_path))}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={variantThumbnailUrl(variant.id, 512)}
                        alt={`${label} seed image`}
                        className="max-h-48 rounded-[var(--radius-md)] object-contain"
                      />
                    </button>
                    <div className="flex items-center gap-[var(--spacing-2)]">
                      <Badge variant={statusBadgeVariant(variant.status_id as ImageVariantStatusId)}>
                        {IMAGE_VARIANT_STATUS_LABEL[variant.status_id as ImageVariantStatusId] ?? "Unknown"}
                      </Badge>
                      {variant.is_hero && <Badge variant="info">Hero</Badge>}
                    </div>
                  </div>
                );
              }

              return (
                <div key={type} className="space-y-[var(--spacing-1)]">
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                  <SeedDataDropSlot
                    accept={IMAGE_ACCEPT_STRING}
                    label={`${label} image`}
                    loading={isUploading}
                    onFile={(file) => uploadVariant.mutate({ file, variant_type: type, variant_label: label })}
                  />
                </div>
              );
            })}
          </Stack>

          {/* Right column: Metadata Files */}
          <Stack gap={4}>
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
              Metadata Files
            </h3>
            {([
              { slot: "bio" as const, label: "Bio", data: bioData, has: hasBio },
              { slot: "tov" as const, label: "ToV (Tone of Voice)", data: tovData, has: hasTov },
            ]).map(({ slot, label, data, has }) => (
              <div key={slot} className="space-y-[var(--spacing-1)]">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                {has && data ? (
                  <button
                    type="button"
                    onClick={() => setViewingJson({ label: `${label} — ${slot}.json`, data })}
                    className={cn(
                      "w-full text-left rounded-[var(--radius-md)] border border-[var(--color-border-secondary)]",
                      "bg-[var(--color-surface-tertiary)] p-[var(--spacing-3)]",
                      "cursor-pointer hover:border-[var(--color-text-muted)] transition-colors",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-primary)]">{slot}.json</span>
                      <Eye size={14} className="text-[var(--color-text-muted)]" />
                    </div>
                  </button>
                ) : (
                  <SeedDataDropSlot
                    accept=".json,application/json"
                    label={`${label} JSON`}
                    loading={jsonUploading === slot}
                    onFile={(file) => handleJsonUpload(slot, file)}
                  />
                )}
              </div>
            ))}
          </Stack>
        </div>
      )}
      {/* JSON viewer modal */}
      <Modal
        open={viewingJson !== null}
        onClose={() => setViewingJson(null)}
        title={viewingJson?.label ?? ""}
        size="lg"
      >
        {viewingJson && (
          <pre className="max-h-[70vh] overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] p-[var(--spacing-4)] text-xs text-[var(--color-text-secondary)] font-mono">
            {JSON.stringify(viewingJson.data, null, 2)}
          </pre>
        )}
      </Modal>

      {/* Full-size image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightboxUrl(null)}
          role="button"
          tabIndex={0}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-[var(--radius-md)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Modal>
  );
}
