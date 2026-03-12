/**
 * Compact card for editing video settings (duration, fps, resolution)
 * at any level of the hierarchy.
 *
 * Parent components provide the override values, save/reset handlers,
 * and optionally the inherited/resolved values for placeholder display.
 */

import { Badge, Button, Input, Select } from "@/components/primitives";
import { RotateCcw, Save } from "@/tokens/icons";

import {
  FPS_OPTIONS,
  RESOLUTION_OPTIONS,
  SOURCE_LABELS,
  type ResolvedVideoSettings,
  type VideoSettingsOverride,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FPS_SELECT_OPTIONS = [
  { value: "", label: "Inherit" },
  ...FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` })),
];

const RESOLUTION_SELECT_OPTIONS = [
  { value: "", label: "Inherit" },
  ...RESOLUTION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
];

/** FPS options for the base level (no "Inherit" option). */
const FPS_SELECT_OPTIONS_BASE = FPS_OPTIONS.map((fps) => ({
  value: String(fps),
  label: `${fps} fps`,
}));

/** Resolution options for the base level (no "Inherit" option). */
const RESOLUTION_SELECT_OPTIONS_BASE = RESOLUTION_OPTIONS.map((r) => ({
  value: r.value,
  label: r.label,
}));

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface VideoSettingsPanelProps {
  /** Current override values at this level (null = inherit). */
  values: VideoSettingsOverride;
  /** Called when user changes a value. */
  onChange: (values: VideoSettingsOverride) => void;
  /** Called when user clicks Save. */
  onSave: () => void;
  /** Called when user clicks Reset/Clear (remove override). */
  onReset?: () => void;
  /** Whether a save is in progress. */
  isSaving: boolean;
  /** Resolved/inherited values for showing placeholders and source badges. */
  inherited?: Partial<ResolvedVideoSettings>;
  /** Whether this is the base level (scene type) — hides Reset button and Inherit options. */
  isBaseLevel?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VideoSettingsPanel({
  values,
  onChange,
  onSave,
  onReset,
  isSaving,
  inherited,
  isBaseLevel = false,
}: VideoSettingsPanelProps) {
  const hasChanges =
    values.target_duration_secs !== null ||
    values.target_fps !== null ||
    values.target_resolution !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Duration */}
        <div className="flex flex-col gap-1">
          <Input
            label="Duration (s)"
            type="number"
            min={1}
            value={values.target_duration_secs ?? ""}
            onChange={(e) =>
              onChange({
                ...values,
                target_duration_secs: e.target.value
                  ? Number.parseInt(e.target.value, 10)
                  : null,
              })
            }
            placeholder={
              inherited?.duration_secs != null
                ? String(inherited.duration_secs)
                : "e.g. 30"
            }
          />
          {!isBaseLevel && inherited?.duration_source && values.target_duration_secs === null && (
            <Badge variant="default" size="sm">
              {SOURCE_LABELS[inherited.duration_source]}
            </Badge>
          )}
        </div>

        {/* FPS */}
        <div className="flex flex-col gap-1">
          <Select
            label="FPS"
            value={values.target_fps != null ? String(values.target_fps) : ""}
            onChange={(val) =>
              onChange({
                ...values,
                target_fps: val ? Number.parseInt(val, 10) : null,
              })
            }
            options={isBaseLevel ? FPS_SELECT_OPTIONS_BASE : FPS_SELECT_OPTIONS}
            placeholder={
              isBaseLevel
                ? "Select FPS"
                : inherited?.fps != null
                  ? `Inherit (${inherited.fps} fps)`
                  : "Inherit"
            }
          />
          {!isBaseLevel && inherited?.fps_source && values.target_fps === null && (
            <Badge variant="default" size="sm">
              {SOURCE_LABELS[inherited.fps_source]}
            </Badge>
          )}
        </div>

        {/* Resolution */}
        <div className="flex flex-col gap-1">
          <Select
            label="Resolution"
            value={values.target_resolution ?? ""}
            onChange={(val) =>
              onChange({
                ...values,
                target_resolution: val || null,
              })
            }
            options={isBaseLevel ? RESOLUTION_SELECT_OPTIONS_BASE : RESOLUTION_SELECT_OPTIONS}
            placeholder={
              isBaseLevel
                ? "Select resolution"
                : inherited?.resolution
                  ? `Inherit (${inherited.resolution})`
                  : "Inherit"
            }
          />
          {!isBaseLevel && inherited?.resolution_source && values.target_resolution === null && (
            <Badge variant="default" size="sm">
              {SOURCE_LABELS[inherited.resolution_source]}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {!isBaseLevel && onReset && hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={onReset}
          >
            Clear Overrides
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          icon={<Save size={14} />}
          onClick={onSave}
          loading={isSaving}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
