/**
 * DashboardCustomizationPage -- main container for the customizable
 * dashboard experience (PRD-89).
 *
 * Coordinates all sub-components (LayoutEditor, WidgetCatalog,
 * WidgetSettingsPanel, PresetManager, EditModeControls).
 */

import { Spinner } from "@/components/primitives";

import { useDashboardEditor } from "./hooks/use-dashboard-editor";
import { EditModeControls } from "./EditModeControls";
import { LayoutEditor } from "./LayoutEditor";
import { PresetManager } from "./PresetManager";
import { WidgetCatalog } from "./WidgetCatalog";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DashboardCustomizationPage() {
  const editor = useDashboardEditor();

  if (editor.dashLoading) {
    return (
      <div
        data-testid="dashboard-loading"
        className="flex items-center justify-center p-12"
      >
        <Spinner />
      </div>
    );
  }

  return (
    <div data-testid="dashboard-customization-page" className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Dashboard
        </h1>
        <div className="flex items-center gap-3">
          <PresetManager
            presets={editor.presets}
            onActivate={editor.activatePreset}
            onDelete={editor.deletePreset}
            onCreate={editor.createPreset}
            onShare={editor.sharePreset}
            onImport={editor.importPreset}
            isImporting={editor.isImporting}
          />
          <EditModeControls
            isEditing={editor.isEditing}
            onToggleEdit={editor.handleToggleEdit}
            onAddWidget={() => editor.setCatalogOpen(true)}
            onSave={editor.handleSave}
            onCancel={editor.handleCancel}
            isSaving={editor.isSaving}
          />
        </div>
      </div>

      {/* Grid layout */}
      <LayoutEditor
        layout={editor.activeLayout}
        widgetMap={editor.widgetMap}
        isEditing={editor.isEditing}
        onRemoveWidget={editor.handleRemoveWidget}
        onOpenSettings={editor.setSettingsInstanceId}
      />

      {/* Widget catalog drawer */}
      <WidgetCatalog
        open={editor.catalogOpen}
        onClose={() => editor.setCatalogOpen(false)}
        widgets={editor.catalog}
        onAddWidget={editor.handleAddWidget}
      />

      {/* Widget settings drawer */}
      <WidgetSettingsPanel
        open={editor.settingsInstanceId !== null}
        onClose={() => editor.setSettingsInstanceId(null)}
        widget={editor.settingsWidget}
        instanceId={editor.settingsInstanceId}
        currentSettings={
          editor.settingsInstanceId
            ? (editor.activeSettings[editor.settingsInstanceId] ?? {})
            : {}
        }
        onSave={editor.handleSaveWidgetSettings}
      />
    </div>
  );
}
