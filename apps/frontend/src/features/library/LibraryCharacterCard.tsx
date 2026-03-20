/**
 * Card and row components for displaying characters in the library browser.
 *
 * Both variants are clickable and trigger onSelect to open the preview modal.
 */

import { ProgressiveImage } from "@/components/primitives";
import { variantThumbnailUrl } from "@/features/images/utils";
import { cn } from "@/lib/cn";
import { TERMINAL_PANEL, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { Check, Film, Image, Minus, User, Video } from "@/tokens/icons";

import type { LibraryCharacter } from "./types";

interface LibraryCharacterCardProps {
  character: LibraryCharacter;
  onSelect?: (character: LibraryCharacter) => void;
}

export function LibraryCharacterCard({
  character,
  onSelect,
}: LibraryCharacterCardProps) {
  const hasAvatar = character.hero_variant_id != null;

  return (
    <div
      className={cn(
        TERMINAL_PANEL,
        "group/card cursor-pointer overflow-hidden",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        !character.is_enabled && "opacity-70 grayscale",
      )}
      data-testid={`library-card-${character.id}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(character)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(character);
          }
        }}
        className="w-full text-left"
      >
        {/* Avatar area */}
        <div className="relative aspect-[4/3] bg-[var(--color-surface-tertiary)] overflow-hidden">
          {hasAvatar ? (
            <ProgressiveImage
              lowSrc={variantThumbnailUrl(character.hero_variant_id!, 128)}
              highSrc={variantThumbnailUrl(character.hero_variant_id!, 1024)}
              alt={character.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <User size={48} className="text-[var(--color-text-muted)] opacity-30" />
            </div>
          )}
        </div>

        {/* Info area */}
        <div className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-mono text-xs text-cyan-400 truncate">
              {character.name}
            </h4>
            <span className="flex items-center gap-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              <Film size={10} aria-hidden />
              {character.scene_count}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)] truncate">
            {character.project_name}
            {character.group_name && ` / ${character.group_name}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row view variant
   -------------------------------------------------------------------------- */

export function LibraryCharacterRow({
  character,
  onSelect,
}: LibraryCharacterCardProps) {
  const hasAvatar = character.hero_variant_id != null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(character)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(character);
        }
      }}
      className={cn(
        "flex items-center gap-4 px-3 py-2",
        TERMINAL_PANEL,
        TERMINAL_ROW_HOVER,
        "cursor-pointer",
        !character.is_enabled && "opacity-70 grayscale",
      )}
      data-testid={`library-row-${character.id}`}
    >
      {/* Avatar thumbnail */}
      <div className="shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--color-surface-tertiary)] overflow-hidden relative">
        {hasAvatar ? (
          <ProgressiveImage
            lowSrc={variantThumbnailUrl(character.hero_variant_id!, 64)}
            highSrc={variantThumbnailUrl(character.hero_variant_id!, 128)}
            alt={character.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={18} className="text-[var(--color-text-muted)] opacity-30" />
          </div>
        )}
      </div>

      {/* Name + project */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-cyan-400 truncate">
          {character.name}
        </p>
        <p className="font-mono text-[10px] text-[var(--color-text-muted)] truncate">
          {character.project_name}
          {character.group_name && ` / ${character.group_name}`}
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
        <span title="Images" className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <Image size={10} aria-hidden />
          {character.image_count}
        </span>
        <span className="opacity-30">|</span>
        <span title="Scenes" className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <Film size={10} aria-hidden />
          {character.scene_count}
        </span>
        <span className="opacity-30">|</span>
        <span title="Clips" className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
          <Video size={10} aria-hidden />
          {character.clip_count}
        </span>
        <span className="opacity-30">|</span>
        <span
          title={character.has_metadata ? "Metadata present" : "No metadata"}
          className={cn(
            "flex items-center gap-0.5",
            character.has_metadata
              ? "text-green-400"
              : "text-[var(--color-text-muted)]",
          )}
        >
          {character.has_metadata ? <Check size={10} /> : <Minus size={10} />}
          Meta
        </span>
      </div>
    </div>
  );
}
