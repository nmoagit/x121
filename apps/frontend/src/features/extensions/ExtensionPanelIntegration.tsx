/**
 * Extension panel integration with the layout system (PRD-85).
 *
 * Reads the extension registry and registers each extension panel as a
 * view module in the panel management system (PRD-30). Each panel renders
 * an ExtensionSandbox inside it.
 */

import { Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { AlertCircle } from "@/tokens/icons";
import { useMemo } from "react";

import { ExtensionSandbox } from "./ExtensionSandbox";
import { useExtensionRegistry } from "./hooks/use-extensions";
import type { Extension, PanelRegistration, PlatformContext } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ExtensionPanelIntegrationProps {
  context?: PlatformContext;
}

interface ExtensionPanelEntry {
  extension: Extension;
  panel: PanelRegistration;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ExtensionPanelIntegration({
  context,
}: ExtensionPanelIntegrationProps) {
  const { data: extensions, isLoading, isError } = useExtensionRegistry();

  const panelEntries = useMemo<ExtensionPanelEntry[]>(() => {
    if (!extensions) return [];

    return extensions.flatMap((ext) =>
      ext.manifest_json.panels.map((panel) => ({
        extension: ext,
        panel,
      })),
    );
  }, [extensions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-4",
          "text-[var(--color-text-secondary)]",
        )}
      >
        <AlertCircle
          size={20}
          className="text-[var(--color-action-danger)]"
          aria-hidden="true"
        />
        <p className="text-sm">Failed to load extension panels.</p>
      </div>
    );
  }

  if (panelEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {panelEntries.map((entry) => (
        <ExtensionPanelWrapper
          key={`${entry.extension.id}-${entry.panel.id}`}
          entry={entry}
          context={context}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Panel wrapper
   -------------------------------------------------------------------------- */

interface ExtensionPanelWrapperProps {
  entry: ExtensionPanelEntry;
  context?: PlatformContext;
}

function ExtensionPanelWrapper({ entry, context }: ExtensionPanelWrapperProps) {
  const { extension, panel } = entry;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        "bg-[var(--color-surface-secondary)]",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-md)]",
      )}
      style={{
        width: panel.default_width ? `${panel.default_width}px` : undefined,
        height: panel.default_height ? `${panel.default_height}px` : undefined,
        minHeight: 200,
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          "border-b border-[var(--color-border-default)]",
          "bg-[var(--color-surface-tertiary)]",
        )}
      >
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {panel.title}
        </span>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto truncate">
          {extension.name} v{extension.version}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ExtensionSandbox
          extensionId={extension.id}
          extensionName={extension.name}
          entryPoint={extension.source_path}
          permissions={extension.manifest_json.permissions}
          settings={extension.settings_json}
          context={context}
        />
      </div>
    </div>
  );
}
