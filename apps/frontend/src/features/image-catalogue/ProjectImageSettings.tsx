/**
 * Project-level image settings panel (PRD-154).
 *
 * Shows image types with enable/disable toggles for a project.
 */

import { useCallback } from "react";

import { LoadingPane } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_PANEL,
  TERMINAL_TH,
} from "@/lib/ui-classes";

import { ImageSettingRow } from "./ImageSettingRow";
import {
  useProjectImageSettings,
  useToggleProjectImageSetting,
} from "./hooks/use-project-image-settings";
import { TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectImageSettingsProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ProjectImageSettings({ projectId }: ProjectImageSettingsProps) {
  const { data: settings, isLoading } = useProjectImageSettings(projectId);
  const toggleMutation = useToggleProjectImageSetting(projectId);

  const handleToggle = useCallback(
    (imageTypeId: number, trackId: number | null, enabled: boolean) => {
      toggleMutation.mutate({
        image_type_id: imageTypeId,
        track_id: trackId,
        is_enabled: enabled,
      });
    },
    [toggleMutation],
  );

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_BODY}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={TERMINAL_DIVIDER}>
                <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Image Type</th>
                <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Enabled</th>
                <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Source</th>
              </tr>
            </thead>
            <tbody>
              {!settings || settings.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className={`px-3 py-6 text-center ${TYPO_DATA_MUTED}`}
                  >
                    No image settings available. Add image types to the catalogue first.
                  </td>
                </tr>
              ) : (
                settings.map((row) => (
                  <ImageSettingRow
                    key={`${row.image_type_id}-${row.track_id ?? "none"}`}
                    row={row}
                    onToggle={handleToggle}
                    isPending={toggleMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
