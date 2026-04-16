/**
 * Compact table for video settings overrides at project/group/avatar level.
 *
 * Only shows active scene types. Shows inherited values (from scene type
 * defaults) in placeholders so users can see what they'd get without an override.
 */

import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/domain";
import { Button, LoadingPane } from "@/components/primitives";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";
import type { SceneType } from "@/features/scene-types";
import { Check, RotateCcw, Trash2 } from "@/tokens/icons";

import { FPS_OPTIONS, RESOLUTION_OPTIONS, EMPTY_OVERRIDE, type VideoSettingsOverride } from "./types";
import { cn } from "@/lib/cn";
import { TERMINAL_SELECT } from "@/lib/ui-classes";
import { TYPO_DATA, TYPO_LABEL} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Compact form element classes (bypass design system wrappers for density)
   -------------------------------------------------------------------------- */

const INPUT_CLS =
  "w-full px-2 py-1 text-xs font-mono bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] placeholder:text-[var(--color-text-muted)] placeholder:opacity-40 focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]";

const SELECT_CLS = cn(TERMINAL_SELECT, "w-full");

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Look up resolution label by value (e.g. "720p" -> "720p"). */
function resolutionLabel(value: string | null): string | null {
  if (!value) return null;
  const found = RESOLUTION_OPTIONS.find((r) => r.value === value);
  return found ? found.value : value;
}

/* --------------------------------------------------------------------------
   Per-row editor
   -------------------------------------------------------------------------- */

interface OverrideRowProps {
  sceneType: SceneType;
  existing: VideoSettingsOverride | undefined;
  onSave: (sceneTypeId: number, values: VideoSettingsOverride) => void;
  onDelete: (sceneTypeId: number) => void;
  isSaving: boolean;
}

function OverrideRow({ sceneType, existing, onSave, onDelete, isSaving }: OverrideRowProps) {
  const serverValues = existing ?? EMPTY_OVERRIDE;
  const [draft, setDraft] = useState<VideoSettingsOverride>(serverValues);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isSaving) setDraft(existing ?? EMPTY_OVERRIDE);
  }, [existing, isSaving]);

  const hasOverride =
    serverValues.target_duration_secs !== null ||
    serverValues.target_fps !== null ||
    serverValues.target_resolution !== null;

  const isDirty =
    draft.target_duration_secs !== serverValues.target_duration_secs ||
    draft.target_fps !== serverValues.target_fps ||
    draft.target_resolution !== serverValues.target_resolution;

  const draftHasValues =
    draft.target_duration_secs !== null ||
    draft.target_fps !== null ||
    draft.target_resolution !== null;

  const handleSave = useCallback(() => {
    onSave(sceneType.id, draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [onSave, sceneType.id, draft]);

  // Build inherited placeholder strings from the scene type defaults.
  const inheritedDuration = sceneType.target_duration_secs != null
    ? `${sceneType.target_duration_secs}s (inherited)`
    : "Not set";
  const inheritedFps = sceneType.target_fps != null
    ? `${sceneType.target_fps} fps (inherited)`
    : "Not set (inherited)";
  const inheritedRes = resolutionLabel(sceneType.target_resolution);
  const inheritedResLabel = inheritedRes
    ? `${inheritedRes} (inherited)`
    : "Not set (inherited)";

  return (
    <tr className="border-b border-[var(--color-border-default)]/30 last:border-b-0">
      <td className="py-1 pr-3">
        <div className={`flex items-center gap-1.5 ${TYPO_DATA}`}>
          <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{sceneType.name}</span>
          {hasOverride && <span className="text-[var(--color-data-orange)]">override</span>}
        </div>
      </td>
      <td className="py-1 px-1">
        <input
          type="number"
          min={1}
          value={draft.target_duration_secs ?? ""}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              target_duration_secs: e.target.value ? Number.parseInt(e.target.value, 10) : null,
            }))
          }
          placeholder={inheritedDuration}
          className={`${INPUT_CLS} w-28`}
        />
      </td>
      <td className="py-1 px-1">
        <select
          value={draft.target_fps != null ? String(draft.target_fps) : ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, target_fps: e.target.value ? Number.parseInt(e.target.value, 10) : null }))
          }
          className={`${SELECT_CLS} w-36`}
        >
          <option value="">{inheritedFps}</option>
          {FPS_OPTIONS.map((fps) => (
            <option key={fps} value={String(fps)}>{fps} fps</option>
          ))}
        </select>
      </td>
      <td className="py-1 px-1">
        <select
          value={draft.target_resolution ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, target_resolution: e.target.value || null }))
          }
          className={`${SELECT_CLS} w-40`}
        >
          <option value="">{inheritedResLabel}</option>
          {RESOLUTION_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </td>
      <td className="py-1 pl-1">
        <div className="flex items-center gap-1">
          {isDirty && draftHasValues && (
            <Button variant="primary" size="xs" icon={<Check size={12} />} onClick={handleSave} loading={isSaving} aria-label="Save">
              Save
            </Button>
          )}
          {isDirty && !draftHasValues && (
            <Button variant="ghost" size="xs" icon={<RotateCcw size={12} />} onClick={() => setDraft(existing ?? EMPTY_OVERRIDE)} aria-label="Reset" />
          )}
          {!isDirty && hasOverride && (
            <Button variant="ghost" size="xs" icon={<Trash2 size={12} />} onClick={() => onDelete(sceneType.id)} aria-label="Clear override" className="!text-[var(--color-data-red)] hover:!text-red-300" />
          )}
          {!isDirty && saved && <span className="text-[10px] font-mono text-[var(--color-data-green)]">saved</span>}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface VideoSettingsOverrideTableProps {
  overrides: Record<number, VideoSettingsOverride>;
  isLoading: boolean;
  onSave: (sceneTypeId: number, values: VideoSettingsOverride) => void;
  onDelete: (sceneTypeId: number) => void;
  savingIds?: Set<number>;
  projectId?: number;
  /** When provided, only scene types in this set are shown (project/avatar enabled scenes). */
  enabledSceneTypeIds?: Set<number>;
}

export function VideoSettingsOverrideTable({
  overrides,
  isLoading,
  onSave,
  onDelete,
  savingIds = new Set(),
  projectId,
  enabledSceneTypeIds,
}: VideoSettingsOverrideTableProps) {
  const { data: sceneTypes, isLoading: sceneTypesLoading } = useSceneTypes(projectId);

  if (sceneTypesLoading || isLoading) return <LoadingPane />;

  // Filter to enabled scene types only. If enabledSceneTypeIds is provided, use
  // that (project/avatar scope). Otherwise fall back to is_active on the type.
  const visible = (sceneTypes ?? []).filter((st) =>
    enabledSceneTypeIds ? enabledSceneTypeIds.has(st.id) : st.is_active,
  );

  if (!visible.length) {
    return (
      <EmptyState
        title="No Enabled Scenes"
        description="Enable scenes in Scene Settings to configure video settings overrides."
      />
    );
  }

  const sorted = [...visible].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[var(--color-border-default)]/30">
          <th className={`text-left ${TYPO_LABEL} py-1 pr-3`}>Scene Type</th>
          <th className={`text-left ${TYPO_LABEL} py-1 px-1`}>Duration (s)</th>
          <th className={`text-left ${TYPO_LABEL} py-1 px-1`}>FPS</th>
          <th className={`text-left ${TYPO_LABEL} py-1 px-1`}>Resolution</th>
          <th className="py-1 pl-1 w-24" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((st) => (
          <OverrideRow
            key={st.id}
            sceneType={st}
            existing={overrides[st.id]}
            onSave={onSave}
            onDelete={onDelete}
            isSaving={savingIds.has(st.id)}
          />
        ))}
      </tbody>
    </table>
  );
}
