/**
 * App-level video settings defaults tab.
 *
 * Shows all scene types in a compact table with inline-editable
 * duration, fps, and resolution. These are the base-level defaults
 * that all projects, groups, and avatars inherit from.
 */

import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useSceneTypes, useUpdateSceneType } from "@/features/scene-types";
import type { SceneType } from "@/features/scene-types";
import { Check, RotateCcw } from "@/tokens/icons";

import {
  TERMINAL_PANEL,
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";
import { FPS_OPTIONS, RESOLUTION_OPTIONS } from "./types";
import { TYPO_DATA, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Shared compact input classes
   -------------------------------------------------------------------------- */

const INPUT_CLS =
  "w-full px-2 py-1 text-xs font-mono bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] placeholder:text-[var(--color-text-muted)] placeholder:opacity-40 focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]";

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
    <tr className={`${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
      <td className="py-2 px-3">
        <div className={`flex items-center gap-1.5 ${TYPO_DATA}`}>
          <span className="text-[var(--color-text-primary)] uppercase tracking-wide">{sceneType.name}</span>
          {!sceneType.is_active && <span className="text-[var(--color-text-muted)]">inactive</span>}
        </div>
      </td>
      <td className="py-2 px-2">
        <input
          type="number"
          min={1}
          value={draft.target_duration_secs}
          onChange={(e) => setDraft((d) => ({ ...d, target_duration_secs: e.target.value }))}
          placeholder="e.g. 16"
          className={`${INPUT_CLS} w-20`}
        />
      </td>
      <td className="py-2 px-2">
        <select
          value={draft.target_fps}
          onChange={(e) => setDraft((d) => ({ ...d, target_fps: e.target.value }))}
          className={`${TERMINAL_SELECT} w-24`}
        >
          <option value="">Not set</option>
          {FPS_OPTIONS.map((fps) => (
            <option key={fps} value={String(fps)}>{fps} fps</option>
          ))}
        </select>
      </td>
      <td className="py-2 px-2">
        <select
          value={draft.target_resolution}
          onChange={(e) => setDraft((d) => ({ ...d, target_resolution: e.target.value }))}
          className={`${TERMINAL_SELECT} w-36`}
        >
          <option value="">Not set</option>
          {RESOLUTION_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          {isDirty && (
            <>
              <Button variant="primary" size="xs" icon={<Check size={12} />} onClick={handleSave} loading={updateMutation.isPending} aria-label="Save">
                Save
              </Button>
              <Button variant="ghost" size="xs" icon={<RotateCcw size={12} />} onClick={() => setDraft(toRowDraft(sceneType))} aria-label="Reset" />
            </>
          )}
          {!isDirty && updateMutation.isSuccess && <span className="font-mono text-[10px] text-[var(--color-data-green)]">saved</span>}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main tab
   -------------------------------------------------------------------------- */

export function VideoSettingsDefaultsTab() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneTypes, isLoading } = useSceneTypes(undefined, pipelineCtx?.pipelineId);

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
      <p className={TYPO_DATA_MUTED}>
        Set the default video duration, frame rate, and resolution for each scene type.
        These defaults are inherited by all projects, groups, and avatars unless overridden.
      </p>

      <div className={TERMINAL_PANEL}>
        <table className="w-full">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={`${TERMINAL_TH} py-2 px-3`}>Scene Type</th>
              <th className={`${TERMINAL_TH} py-2 px-2`}>Duration (s)</th>
              <th className={`${TERMINAL_TH} py-2 px-2`}>FPS</th>
              <th className={`${TERMINAL_TH} py-2 px-2`}>Resolution</th>
              <th className="py-2 px-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((st) => (
              <SceneTypeRow key={st.id} sceneType={st} />
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}
