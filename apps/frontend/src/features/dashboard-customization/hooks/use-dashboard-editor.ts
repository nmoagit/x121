/**
 * useDashboardEditor -- local state management for dashboard edit mode (PRD-89).
 *
 * Coordinates layout changes, widget additions/removals, and settings
 * updates during edit mode.
 */

import { useCallback, useMemo, useState } from "react";

import {
  useActivatePreset,
  useCreatePreset,
  useDashboard,
  useDeletePreset,
  useImportPreset,
  usePresets,
  useSaveDashboard,
  useSharePreset,
  useWidgetCatalogue,
} from "./use-dashboard-customization";
import type { LayoutItem, WidgetDefinition } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Generate a unique instance ID for a new widget placement. */
function generateInstanceId(widgetId: string): string {
  return `${widgetId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useDashboardEditor() {
  /* -- Remote data -------------------------------------------------------- */
  const { data: dashboard, isLoading: dashLoading } = useDashboard();
  const { data: presets = [] } = usePresets();
  const { data: catalogue = [] } = useWidgetCatalogue();

  /* -- Mutations ---------------------------------------------------------- */
  const saveDashboard = useSaveDashboard();
  const createPreset = useCreatePreset();
  const deletePreset = useDeletePreset();
  const activatePreset = useActivatePreset();
  const sharePreset = useSharePreset();
  const importPreset = useImportPreset();

  /* -- Local edit state --------------------------------------------------- */
  const [isEditing, setIsEditing] = useState(false);
  const [editLayout, setEditLayout] = useState<LayoutItem[]>([]);
  const [editSettings, setEditSettings] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(
    null,
  );

  /* -- Derived ------------------------------------------------------------ */
  const activeLayout = isEditing ? editLayout : (dashboard?.layout ?? []);
  const activeSettings = isEditing
    ? editSettings
    : (dashboard?.widget_settings ?? {});

  const widgetMap = useMemo(() => {
    const map = new Map<string, WidgetDefinition>();
    for (const w of catalogue) {
      map.set(w.id, w);
    }
    return map;
  }, [catalogue]);

  const settingsWidget = settingsInstanceId
    ? widgetMap.get(
        activeLayout.find((i) => i.instance_id === settingsInstanceId)
          ?.widget_id ?? "",
      ) ?? null
    : null;

  /* -- Handlers ----------------------------------------------------------- */

  const handleToggleEdit = useCallback(() => {
    if (!isEditing) {
      setEditLayout(dashboard?.layout ?? []);
      setEditSettings(dashboard?.widget_settings ?? {});
    }
    setIsEditing((prev) => !prev);
  }, [isEditing, dashboard]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditLayout([]);
    setEditSettings({});
  }, []);

  const handleSave = useCallback(() => {
    saveDashboard.mutate(
      {
        name: "My Dashboard",
        layout_json: editLayout,
        widget_settings_json: editSettings,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }, [saveDashboard, editLayout, editSettings]);

  const handleAddWidget = useCallback((widget: WidgetDefinition) => {
    const instanceId = generateInstanceId(widget.id);
    const newItem: LayoutItem = {
      widget_id: widget.id,
      instance_id: instanceId,
      x: 0,
      y: 0,
      w: widget.default_width,
      h: widget.default_height,
    };
    setEditLayout((prev) => [...prev, newItem]);
    setCatalogOpen(false);
  }, []);

  const handleRemoveWidget = useCallback((instanceId: string) => {
    setEditLayout((prev) => prev.filter((i) => i.instance_id !== instanceId));
    setEditSettings((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }, []);

  const handleSaveWidgetSettings = useCallback(
    (instanceId: string, settings: Record<string, unknown>) => {
      setEditSettings((prev) => ({ ...prev, [instanceId]: settings }));
    },
    [],
  );

  return {
    /* State */
    dashLoading,
    isEditing,
    activeLayout,
    activeSettings,
    widgetMap,
    catalogue,
    presets,
    catalogOpen,
    settingsInstanceId,
    settingsWidget,
    isSaving: saveDashboard.isPending,
    isImporting: importPreset.isPending,

    /* Actions */
    setCatalogOpen,
    setSettingsInstanceId,
    handleToggleEdit,
    handleCancel,
    handleSave,
    handleAddWidget,
    handleRemoveWidget,
    handleSaveWidgetSettings,
    activatePreset: (id: number) => activatePreset.mutate(id),
    deletePreset: (id: number) => deletePreset.mutate(id),
    createPreset: (name: string) =>
      createPreset.mutate({
        name,
        layout_json: activeLayout,
        widget_settings_json: activeSettings,
      }),
    sharePreset: (id: number) => sharePreset.mutate(id),
    importPreset: (token: string) => importPreset.mutate(token),
  };
}
