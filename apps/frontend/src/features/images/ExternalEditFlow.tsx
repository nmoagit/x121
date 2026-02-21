/**
 * External edit round-trip workflow (PRD-21).
 *
 * Provides "Export for Editing" (downloads full-res image) and
 * "Re-import Edited" (file upload) with version history sidebar.
 */

import { useCallback, useRef, useState } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner } from "@/components/primitives";
import { Download, Upload } from "@/tokens/icons";

import {
  useExportVariant,
  useVariantHistory,
} from "./hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  VALID_IMAGE_FORMATS,
  type ImageVariant,
  type ImageVariantStatusId,
  type Provenance,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ExternalEditFlowProps {
  characterId: number;
  variantId: number;
  /** Called after successful reimport with the new variant ID. */
  onReimported?: (newVariantId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ExternalEditFlow({
  characterId,
  variantId,
  onReimported,
}: ExternalEditFlowProps) {
  const exportMutation = useExportVariant(characterId);
  const { data: history, isLoading: historyLoading } = useVariantHistory(characterId, variantId);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    exportMutation.mutate(variantId);
  }, [exportMutation, variantId]);

  const handleReimportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!VALID_IMAGE_FORMATS.includes(ext as (typeof VALID_IMAGE_FORMATS)[number])) {
        setUploadError(`Unsupported format ".${ext}". Supported: png, jpeg, jpg, webp`);
        return;
      }

      setUploadError(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `/api/v1/characters/${characterId}/image-variants/${variantId}/reimport`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(body.error ?? "Upload failed");
        }

        const body = await response.json();
        const newVariant = body.data as ImageVariant;
        onReimported?.(newVariant.id);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [characterId, variantId, onReimported],
  );

  return (
    <div className="flex gap-6">
      {/* Actions panel */}
      <Card elevation="sm" padding="md">
        <Stack gap={4}>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]">External Edit</h4>

          <p className="text-xs text-[var(--color-text-muted)]">
            Export the variant at full resolution, edit it in an external tool (e.g., Photoshop),
            then re-import the edited version.
          </p>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={16} />}
              onClick={handleExport}
              loading={exportMutation.isPending}
            >
              Export for Editing
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={16} />}
              onClick={() => inputRef.current?.click()}
              loading={isUploading}
            >
              Re-import Edited
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpeg,.jpg,.webp"
              onChange={handleReimportFile}
              className="hidden"
              aria-label="Re-import edited variant"
            />
          </div>

          {uploadError && (
            <p className="text-sm text-[var(--color-action-danger)]" role="alert">
              {uploadError}
            </p>
          )}
        </Stack>
      </Card>

      {/* Version history sidebar */}
      <Card elevation="sm" padding="md">
        <Stack gap={3}>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Version History</h4>

          {historyLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">No version history.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-default)] p-2"
                >
                  {entry.file_path ? (
                    <img
                      src={entry.file_path}
                      alt={`Version ${entry.version}`}
                      className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)]" />
                  )}

                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      v{entry.version}
                    </span>
                    <div className="flex gap-1">
                      <Badge
                        variant="default"
                        size="sm"
                      >
                        {IMAGE_VARIANT_STATUS_LABEL[entry.status_id as ImageVariantStatusId] ?? "Unknown"}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {PROVENANCE_LABEL[entry.provenance as Provenance] ?? entry.provenance}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </Card>
    </div>
  );
}
