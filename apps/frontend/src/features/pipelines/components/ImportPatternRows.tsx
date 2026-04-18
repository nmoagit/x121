/**
 * Editable pattern row components for the import rules editor (PRD-141).
 */

import { Input, Tooltip } from "@/components/primitives";
import { ICON_ACTION_BTN_DANGER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { Trash2 } from "@/tokens/icons";

import type { MetadataImportPattern, SeedImportPattern, VideoImportPattern } from "../types";

/* --------------------------------------------------------------------------
   Seed pattern row
   -------------------------------------------------------------------------- */

interface SeedPatternRowProps {
  pattern: SeedImportPattern;
  onChange: (updated: SeedImportPattern) => void;
  onRemove: () => void;
}

export function SeedPatternRow({ pattern, onChange, onRemove }: SeedPatternRowProps) {
  return (
    <div className="flex items-start gap-2">
      <Input
        label="Slot"
        value={pattern.slot}
        onChange={(e) => onChange({ ...pattern, slot: e.target.value })}
        placeholder="e.g. clothed"
        className="w-28"
      />
      <div className="flex-1">
        <Input
          label="Pattern"
          value={pattern.pattern}
          onChange={(e) => onChange({ ...pattern, pattern: e.target.value })}
          placeholder="e.g. .*clothed.*"
        />
      </div>
      <Input
        label="Extensions"
        value={pattern.extensions.join(", ")}
        onChange={(e) => onChange({ ...pattern, extensions: parseExtensions(e.target.value) })}
        placeholder="png, jpg, webp"
        className="w-36"
      />
      <Tooltip content="Remove pattern">
        <button
          type="button"
          onClick={onRemove}
          className={cn("mt-6", ICON_ACTION_BTN_DANGER)}
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Video pattern row
   -------------------------------------------------------------------------- */

interface VideoPatternRowProps {
  pattern: VideoImportPattern;
  onChange: (updated: VideoImportPattern) => void;
  onRemove: () => void;
}

export function VideoPatternRow({ pattern, onChange, onRemove }: VideoPatternRowProps) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <Input
          label="Pattern"
          value={pattern.pattern}
          onChange={(e) => onChange({ ...pattern, pattern: e.target.value })}
          placeholder="e.g. .*\\.(mp4|webm)$"
        />
      </div>
      <Input
        label="Extensions"
        value={pattern.extensions.join(", ")}
        onChange={(e) => onChange({ ...pattern, extensions: parseExtensions(e.target.value) })}
        placeholder="mp4, webm, mov"
        className="w-36"
      />
      <Tooltip content="Remove pattern">
        <button
          type="button"
          onClick={onRemove}
          className={cn("mt-6", ICON_ACTION_BTN_DANGER)}
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Metadata pattern row
   -------------------------------------------------------------------------- */

interface MetadataPatternRowProps {
  pattern: MetadataImportPattern;
  onChange: (updated: MetadataImportPattern) => void;
  onRemove: () => void;
}

export function MetadataPatternRow({ pattern, onChange, onRemove }: MetadataPatternRowProps) {
  return (
    <div className="flex items-start gap-2">
      <Input
        label="Type"
        value={pattern.type}
        onChange={(e) => onChange({ ...pattern, type: e.target.value })}
        placeholder="e.g. bio"
        className="w-28"
      />
      <div className="flex-1">
        <Input
          label="Pattern"
          value={pattern.pattern}
          onChange={(e) => onChange({ ...pattern, pattern: e.target.value })}
          placeholder="e.g. .*bio\\.json$"
        />
      </div>
      <Tooltip content="Remove pattern">
        <button
          type="button"
          onClick={onRemove}
          className={cn("mt-6", ICON_ACTION_BTN_DANGER)}
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function parseExtensions(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
