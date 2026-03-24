/**
 * Avatar summary card for the project avatars grid (PRD-112).
 */

import { useNavigate } from "@tanstack/react-router";
import { FlagIcon, ProgressiveImage, Tooltip } from "@/components/primitives";
import { variantThumbnailUrl } from "@/features/media/utils";
import { useAvatarPath } from "@/hooks/usePipelinePath";
import { cn } from "@/lib/cn";
import { TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import { AlertTriangle, Check, Edit3, FileText, Film, Image, Mic, Power, User } from "@/tokens/icons";

import type { AvatarDeliveryStatus } from "@/features/delivery";
import {
  DELIVERY_STATUS_LABELS,
} from "@/features/delivery";

import type { Avatar, AvatarGroup, SectionKey, SectionReadiness } from "../types";
import { avatarStatusLabel } from "../types";
import { ReadinessIndicators } from "./ReadinessIndicators";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/** Seed data completeness status for the avatar (PRD-135). */
export interface SeedDataStatus {
  hasClothedImage: boolean;
  hasToplessImage: boolean;
  hasBio: boolean;
  hasTov: boolean;
}

/** Language flag summary for displaying on avatar cards. */
export interface SpeechLanguageSummary {
  flagCode: string;
  languageCode: string;
  count: number;
}

interface AvatarCardProps {
  avatar: Avatar;
  group?: AvatarGroup;
  avatarUrl?: string | null;
  heroVariantId?: number | null;
  selected?: boolean;
  deliveryStatus?: AvatarDeliveryStatus;
  blockingReasons?: string[];
  sectionReadiness?: Record<SectionKey, SectionReadiness>;
  /** Which sections must be complete for green border. Defaults to all sections. */
  blockingDeliverables?: string[];
  projectId?: number;
  /** Seed data completeness indicators. Omit to hide dots. */
  seedDataStatus?: SeedDataStatus;
  /** Languages the avatar has speech entries for. Omit to hide flags. */
  speechLanguages?: SpeechLanguageSummary[];
  onSelect?: (charId: number) => void;
  onClick: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (charId: number, enabled: boolean) => void;
}

const SEED_SECTIONS: { key: keyof SeedDataStatus; label: string; Icon: typeof Image }[] = [
  { key: "hasClothedImage", label: "Clothed image", Icon: Image },
  { key: "hasToplessImage", label: "Topless image", Icon: Image },
  { key: "hasBio", label: "Bio", Icon: FileText },
  { key: "hasTov", label: "Tone of Voice", Icon: FileText },
];

const MAX_VISIBLE_FLAGS = 5;

function LanguageFlags({ languages }: { languages: SpeechLanguageSummary[] }) {
  if (languages.length === 0) return null;
  const visible = languages.slice(0, MAX_VISIBLE_FLAGS);
  const overflow = languages.length - MAX_VISIBLE_FLAGS;

  return (
    <div className="flex items-center gap-1 shrink-0 mr-[2px]">
      {visible.map((lang) => (
        <Tooltip key={lang.languageCode} content={`${lang.languageCode.toUpperCase()}: ${lang.count} speech entries`}>
          <span className="inline-flex"><FlagIcon flagCode={lang.flagCode} size={10} /></span>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-[var(--color-text-muted)] leading-none">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function SeedDataIndicators({ status }: { status: SeedDataStatus }) {
  return (
    <div className="flex flex-col gap-1 rounded-full bg-black/20 p-0.5 backdrop-blur-sm">
      {SEED_SECTIONS.map(({ key, label, Icon }) => {
        const present = status[key];
        return (
          <Tooltip key={key} content={`${label}: ${present ? "Present" : "Missing"}`} side="left">
            <span
              className="flex items-center justify-center size-[18px] rounded-full"
              style={{
                backgroundColor: present
                  ? "var(--color-action-success)"
                  : "var(--color-text-muted)",
              }}
            >
              <Icon
                size={10}
                className={present ? "text-white" : "text-[var(--color-surface-primary)]"}
                aria-hidden
              />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

const REASON_ICON_MAP: Record<string, typeof FileText> = {
  "Missing Seed Image": Image,
  "Images Not Approved": Image,
  "No Scenes": Film,
  "Videos Not Approved": Film,
  "Missing Metadata": FileText,
  "Metadata Not Approved": FileText,
  "Missing Speech": Mic,
  "Speech Not Approved": Mic,
};

const REASON_TAB_MAP: Record<string, string> = {
  "Missing Seed Image": "images",
  "Images Not Approved": "images",
  "No Scenes": "scenes",
  "Videos Not Approved": "scenes",
  "Missing Metadata": "metadata",
  "Metadata Not Approved": "metadata",
  "Missing Speech": "speech",
  "Speech Not Approved": "speech",
};

function BlockingReasonIcon({ reason, projectId, avatarId }: { reason: string; projectId?: number; avatarId: number }) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();
  const Icon = REASON_ICON_MAP[reason] ?? AlertTriangle;
  const tab = REASON_TAB_MAP[reason];

  return (
    <Tooltip content={reason} side="top">
      <span
        role="button"
        tabIndex={0}
        className="flex items-center justify-center size-[18px] rounded-full bg-orange-500/20 ring-1 ring-orange-500 cursor-pointer hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          if (tab && projectId) {
            navigate({
              to: avatarPath(projectId, avatarId) as string,
              search: { tab },
            });
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && tab && projectId) {
            e.stopPropagation();
            navigate({
              to: avatarPath(projectId, avatarId) as string,
              search: { tab },
            });
          }
        }}
      >
        <Icon size={10} className="text-orange-500" aria-hidden />
      </span>
    </Tooltip>
  );
}

export function AvatarCard({ avatar, group, avatarUrl, heroVariantId, selected, deliveryStatus, blockingReasons, sectionReadiness, blockingDeliverables, projectId, seedDataStatus, speechLanguages, onSelect, onClick, onEdit, onToggleEnabled }: AvatarCardProps) {
  const statusLabel = avatarStatusLabel(avatar.status_id);
  const isDisabled = !avatar.is_enabled;

  const allComplete = sectionReadiness != null &&
    (Object.entries(sectionReadiness) as [string, { state: string }][])
      .filter(([key]) => !blockingDeliverables || blockingDeliverables.includes(key))
      .every(([, s]) => s.state === "complete");

  return (
    <div
      className={cn(
        "group/card cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden",
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
        aria-label={`Open avatar ${avatar.name}`}
      >
        {/* Avatar area */}
        <div className="relative aspect-[4/3] bg-[#161b22] overflow-hidden rounded-t-[inherit]">
          {avatarUrl ? (
            heroVariantId ? (
              <ProgressiveImage
                lowSrc={variantThumbnailUrl(heroVariantId, 128)}
                highSrc={avatarUrl}
                alt={avatar.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <img
                src={avatarUrl}
                alt={avatar.name}
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
                onSelect(avatar.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(avatar.id);
                }
              }}
              aria-label={`${selected ? "Deselect" : "Select"} ${avatar.name}`}
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
              aria-label={`Edit ${avatar.name}`}
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
                onToggleEnabled(avatar.id, !avatar.is_enabled);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleEnabled(avatar.id, !avatar.is_enabled);
                }
              }}
              aria-label={isDisabled ? `Enable ${avatar.name}` : `Disable ${avatar.name}`}
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
              avatarId={avatar.id}
              blockingDeliverables={blockingDeliverables}
            />
          </div>
        )}

        {/* Seed data completeness overlay */}
        {seedDataStatus && !sectionReadiness && (
          <div className={cn("absolute right-1.5 top-1.5 z-10", seedDataStatus.hasClothedImage && seedDataStatus.hasToplessImage && seedDataStatus.hasBio && seedDataStatus.hasTov && "opacity-30")}>
            <SeedDataIndicators status={seedDataStatus} />
          </div>
        )}

        {/* Info area */}
        <div className="px-[var(--spacing-2)] py-[var(--spacing-2)]">
          <div className="flex items-center justify-between gap-1">
            <h3 className="text-xs font-medium text-[var(--color-text-primary)] font-mono truncate">
              {avatar.name}
            </h3>
            {speechLanguages && speechLanguages.length > 0 && (
              <LanguageFlags languages={speechLanguages} />
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-1 font-mono text-[10px]">
            <span className="text-[var(--color-text-muted)] truncate">
              {group?.name ?? "\u00A0"}
            </span>
            <span className={TERMINAL_STATUS_COLORS[statusLabel.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
              {statusLabel.toLowerCase()}
            </span>
          </div>
          {deliveryStatus && deliveryStatus.status !== "not_delivered" && (
            <div className="mt-0.5 font-mono text-[10px]">
              <span className={TERMINAL_STATUS_COLORS[deliveryStatus.status] ?? "text-[var(--color-text-muted)]"}>
                {DELIVERY_STATUS_LABELS[deliveryStatus.status].toLowerCase()}
              </span>
            </div>
          )}
          {blockingReasons && blockingReasons.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              {blockingReasons.map((reason) => (
                <BlockingReasonIcon key={reason} reason={reason} projectId={projectId} avatarId={avatar.id} />
              ))}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
