/**
 * App-level video settings defaults tab.
 *
 * Shows all scene types in a compact table with inline-editable
 * duration, fps, and resolution. These are the base-level defaults
 * that all projects, groups, and characters inherit from.
 */

import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, LoadingPane } from "@/components/primitives";
import { useSceneTypes, useUpdateSceneType } from "@/features/scene-types";
import type { SceneType } from "@/features/scene-types";
import { Check, RotateCcw } from "@/tokens/icons";

import { FPS_OPTIONS, RESOLUTION_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Shared compact input classes
   -------------------------------------------------------------------------- */

const INPUT_CLS =
  "w-full px-2 py-1 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]";

const SELECT_CLS =
  "w-full appearance-none px-2 py-1 pr-6 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]";

/* --------------------------------------------------------------------------
   Per-row editor
   -------------------------------------------------------------------------- */

interface RowDraft {
  target_duration_secs: string;
  target_fps: string;
  target_resolution: string;
}

function toRowDraft(st: SceneType): RowDraft {
  return {
    target_duration_secs: st.target_duration_secs != null ? String(st.target_duration_secs) : "",
    target_fps: st.target_fps != null ? String(st.target_fps) : "",
    target_resolution: st.target_resolution ?? "",
  };
}

function SceneTypeRow({ sceneType }: { sceneType: SceneType }) {
  const updateMutation = useUpdateSceneType(sceneType.id);
  const [draft, setDraft] = useState<RowDraft>(() => toRowDraft(sceneType));

  useEffect(() => {
    if (!updateMutation.isPending) setDraft(toRowDraft(sceneType));
  }, [sceneType, updateMutation.isPending]);

  const server = toRowDraft(sceneType);
  const isDirty =
    draft.target_duration_secs !== server.target_duration_secs ||
    draft.target_fps !== server.target_fps ||
    draft.target_resolution !== server.target_resolution;

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      target_duration_secs: draft.target_duration_secs ? Number.parseInt(draft.target_duration_secs, 10) : null,
      target_fps: draft.target_fps ? Number.parseInt(draft.target_fps, 10) : null,
      target_resolution: draft.target_resolution || null,
    });
  }, [updateMutation, draft]);

  return (
    <tr className="border-b border-[var(--color-border-default)] last:border-b-0">
      <td className="py-1 pr-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--color-text-primary)]">{sceneType.name}</span>
          {!sceneType.is_active && <Badge variant="default" size="sm">Inactive</Badge>}
        </div>
      </td>
      <td className="py-1 px-1">
        <input
          type="number"
          min={1}
          value={draft.target_duration_secs}
          onChange={(e) => setDraft((d) => ({ ...d, target_duration_secs: e.target.value }))}
          placeholder="e.g. 16"
          className={`${INPUT_CLS} w-20`}
        />
      </td>
      <td className="py-1 px-1">
        <select
          value={draft.target_fps}
          onChange={(e) => setDraft((d) => ({ ...d, target_fps: e.target.value }))}
          className={`${SELECT_CLS} w-24`}
        >
          <option value="">Not set</option>
          {FPS_OPTIONS.map((fps) => (
            <option key={fps} value={String(fps)}>{fps} fps</option>
          ))}
        </select>
      </td>
      <td className="py-1 px-1">
        <select
          value={draft.target_resolution}
          onChange={(e) => setDraft((d) => ({ ...d, target_resolution: e.target.value }))}
          className={`${SELECT_CLS} w-36`}
        >
          <option value="">Not set</option>
          {RESOLUTION_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </td>
      <td className="py-1 pl-1">
        <div className="flex items-center gap-1">
          {isDirty && (
            <>
              <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={handleSave} loading={updateMutation.isPending} aria-label="Save">
                Save
              </Button>
              <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setDraft(toRowDraft(sceneType))} aria-label="Reset" />
            </>
          )}
          {!isDirty && updateMutation.isSuccess && <Badge variant="success" size="sm">Saved</Badge>}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main tab
   -------------------------------------------------------------------------- */

export function VideoSettingsDefaultsTab() {
  const { data: sceneTypes, isLoading } = useSceneTypes();

  if (isLoading) return <LoadingPane />;

  if (!sceneTypes?.length) {
    return (
      <EmptyState
        title="No Scene Types"
        description="Create scene types first, then configure their default video settings here."
      />
    );
  }

  const sorted = [...sceneTypes].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  return (
    <Stack gap={3}>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Set the default video duration, frame rate, and resolution for each scene type.
        These defaults are inherited by all projects, groups, and characters unless overridden.
      </p>

      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-[var(--color-border-default)]">
            <th className="text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide py-1 pr-3">Scene Type</th>
            <th className="text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide py-1 px-1">Duration (s)</th>
            <th className="text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide py-1 px-1">FPS</th>
            <th className="text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide py-1 px-1">Resolution</th>
            <th className="py-1 pl-1 w-24" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((st) => (
            <SceneTypeRow key={st.id} sceneType={st} />
          ))}
        </tbody>
      </table>
    </Stack>
  );
}
