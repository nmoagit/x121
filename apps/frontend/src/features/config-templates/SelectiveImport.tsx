/**
 * SelectiveImport -- checkbox-based scene type selection for import (PRD-74).
 *
 * Allows users to select which scene types to import from a config template,
 * with select-all/deselect-all controls.
 */

import { useState } from "react";

import { Button, Card, CardBody, CardHeader } from "@/components";

import { useImportConfig } from "./hooks/use-config-templates";
import type { ProjectConfig } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Extract scene type names from a config's JSON. */
function getSceneTypeNames(config: ProjectConfig): string[] {
  const sceneTypes = config.config_json?.scene_types;
  if (!Array.isArray(sceneTypes)) return [];
  return sceneTypes
    .map((st: Record<string, unknown>) => st?.name)
    .filter((n): n is string => typeof n === "string");
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SelectiveImportProps {
  config: ProjectConfig;
  projectId: number;
  onComplete?: () => void;
  onCancel?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SelectiveImport({
  config,
  projectId,
  onComplete,
  onCancel,
}: SelectiveImportProps) {
  const sceneTypeNames = getSceneTypeNames(config);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(sceneTypeNames),
  );

  const importConfig = useImportConfig();

  const allSelected = selected.size === sceneTypeNames.length;
  const noneSelected = selected.size === 0;

  const handleToggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelected(new Set(sceneTypeNames));
  };

  const handleDeselectAll = () => {
    setSelected(new Set());
  };

  const handleImport = () => {
    const selectedArray = Array.from(selected);
    importConfig.mutate(
      {
        config_id: config.id,
        project_id: projectId,
        selected_scene_types:
          selectedArray.length === sceneTypeNames.length
            ? undefined
            : selectedArray,
      },
      {
        onSuccess: () => {
          onComplete?.();
        },
      },
    );
  };

  return (
    <div data-testid="selective-import" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
              Select Scene Types to Import
            </h3>
            <div className="flex gap-2">
              <Button
                data-testid="select-all-btn"
                onClick={handleSelectAll}
                disabled={allSelected}
              >
                Select All
              </Button>
              <Button
                data-testid="deselect-all-btn"
                onClick={handleDeselectAll}
                disabled={noneSelected}
              >
                Deselect All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {sceneTypeNames.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No scene types found in this template.
            </p>
          )}

          <div className="space-y-2">
            {sceneTypeNames.map((name) => (
              <label
                key={name}
                data-testid={`scene-type-checkbox-${name}`}
                className="flex cursor-pointer items-center gap-3 rounded border border-[var(--color-border)] p-3 hover:bg-[var(--color-bg-secondary)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(name)}
                  onChange={() => handleToggle(name)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  {name}
                </span>
              </label>
            ))}
          </div>

          {sceneTypeNames.length > 0 && (
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              Dependencies for selected scene types will be auto-included.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button data-testid="import-cancel-btn" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          data-testid="import-btn"
          onClick={handleImport}
          disabled={noneSelected || importConfig.isPending}
        >
          {importConfig.isPending
            ? "Importing..."
            : `Import ${selected.size} Scene Type${selected.size !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
