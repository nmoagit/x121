/**
 * Character summary card for the project characters grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge, ProgressiveImage } from "@/components/primitives";
import { variantThumbnailUrl } from "@/features/images/utils";
import { cn } from "@/lib/cn";
import { Check, Edit3, Power, User } from "@/tokens/icons";

import type { CharacterDeliveryStatus } from "@/features/delivery";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_VARIANT,
} from "@/features/delivery";

import type { Character, CharacterGroup, SectionKey, SectionReadiness } from "../types";
import { characterStatusBadgeVariant, characterStatusLabel } from "../types";
import { ReadinessIndicators } from "./ReadinessIndicators";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/** Seed data completeness status for the character (PRD-135). */
export interface SeedDataStatus {
  hasClothedImage: boolean;
  hasToplessImage: boolean;
  hasBio: boolean;
  hasTov: boolean;
}

interface CharacterCardProps {
  character: Character;
  group?: CharacterGroup;
  avatarUrl?: string | null;
  heroVariantId?: number | null;
  selected?: boolean;
  deliveryStatus?: CharacterDeliveryStatus;
  blockingReasons?: string[];
  sectionReadiness?: Record<SectionKey, SectionReadiness>;
  /** Which sections must be complete for green border. Defaults to all sections. */
  blockingDeliverables?: string[];
  projectId?: number;
  /** Seed data completeness indicators. Omit to hide dots. */
  seedDataStatus?: SeedDataStatus;
  onSelect?: (charId: number) => void;
  onClick: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (charId: number, enabled: boolean) => void;
}

const SEED_DATA_ITEMS: { key: keyof SeedDataStatus; label: string }[] = [
  { key: "hasClothedImage", label: "Clothed image" },
  { key: "hasToplessImage", label: "Topless image" },
  { key: "hasBio", label: "Bio" },
  { key: "hasTov", label: "Tone of Voice" },
];

function SeedDataDots({ status }: { status: SeedDataStatus }) {
  return (
    <div className="mt-1 flex items-center gap-1">
      {SEED_DATA_ITEMS.map(({ key, label }) => (
        <span
          key={key}
          title={`${label}: ${status[key] ? "Present" : "Missing"}`}
          className={cn(
            "w-2 h-2 rounded-full",
            status[key]
              ? "bg-[var(--color-action-success)]"
              : "bg-[var(--color-text-muted)] opacity-40",
          )}
        />
      ))}
    </div>
  );
}

export function CharacterCard({ character, group, avatarUrl, heroVariantId, selected, deliveryStatus, blockingReasons, sectionReadiness, blockingDeliverables, projectId, seedDataStatus, onSelect, onClick, onEdit, onToggleEnabled }: CharacterCardProps) {
  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);
  const isDisabled = !character.is_enabled;

  const allComplete = sectionReadiness != null &&
    (Object.entries(sectionReadiness) as [string, { state: string }][])
      .filter(([key]) => !blockingDeliverables || blockingDeliverables.includes(key))
      .every(([, s]) => s.state === "complete");

  return (
    <Card
      elevation="sm"
      padding="none"
      className={cn(
        "group/card cursor-pointer",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        selected && "ring-2 ring-[var(--color-border-accent)]",
        allComplete && !isDisabled && "!border-2 !border-green-500",
        isDisabled && "opacity-70 grayscale",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="relative w-full text-left"
        aria-label={`Open character ${character.name}`}
      >
        {/* Avatar area */}
        <div className="relative aspect-[4/3] bg-[var(--color-surface-tertiary)] overflow-hidden rounded-t-[inherit]">
          {avatarUrl ? (
            heroVariantId ? (
              <ProgressiveImage
                lowSrc={variantThumbnailUrl(heroVariantId, 128)}
                highSrc={avatarUrl}
                alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <img
                src={avatarUrl}
                alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <User size={48} className="text-[var(--color-text-muted)] opacity-30" />
            </div>
          )}

          {/* Selection checkbox overlay */}
          {onSelect && (
            <span
              role="checkbox"
              tabIndex={0}
              aria-checked={selected}
              className={cn(
                "absolute top-2 left-2 shrink-0 w-5 h-5 rounded-[var(--radius-sm)] border flex items-center justify-center cursor-pointer transition-colors",
                selected
                  ? "bg-[var(--color-action-primary)] border-[var(--color-action-primary)] text-white"
                  : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-[var(--color-border-accent)] text-transparent opacity-0 group-hover/card:opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(character.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(character.id);
                }
              }}
              aria-label={`${selected ? "Deselect" : "Select"} ${character.name}`}
            >
              <Check size={12} aria-hidden />
            </span>
          )}

          {/* Edit button overlay */}
          {onEdit && (
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "absolute top-2 p-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-primary)]/80 text-[var(--color-text-muted)] opacity-0 group-hover/card:opacity-100 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)] cursor-pointer transition-opacity",
                sectionReadiness ? "right-9" : "right-2",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit();
                }
              }}
              aria-label={`Edit ${character.name}`}
            >
              <Edit3 size={14} aria-hidden />
            </span>
          )}

          {/* Enable/disable toggle overlay */}
          {onToggleEnabled && (
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "absolute bottom-2 left-2 p-1 rounded-[var(--radius-sm)] cursor-pointer transition-opacity",
                isDisabled
                  ? "bg-[var(--color-action-danger)]/80 text-white opacity-100"
                  : "bg-[var(--color-surface-primary)]/80 text-[var(--color-text-muted)] opacity-0 group-hover/card:opacity-100 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnabled(character.id, !character.is_enabled);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleEnabled(character.id, !character.is_enabled);
                }
              }}
              aria-label={isDisabled ? `Enable ${character.name}` : `Disable ${character.name}`}
            >
              <Power size={14} aria-hidden />
            </span>
          )}
        </div>

        {/* Readiness indicators overlay — faded when all blocking sections are complete */}
        {sectionReadiness && projectId != null && (
          <div className={cn("absolute right-1.5 top-1.5 z-10", allComplete && "opacity-30")}>
            <ReadinessIndicators
              readiness={sectionReadiness}
              projectId={projectId}
              characterId={character.id}
            />
          </div>
        )}

        {/* Info area */}
        <div className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
          <div className="flex items-center justify-between gap-[var(--spacing-2)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {character.name}
            </h3>
            <Badge variant={badgeVariant} size="sm">
              {statusLabel}
            </Badge>
          </div>
          {group && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
              {group.name}
            </p>
          )}
          {deliveryStatus && deliveryStatus.status !== "not_delivered" && (
            <div className="mt-1">
              <Badge
                variant={DELIVERY_STATUS_VARIANT[deliveryStatus.status]}
                size="sm"
              >
                {DELIVERY_STATUS_LABELS[deliveryStatus.status]}
              </Badge>
            </div>
          )}
          {blockingReasons && blockingReasons.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {blockingReasons.map((reason) => (
                <Badge key={reason} variant="danger" size="sm">{reason}</Badge>
              ))}
            </div>
          )}
          {seedDataStatus && (
            <SeedDataDots status={seedDataStatus} />
          )}
        </div>
      </button>
    </Card>
  );
}
