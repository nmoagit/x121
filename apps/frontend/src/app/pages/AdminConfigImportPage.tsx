/**
 * Admin Config Import page.
 *
 * Accepts multiple config JSON files via drag-and-drop or file picker,
 * identifies each file's type, shows a summary, and allows applying
 * them to the system.
 */

import { useCallback, useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, Tooltip } from "@/components/primitives";
import { Upload, X, CircleCheck, AlertTriangle } from "@/tokens/icons";
import {
  CONFIG_TYPE_LABELS,
  type ConfigEnvelope,
  type ConfigType,
} from "@/lib/config-io";
import { api } from "@/lib/api";
import { TYPO_INPUT_LABEL, TYPO_CAPTION} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LoadedConfig {
  envelope: ConfigEnvelope;
  filename: string;
  status: "pending" | "applying" | "applied" | "error";
  error?: string;
}

/* --------------------------------------------------------------------------
   Apply logic per config type
   -------------------------------------------------------------------------- */

async function applyConfig(envelope: ConfigEnvelope): Promise<void> {
  const { config_type, data } = envelope;
  const d = data as Record<string, unknown>;

  switch (config_type) {
    case "workflow": {
      const wf = d.workflow as Record<string, unknown>;
      await api.post("/workflows/import", {
        name: wf.name,
        description: wf.description,
        json_content: wf.json_content,
        source_filename: `import-${envelope.source_name}.json`,
      });
      break;
    }

    case "scene-catalogue": {
      // Apply scene types
      const sceneTypes = (d.scene_types ?? []) as Record<string, unknown>[];
      for (const st of sceneTypes) {
        await api.post("/scene-types", {
          name: st.name,
          slug: st.slug,
          description: st.description,
          is_active: st.is_active,
          sort_order: st.sort_order,
          generation_strategy: st.generation_strategy,
          target_duration_secs: st.target_duration_secs,
          segment_duration_secs: st.segment_duration_secs,
          duration_tolerance_secs: st.duration_tolerance_secs,
          prompt_template: st.prompt_template,
          negative_prompt_template: st.negative_prompt_template,
          auto_retry_enabled: st.auto_retry_enabled,
          auto_retry_max_attempts: st.auto_retry_max_attempts,
        }).catch(() => {
          // Scene type may already exist by name — skip
        });
      }

      // Apply tracks
      const tracks = (d.tracks ?? []) as Record<string, unknown>[];
      for (const track of tracks) {
        await api.post("/tracks", {
          name: track.name,
          description: track.description,
          sort_order: track.sort_order,
        }).catch(() => {
          // Track may already exist
        });
      }

      // Apply prompt defaults
      const promptDefaults = (d.prompt_defaults ?? []) as {
        scene_type_id: number;
        defaults: { prompt_slot_id: number; prompt_text: string }[];
      }[];
      for (const group of promptDefaults) {
        for (const def of group.defaults ?? []) {
          await api.put(
            `/scene-types/${group.scene_type_id}/prompt-defaults/${def.prompt_slot_id}`,
            { prompt_text: def.prompt_text },
          ).catch(() => {});
        }
      }
      break;
    }

    case "project-settings": {
      const projectId = d.project_id as number;
      // Apply scene settings
      const sceneSettings = (d.scene_settings ?? []) as Record<string, unknown>[];
      if (sceneSettings.length > 0) {
        await api.put(`/projects/${projectId}/scene-settings`, sceneSettings).catch(() => {});
      }

      // Apply prompt overrides
      const promptOverrides = (d.prompt_overrides ?? []) as {
        scene_type_id: number;
        overrides: unknown[];
      }[];
      for (const group of promptOverrides) {
        if ((group.overrides ?? []).length > 0) {
          await api.put(
            `/projects/${projectId}/scenes/${group.scene_type_id}/prompt-overrides`,
            { overrides: group.overrides },
          ).catch(() => {});
        }
      }
      break;
    }

    case "group-settings": {
      const projectId = d.project_id as number;
      const groupId = d.group_id as number;

      const sceneSettings = (d.scene_settings ?? []) as Record<string, unknown>[];
      if (sceneSettings.length > 0) {
        await api.put(
          `/projects/${projectId}/groups/${groupId}/scene-settings`,
          sceneSettings,
        ).catch(() => {});
      }

      const promptOverrides = (d.prompt_overrides ?? []) as {
        scene_type_id: number;
        overrides: unknown[];
      }[];
      for (const group of promptOverrides) {
        if ((group.overrides ?? []).length > 0) {
          await api.put(
            `/projects/${projectId}/groups/${groupId}/scenes/${group.scene_type_id}/prompt-overrides`,
            { overrides: group.overrides },
          ).catch(() => {});
        }
      }
      break;
    }

    case "avatar-settings": {
      const projectId = d.project_id as number;
      const avatarId = d.avatar_id as number;

      // Pipeline settings
      const pipelineSettings = d.pipeline_settings as Record<string, unknown> | undefined;
      if (pipelineSettings && Object.keys(pipelineSettings).length > 0) {
        await api.put(
          `/projects/${projectId}/avatars/${avatarId}/settings`,
          pipelineSettings,
        ).catch(() => {});
      }

      // Scene settings
      const sceneSettings = (d.scene_settings ?? []) as Record<string, unknown>[];
      if (sceneSettings.length > 0) {
        await api.put(
          `/avatars/${avatarId}/scene-settings`,
          sceneSettings,
        ).catch(() => {});
      }

      // Prompt overrides
      const promptOverrides = (d.prompt_overrides ?? []) as {
        scene_type_id: number;
        overrides: unknown[];
      }[];
      for (const group of promptOverrides) {
        if ((group.overrides ?? []).length > 0) {
          await api.put(
            `/avatars/${avatarId}/scenes/${group.scene_type_id}/prompt-overrides`,
            { overrides: group.overrides },
          ).catch(() => {});
        }
      }
      break;
    }
  }
}

/* --------------------------------------------------------------------------
   Recommended import order
   -------------------------------------------------------------------------- */

const TYPE_ORDER: ConfigType[] = [
  "scene-catalogue",
  "workflow",
  "project-settings",
  "group-settings",
  "avatar-settings",
];

function sortByTypeOrder(configs: LoadedConfig[]): LoadedConfig[] {
  return [...configs].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.envelope.config_type) -
      TYPE_ORDER.indexOf(b.envelope.config_type),
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AdminConfigImportPage() {
  const [configs, setConfigs] = useState<LoadedConfig[]>([]);
  const [loadErrors, setLoadErrors] = useState<{ file: string; error: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleFilesFixed = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const results: LoadedConfig[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of fileArray) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as ConfigEnvelope;
        if (!parsed.config_type || !parsed.data) {
          throw new Error("Invalid config file");
        }
        results.push({ envelope: parsed, filename: file.name, status: "pending" });
      } catch (err) {
        errors.push({
          file: file.name,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setConfigs((prev) => [...prev, ...results]);
    if (errors.length > 0) setLoadErrors((prev) => [...prev, ...errors]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) handleFilesFixed(e.dataTransfer.files);
    },
    [handleFilesFixed],
  );

  const handleBrowse = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesFixed(e.target.files);
        e.target.value = "";
      }
    },
    [handleFilesFixed],
  );

  const removeConfig = useCallback((index: number) => {
    setConfigs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAll = useCallback(() => {
    setConfigs([]);
    setLoadErrors([]);
  }, []);

  const applyAll = useCallback(async () => {
    setApplying(true);
    const sorted = sortByTypeOrder(configs);

    for (const original of sorted) {
      const origIdx = configs.indexOf(original);

      setConfigs((prev) =>
        prev.map((c, idx) => (idx === origIdx ? { ...c, status: "applying" } : c)),
      );

      try {
        await applyConfig(original.envelope);
        setConfigs((prev) =>
          prev.map((c, idx) => (idx === origIdx ? { ...c, status: "applied" } : c)),
        );
      } catch (err) {
        setConfigs((prev) =>
          prev.map((c, idx) =>
            idx === origIdx
              ? { ...c, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : c,
          ),
        );
      }
    }

    setApplying(false);
  }, [configs]);

  const pendingCount = configs.filter((c) => c.status === "pending").length;
  const appliedCount = configs.filter((c) => c.status === "applied").length;
  const errorCount = configs.filter((c) => c.status === "error").length;

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Config Import"
          description="Drop exported config files here to apply settings in bulk."
        />

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-[var(--radius-lg)] border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/5"
              : "border-[var(--color-border-subtle)]"
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Drag & drop config JSON files here, or
          </p>
          <label className="mt-2 inline-block cursor-pointer rounded bg-[var(--color-surface-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]">
            Browse files
            <input
              type="file"
              accept=".json"
              multiple
              onChange={handleBrowse}
              className="hidden"
            />
          </label>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Supports: workflow, scene-catalogue, project-settings, group-settings, model-settings
          </p>
        </div>

        {/* Load errors */}
        {loadErrors.length > 0 && (
          <div className="rounded border border-[var(--color-action-danger)] bg-[var(--color-action-danger)]/5 p-3">
            <p className="text-sm font-medium text-[var(--color-action-danger)] mb-1">
              Failed to load:
            </p>
            {loadErrors.map((err, i) => (
              <p key={i} className={TYPO_CAPTION}>
                {err.file}: {err.error}
              </p>
            ))}
          </div>
        )}

        {/* Loaded configs */}
        {configs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Loaded Configs ({configs.length})
                </h3>
                {appliedCount > 0 && (
                  <Badge variant="success" size="sm">
                    {appliedCount} applied
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="danger" size="sm">
                    {errorCount} failed
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  Clear All
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyAll}
                  loading={applying}
                  disabled={pendingCount === 0}
                >
                  Apply All ({pendingCount})
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded border border-[var(--color-border-default)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)]">
                  <tr className="border-b border-[var(--color-border-default)]">
                    <th className={`px-3 py-1.5 text-left ${TYPO_INPUT_LABEL}`}>
                      File
                    </th>
                    <th className={`px-3 py-1.5 text-left ${TYPO_INPUT_LABEL}`}>
                      Type
                    </th>
                    <th className={`px-3 py-1.5 text-left ${TYPO_INPUT_LABEL}`}>
                      Source
                    </th>
                    <th className={`px-3 py-1.5 text-left ${TYPO_INPUT_LABEL}`}>
                      Exported
                    </th>
                    <th className={`px-3 py-1.5 text-center ${TYPO_INPUT_LABEL}`}>
                      Status
                    </th>
                    <th className="px-3 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {configs.map((cfg, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                    >
                      <td className="px-3 py-1.5 text-xs text-[var(--color-text-primary)]">
                        {cfg.filename}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant="info" size="sm">
                          {CONFIG_TYPE_LABELS[cfg.envelope.config_type] ?? cfg.envelope.config_type}
                        </Badge>
                      </td>
                      <td className={`px-3 py-1.5 ${TYPO_CAPTION}`}>
                        {cfg.envelope.source_name}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
                        {new Date(cfg.envelope.exported_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {cfg.status === "pending" && (
                          <Badge variant="default" size="sm">Pending</Badge>
                        )}
                        {cfg.status === "applying" && (
                          <Badge variant="warning" size="sm">Applying...</Badge>
                        )}
                        {cfg.status === "applied" && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-action-success)]">
                            <CircleCheck size={12} /> Applied
                          </span>
                        )}
                        {cfg.status === "error" && (
                          <Tooltip content={cfg.error ?? "Error"}>
                            <span className="inline-flex items-center gap-1 text-xs text-[var(--color-action-danger)]">
                              <AlertTriangle size={12} /> Error
                            </span>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {cfg.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => removeConfig(i)}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Stack>
    </div>
  );
}
