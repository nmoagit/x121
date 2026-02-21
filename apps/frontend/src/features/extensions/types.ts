/**
 * Types for the UI Plugin/Extension Architecture (PRD-85).
 */

/* --------------------------------------------------------------------------
   Extension entity
   -------------------------------------------------------------------------- */

export interface Extension {
  id: number;
  name: string;
  version: string;
  author: string | null;
  description: string | null;
  manifest_json: ExtensionManifest;
  settings_json: Record<string, unknown>;
  enabled: boolean;
  source_path: string;
  api_version: string;
  installed_by: number | null;
  installed_at: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Manifest & registrations
   -------------------------------------------------------------------------- */

export interface ExtensionManifest {
  name: string;
  version: string;
  author?: string;
  description?: string;
  api_version: string;
  permissions: Permission[];
  panels: PanelRegistration[];
  menu_items: MenuItemRegistration[];
  metadata_renderers: MetadataRendererRegistration[];
  settings_schema?: Record<string, unknown>;
}

export interface Permission {
  resource: string;
  access: string;
}

export interface PanelRegistration {
  id: string;
  title: string;
  icon?: string;
  default_width?: number;
  default_height?: number;
}

export interface MenuItemRegistration {
  id: string;
  label: string;
  entity_types: string[];
  icon?: string;
}

export interface MetadataRendererRegistration {
  field_name: string;
  entity_types: string[];
}

/* --------------------------------------------------------------------------
   API bridge message protocol
   -------------------------------------------------------------------------- */

export interface ExtensionApiRequest {
  type: "api_request";
  requestId: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  resource: string;
  path?: string;
  body?: unknown;
}

export interface ExtensionApiResponse {
  type: "api_response";
  requestId: string;
  status: number;
  data?: unknown;
  error?: string;
}

/* --------------------------------------------------------------------------
   Sandbox context
   -------------------------------------------------------------------------- */

export interface PlatformContext {
  projectId?: number;
  characterId?: number;
  sceneId?: number;
}
