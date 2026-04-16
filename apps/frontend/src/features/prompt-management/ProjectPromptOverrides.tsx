/**
 * Project-level prompt overrides for both scene types and image types.
 */

import { useCallback, useMemo } from "react";

import { Stack } from "@/components/layout";
import { ChevronDown, ChevronRight } from "@/tokens/icons";
import { useState } from "react";

import { useProjectImageSettings } from "@/features/image-catalogue/hooks/use-project-image-settings";
import { useProjectSceneSettings } from "@/features/scene-catalogue";

import { ImagePromptOverrides } from "./ImagePromptOverrides";
import {
  useProjectPromptOverrides,
  useUpsertProjectPromptOverrides,
} from "./hooks/use-prompt-management";
import { WorkflowPromptOverridePanel } from "./WorkflowPromptOverridePanel";
import type { SlotOverride } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface ProjectPromptOverridesProps {
  projectId: number;
}

function SectionHeader({ title, count, collapsed, onToggle }: { title: string; count?: number; collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button type="button" className="flex items-center gap-2 py-1.5 mb-1 w-full text-left group" onClick={onToggle}>
      <Icon size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
      <span className={`${TYPO_DATA} font-medium text-[var(--color-text-primary)] uppercase tracking-wide`}>{title}</span>
      {count != null && <span className="font-mono text-[10px] text-[var(--color-text-muted)]">({count})</span>}
    </button>
  );
}

export function ProjectPromptOverrides({ projectId }: ProjectPromptOverridesProps) {
  const { data: sceneSettings, isLoading: settingsLoading } = useProjectSceneSettings(projectId);
  const { data: imageSettings, isLoading: imageSettingsLoading } = useProjectImageSettings(projectId);
  const upsert = useUpsertProjectPromptOverrides();
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const [sceneCollapsed, setSceneCollapsed] = useState(false);

  const useOverrides = (sceneTypeId: number) => useProjectPromptOverrides(projectId, sceneTypeId);

  const handleSave = useCallback(
    (sceneTypeId: number, overrides: SlotOverride[]) => {
      upsert.mutate({ projectId, sceneTypeId, overrides });
    },
    [projectId, upsert],
  );

  const enabledImageTypeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of imageSettings ?? []) {
      if (s.is_enabled) ids.add(s.image_type_id);
    }
    return ids;
  }, [imageSettings]);

  return (
    <Stack gap={4}>
      <div>
        <SectionHeader title="Image Types" collapsed={imageCollapsed} onToggle={() => setImageCollapsed((p) => !p)} />
        {!imageCollapsed && (
          <ImagePromptOverrides enabledImageTypeIds={enabledImageTypeIds} isLoading={imageSettingsLoading} />
        )}
      </div>

      <div>
        <SectionHeader title="Scene Types" collapsed={sceneCollapsed} onToggle={() => setSceneCollapsed((p) => !p)} />
        {!sceneCollapsed && (
          <WorkflowPromptOverridePanel
            settings={sceneSettings}
            settingsLoading={settingsLoading}
            useOverrides={useOverrides}
            onSave={handleSave}
            isSaving={upsert.isPending}
          />
        )}
      </div>
    </Stack>
  );
}
