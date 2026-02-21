import { useState } from "react";

import { MetadataField } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner } from "@/components/primitives";
import { CompatibilityWarning } from "@/features/admin/CompatibilityWarning";
import { useAssetDetail, useRateAsset } from "@/features/admin/hooks/use-assets";
import type {
  AssetDependency,
  AssetNote,
  AssetRating,
  RatingSummary,
} from "@/features/admin/hooks/use-assets";
import { formatBytes, formatDate } from "@/lib/format";
import { AlertCircle, ArrowLeft } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   RatingWidget sub-component
   -------------------------------------------------------------------------- */

interface RatingWidgetProps {
  assetId: number;
  summary: RatingSummary;
}

function RatingWidget({ assetId, summary }: RatingWidgetProps) {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const rateMutation = useRateAsset(assetId);

  function handleRate(value: number) {
    setSelected(value);
    rateMutation.mutate({ rating: value });
  }

  return (
    <div className="flex items-center gap-[var(--spacing-3)]">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleRate(star)}
            className="text-lg transition-colors"
            style={{
              color:
                star <= (hovered || selected)
                  ? "var(--color-action-warning)"
                  : "var(--color-text-muted)",
            }}
          >
            {"\u2605"}
          </button>
        ))}
      </div>
      <span className="text-sm text-[var(--color-text-muted)]">
        {summary.avg_rating.toFixed(1)} ({summary.total_ratings} rating
        {summary.total_ratings !== 1 ? "s" : ""})
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sections
   -------------------------------------------------------------------------- */

function DependencyList({ dependencies }: { dependencies: AssetDependency[] }) {
  if (dependencies.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No dependencies linked.</p>;
  }

  return (
    <ul className="space-y-[var(--spacing-2)]">
      {dependencies.map((dep) => (
        <li
          key={dep.id}
          className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-primary)] px-[var(--spacing-3)] py-[var(--spacing-2)]"
        >
          <span className="text-sm text-[var(--color-text-primary)]">
            {dep.dependent_entity_type} #{dep.dependent_entity_id}
          </span>
          <Badge variant="default" size="sm">
            {dep.dependency_role}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function NotesList({ notes }: { notes: AssetNote[] }) {
  if (notes.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No notes.</p>;
  }

  const severityVariant: Record<string, "default" | "info" | "warning" | "danger"> = {
    info: "info",
    warning: "warning",
    error: "danger",
  };

  return (
    <ul className="space-y-[var(--spacing-2)]">
      {notes.map((note) => (
        <li
          key={note.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] p-[var(--spacing-3)]"
        >
          <div className="flex items-center gap-[var(--spacing-2)] mb-1">
            <Badge variant={severityVariant[note.severity] ?? "default"} size="sm">
              {note.severity}
            </Badge>
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatDate(note.created_at)}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-primary)]">{note.note_text}</p>
        </li>
      ))}
    </ul>
  );
}

function RatingsList({ ratings }: { ratings: AssetRating[] }) {
  if (ratings.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No ratings yet.</p>;
  }

  return (
    <ul className="space-y-[var(--spacing-2)]">
      {ratings.map((r) => (
        <li
          key={r.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] p-[var(--spacing-3)]"
        >
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span className="text-sm text-[var(--color-action-warning)]">
              {"\u2605".repeat(r.rating)}
              {"\u2606".repeat(5 - r.rating)}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatDate(r.created_at)}
            </span>
          </div>
          {r.review_text && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{r.review_text}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------------
   AssetDetail component
   -------------------------------------------------------------------------- */

interface AssetDetailProps {
  assetId: number;
  onBack?: () => void;
}

export function AssetDetail({ assetId, onBack }: AssetDetailProps) {
  const { data, isLoading } = useAssetDetail(assetId);

  if (isLoading || !data) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const { asset, notes, rating_summary, dependencies } = data;

  const warnings = notes.filter((n) => n.severity === "warning" || n.severity === "error");

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] p-[var(--spacing-6)]">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center gap-[var(--spacing-3)]">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={16} />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {asset.name}{" "}
              <span className="font-normal text-[var(--color-text-muted)]">v{asset.version}</span>
            </h1>
          </div>
        </div>

        {/* Compatibility warnings */}
        {warnings.length > 0 && <CompatibilityWarning notes={warnings} />}

        {/* Main content grid */}
        <div className="grid grid-cols-1 gap-[var(--spacing-6)] lg:grid-cols-3">
          {/* Left column: asset info */}
          <div className="lg:col-span-2">
            <Stack gap={4}>
              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Details
                </h2>
                <div className="grid grid-cols-2 gap-[var(--spacing-3)]">
                  <MetadataField label="File Path" value={asset.file_path} />
                  <MetadataField label="File Size" value={formatBytes(asset.file_size_bytes)} />
                  <MetadataField
                    label="Checksum"
                    value={`${asset.checksum_sha256.slice(0, 16)}...`}
                  />
                  <MetadataField label="Registered" value={formatDate(asset.created_at)} />
                </div>
              </section>

              {asset.description && (
                <section>
                  <h2 className="mb-[var(--spacing-2)] text-base font-semibold text-[var(--color-text-primary)]">
                    Description
                  </h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">{asset.description}</p>
                </section>
              )}

              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Rating
                </h2>
                <RatingWidget assetId={assetId} summary={rating_summary} />
              </section>

              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Notes
                </h2>
                <NotesList notes={notes} />
              </section>

              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Reviews
                </h2>
                <RatingsList ratings={[]} />
              </section>
            </Stack>
          </div>

          {/* Right column: dependencies & actions */}
          <div>
            <Stack gap={4}>
              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Dependencies
                </h2>
                <DependencyList dependencies={dependencies} />
              </section>

              <section>
                <h2 className="mb-[var(--spacing-3)] text-base font-semibold text-[var(--color-text-primary)]">
                  Actions
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // Placeholder for integrity verification.
                  }}
                >
                  <AlertCircle size={14} />
                  <span className="ml-[var(--spacing-1)]">Verify Integrity</span>
                </Button>
              </section>
            </Stack>
          </div>
        </div>
      </Stack>
    </div>
  );
}
