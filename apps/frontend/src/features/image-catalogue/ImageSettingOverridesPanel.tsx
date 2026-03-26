/**
 * Shared overrides panel for image settings at group and avatar level (PRD-154).
 *
 * Terminal-style dark table with toggle, source label, reset actions,
 * and a "Reset All" modal. Mirrors SceneSettingOverridesPanel.
 */

import { useCallback, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { GHOST_DANGER_BTN, TERMINAL_DIVIDER, TERMINAL_TH } from "@/lib/ui-classes";

import { ImageSettingRow } from "./ImageSettingRow";
import type { EffectiveImageSetting, ImageSettingUpdate } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImageSettingOverridesPanelProps {
  settings: EffectiveImageSetting[] | undefined;
  isLoading: boolean;
  sourceName: EffectiveImageSetting["source"];
  entityLabel: string;
  toggleMutation: UseMutationResult<unknown, unknown, ImageSettingUpdate>;
  removeMutation: UseMutationResult<unknown, unknown, { imageTypeId: number; trackId: number | null }>;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImageSettingOverridesPanel({
  settings,
  isLoading,
  sourceName,
  entityLabel,
  toggleMutation,
  removeMutation,
}: ImageSettingOverridesPanelProps) {
  const [showResetAll, setShowResetAll] = useState(false);

  const hasOverrides = settings?.some((s) => s.source === sourceName);

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

  const handleReset = useCallback(
    (imageTypeId: number, trackId: number | null) => {
      removeMutation.mutate({ imageTypeId, trackId });
    },
    [removeMutation],
  );

  const handleResetAll = useCallback(() => {
    if (!settings) return;

    const overrides = settings.filter((s) => s.source === sourceName);
    for (const override of overrides) {
      removeMutation.mutate({ imageTypeId: override.image_type_id, trackId: override.track_id });
    }
    setShowResetAll(false);
  }, [settings, sourceName, removeMutation]);

  if (isLoading) {
    return <LoadingPane />;
  }

  const isPending = toggleMutation.isPending || removeMutation.isPending;

  return (
    <Stack gap={3}>
      {hasOverrides && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowResetAll(true)}
            className={GHOST_DANGER_BTN}
          >
            Reset All Overrides
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Image Type</th>
              <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Enabled</th>
              <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Source</th>
              <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!settings || settings.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-xs font-mono text-[var(--color-text-muted)]"
                >
                  No image settings available.
                </td>
              </tr>
            ) : (
              settings.map((row) => (
                <ImageSettingRow
                  key={`${row.image_type_id}-${row.track_id ?? "none"}`}
                  row={row}
                  onToggle={handleToggle}
                  isPending={isPending}
                  actions={
                    row.source === sourceName ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleReset(row.image_type_id, row.track_id)}
                        disabled={isPending}
                        className={GHOST_DANGER_BTN}
                      >
                        Reset
                      </Button>
                    ) : undefined
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reset all confirmation */}
      <Modal
        open={showResetAll}
        onClose={() => setShowResetAll(false)}
        title={`Reset All ${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} Overrides`}
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-xs font-mono text-[var(--color-text-muted)]">
            This will remove all {entityLabel}-level image setting overrides. Settings will fall
            back to project and catalogue defaults.
          </p>
          <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
            <Button variant="secondary" size="sm" onClick={() => setShowResetAll(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleResetAll}
              loading={removeMutation.isPending}
            >
              Reset All
            </Button>
          </div>
        </Stack>
      </Modal>
    </Stack>
  );
}
