/**
 * Configuration import/export utilities.
 *
 * Provides a standard envelope format for exporting and importing
 * settings across workflows, scene catalogue, project, group, and
 * character configuration pages.
 */

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type ConfigType =
  | "workflow"
  | "scene-catalogue"
  | "project-settings"
  | "group-settings"
  | "character-settings";

export interface ConfigEnvelope<T = unknown> {
  config_type: ConfigType;
  config_version: number;
  exported_at: string;
  source_name: string;
  data: T;
}

export const CONFIG_TYPE_LABELS: Record<ConfigType, string> = {
  workflow: "Workflow",
  "scene-catalogue": "Scene Catalogue",
  "project-settings": "Project Settings",
  "group-settings": "Group Settings",
  "character-settings": "Character Settings",
};

/* --------------------------------------------------------------------------
   Export (download)
   -------------------------------------------------------------------------- */

/** Trigger a browser download of a config envelope as a formatted JSON file. */
export function downloadConfig(envelope: ConfigEnvelope, filename: string): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build a safe filename from a display name. */
export function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Create a config envelope with common metadata. */
export function createEnvelope<T>(
  type: ConfigType,
  sourceName: string,
  data: T,
): ConfigEnvelope<T> {
  return {
    config_type: type,
    config_version: 1,
    exported_at: new Date().toISOString(),
    source_name: sourceName,
    data,
  };
}

/* --------------------------------------------------------------------------
   Import (read)
   -------------------------------------------------------------------------- */

/** Read and parse a JSON config file. Validates the envelope structure. */
export async function readConfigFile(file: File): Promise<ConfigEnvelope> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed.config_type || !parsed.data) {
    throw new Error(
      "Invalid config file: missing config_type or data field.",
    );
  }

  if (!Object.keys(CONFIG_TYPE_LABELS).includes(parsed.config_type)) {
    throw new Error(`Unknown config type: ${parsed.config_type}`);
  }

  return parsed as ConfigEnvelope;
}

/** Read multiple config files. Returns successfully parsed envelopes and any errors. */
export async function readConfigFiles(
  files: FileList | File[],
): Promise<{ configs: ConfigEnvelope[]; errors: { file: string; error: string }[] }> {
  const configs: ConfigEnvelope[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const file of Array.from(files)) {
    try {
      const config = await readConfigFile(file);
      configs.push(config);
    } catch (err) {
      errors.push({
        file: file.name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { configs, errors };
}
