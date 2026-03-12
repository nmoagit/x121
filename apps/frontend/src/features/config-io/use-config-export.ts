/**
 * Hooks for exporting configuration from each settings page.
 *
 * Each hook gathers data via API calls and triggers a JSON download.
 */

import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import {
  createEnvelope,
  downloadConfig,
  safeFilename,
  type ConfigEnvelope,
} from "@/lib/config-io";

/* --------------------------------------------------------------------------
   Shared state type
   -------------------------------------------------------------------------- */

interface ExportState {
  exporting: boolean;
  error: string | null;
}

/* --------------------------------------------------------------------------
   Scene Catalogue export
   -------------------------------------------------------------------------- */

export function useExportSceneCatalogue() {
  const [state, setState] = useState<ExportState>({ exporting: false, error: null });

  const exportConfig = useCallback(async () => {
    setState({ exporting: true, error: null });
    try {
      const [sceneTypes, catalogWithTracks, tracks] = await Promise.all([
        api.get<{ id: number; name: string }[]>("/scene-types"),
        api.get<unknown[]>("/scene-types/with-tracks"),
        api.get<unknown[]>("/tracks"),
      ]);

      // Fetch track configs and prompt defaults per scene type
      const sceneTypeIds = sceneTypes.map((st) => st.id);
      const [trackConfigs, promptDefaults] = await Promise.all([
        Promise.all(sceneTypeIds.map((id) => api.get(`/scene-types/${id}/track-configs`))),
        Promise.all(sceneTypeIds.map((id) => api.get(`/scene-types/${id}/prompt-defaults`))),
      ]);

      const envelope = createEnvelope("scene-catalogue", "Scene Catalogue", {
        scene_types: sceneTypes,
        catalog_entries: catalogWithTracks,
        tracks,
        track_configs: sceneTypes.map((st, i) => ({
          scene_type_id: st.id,
          scene_type_name: st.name,
          configs: trackConfigs[i],
        })),
        prompt_defaults: sceneTypes.map((st, i) => ({
          scene_type_id: st.id,
          scene_type_name: st.name,
          defaults: promptDefaults[i],
        })),
      });

      downloadConfig(envelope, "scene-catalogue.json");
      setState({ exporting: false, error: null });
    } catch (err) {
      setState({ exporting: false, error: err instanceof Error ? err.message : "Export failed" });
    }
  }, []);

  return { ...state, exportConfig };
}

/* --------------------------------------------------------------------------
   Workflow export (single workflow)
   -------------------------------------------------------------------------- */

export function useExportWorkflow() {
  const [state, setState] = useState<ExportState>({ exporting: false, error: null });

  const exportConfig = useCallback(async (workflowId: number, workflowName: string) => {
    setState({ exporting: true, error: null });
    try {
      const [workflow, promptSlots] = await Promise.all([
        api.get(`/workflows/${workflowId}`),
        api.get(`/workflows/${workflowId}/prompt-slots`),
      ]);

      const envelope = createEnvelope("workflow", workflowName, {
        workflow,
        prompt_slots: promptSlots,
      });

      downloadConfig(envelope, `workflow-${safeFilename(workflowName)}.json`);
      setState({ exporting: false, error: null });
    } catch (err) {
      setState({ exporting: false, error: err instanceof Error ? err.message : "Export failed" });
    }
  }, []);

  return { ...state, exportConfig };
}

/* --------------------------------------------------------------------------
   Project Settings export
   -------------------------------------------------------------------------- */

export function useExportProjectSettings() {
  const [state, setState] = useState<ExportState>({ exporting: false, error: null });

  const exportConfig = useCallback(async (projectId: number, projectName: string) => {
    setState({ exporting: true, error: null });
    try {
      const [sceneSettings, sceneTypes] = await Promise.all([
        api.get(`/projects/${projectId}/scene-settings`),
        api.get<{ id: number; name: string }[]>("/scene-types"),
      ]);

      // Fetch prompt overrides per scene type
      const promptOverrides = await Promise.all(
        sceneTypes.map((st) =>
          api.get(`/projects/${projectId}/scenes/${st.id}/prompt-overrides`).catch(() => []),
        ),
      );

      const envelope = createEnvelope("project-settings", projectName, {
        project_id: projectId,
        project_name: projectName,
        scene_settings: sceneSettings,
        prompt_overrides: sceneTypes.map((st, i) => ({
          scene_type_id: st.id,
          scene_type_name: st.name,
          overrides: promptOverrides[i],
        })),
      });

      downloadConfig(envelope, `project-settings-${safeFilename(projectName)}.json`);
      setState({ exporting: false, error: null });
    } catch (err) {
      setState({ exporting: false, error: err instanceof Error ? err.message : "Export failed" });
    }
  }, []);

  return { ...state, exportConfig };
}

/* --------------------------------------------------------------------------
   Group Settings export
   -------------------------------------------------------------------------- */

export function useExportGroupSettings() {
  const [state, setState] = useState<ExportState>({ exporting: false, error: null });

  const exportConfig = useCallback(
    async (projectId: number, groupId: number, groupName: string) => {
      setState({ exporting: true, error: null });
      try {
        const [sceneSettings, sceneTypes] = await Promise.all([
          api.get(`/projects/${projectId}/groups/${groupId}/scene-settings`),
          api.get<{ id: number; name: string }[]>("/scene-types"),
        ]);

        const promptOverrides = await Promise.all(
          sceneTypes.map((st) =>
            api
              .get(`/projects/${projectId}/groups/${groupId}/scenes/${st.id}/prompt-overrides`)
              .catch(() => []),
          ),
        );

        const envelope = createEnvelope("group-settings", groupName, {
          project_id: projectId,
          group_id: groupId,
          group_name: groupName,
          scene_settings: sceneSettings,
          prompt_overrides: sceneTypes.map((st, i) => ({
            scene_type_id: st.id,
            scene_type_name: st.name,
            overrides: promptOverrides[i],
          })),
        });

        downloadConfig(envelope, `group-settings-${safeFilename(groupName)}.json`);
        setState({ exporting: false, error: null });
      } catch (err) {
        setState({
          exporting: false,
          error: err instanceof Error ? err.message : "Export failed",
        });
      }
    },
    [],
  );

  return { ...state, exportConfig };
}

/* --------------------------------------------------------------------------
   Character Settings export
   -------------------------------------------------------------------------- */

export function useExportCharacterSettings() {
  const [state, setState] = useState<ExportState>({ exporting: false, error: null });

  const exportConfig = useCallback(
    async (projectId: number, characterId: number, characterName: string) => {
      setState({ exporting: true, error: null });
      try {
        const [pipelineSettings, sceneSettings, sceneTypes] = await Promise.all([
          api.get(`/projects/${projectId}/characters/${characterId}/settings`).catch(() => ({})),
          api.get(`/characters/${characterId}/scene-settings`),
          api.get<{ id: number; name: string }[]>("/scene-types"),
        ]);

        const promptOverrides = await Promise.all(
          sceneTypes.map((st) =>
            api
              .get(`/characters/${characterId}/scenes/${st.id}/prompt-overrides`)
              .catch(() => []),
          ),
        );

        const envelope = createEnvelope("character-settings", characterName, {
          project_id: projectId,
          character_id: characterId,
          character_name: characterName,
          pipeline_settings: pipelineSettings,
          scene_settings: sceneSettings,
          prompt_overrides: sceneTypes.map((st, i) => ({
            scene_type_id: st.id,
            scene_type_name: st.name,
            overrides: promptOverrides[i],
          })),
        });

        downloadConfig(
          envelope,
          `character-settings-${safeFilename(characterName)}.json`,
        );
        setState({ exporting: false, error: null });
      } catch (err) {
        setState({
          exporting: false,
          error: err instanceof Error ? err.message : "Export failed",
        });
      }
    },
    [],
  );

  return { ...state, exportConfig };
}

/* --------------------------------------------------------------------------
   Generic import reader (used by ConfigToolbar onImport callbacks)
   -------------------------------------------------------------------------- */

export function useConfigImport() {
  const [state, setState] = useState<{
    importing: boolean;
    error: string | null;
    imported: ConfigEnvelope | null;
  }>({ importing: false, error: null, imported: null });

  const importFile = useCallback(async (file: File): Promise<ConfigEnvelope | null> => {
    setState({ importing: true, error: null, imported: null });
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ConfigEnvelope;
      if (!parsed.config_type || !parsed.data) {
        throw new Error("Invalid config file: missing config_type or data.");
      }
      setState({ importing: false, error: null, imported: parsed });
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read file";
      setState({ importing: false, error: msg, imported: null });
      return null;
    }
  }, []);

  return { ...state, importFile };
}
