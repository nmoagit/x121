/**
 * Metadata renderer override for extensions (PRD-85).
 *
 * Checks if any enabled extension has registered a custom renderer for a
 * specific metadata field + entity type combination. If so, renders the
 * extension's sandbox. Otherwise, renders the fallback (default renderer).
 */

import { useMemo } from "react";
import type { ReactNode } from "react";

import { ExtensionSandbox } from "./ExtensionSandbox";
import { useExtensionRegistry } from "./hooks/use-extensions";
import type { Extension, MetadataRendererRegistration } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MetadataRendererOverrideProps {
  fieldName: string;
  entityType: string;
  entityId: number;
  value: unknown;
  fallback: ReactNode;
}

interface RendererMatch {
  extension: Extension;
  renderer: MetadataRendererRegistration;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataRendererOverride({
  fieldName,
  entityType,
  entityId,
  value: _value,
  fallback,
}: MetadataRendererOverrideProps) {
  const { data: extensions } = useExtensionRegistry();

  const match = useMemo<RendererMatch | null>(() => {
    if (!extensions) return null;

    for (const ext of extensions) {
      const renderer = ext.manifest_json.metadata_renderers.find(
        (r) =>
          r.field_name === fieldName &&
          r.entity_types.includes(entityType),
      );
      if (renderer) {
        return { extension: ext, renderer };
      }
    }

    return null;
  }, [extensions, fieldName, entityType]);

  // No extension registered for this field -- render the default.
  if (!match) {
    return <>{fallback}</>;
  }

  return (
    <ExtensionSandbox
      extensionId={match.extension.id}
      extensionName={match.extension.name}
      entryPoint={match.extension.source_path}
      permissions={match.extension.manifest_json.permissions}
      settings={match.extension.settings_json}
      context={{
        [`${entityType}Id` as "projectId"]: entityId,
      }}
      className="min-h-[60px]"
    />
  );
}
