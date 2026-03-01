/**
 * TypeScript types for character sub-resources (PRD-112).
 */

import type { BadgeVariant } from "@/components/primitives";

export interface CharacterSettings {
  [key: string]: unknown;
}

export interface CharacterMetadata {
  [key: string]: unknown;
}

/**
 * A single field from a metadata template (mirrors backend MetadataTemplateField).
 *
 * CANONICAL definition -- import from here, never redefine.
 * Also re-exported by: settings/hooks/use-metadata-templates, character-ingest/types.
 */
export interface MetadataTemplateField {
  id: number;
  template_id: number;
  field_name: string;
  field_type: string;
  is_required: boolean;
  constraints: Record<string, unknown>;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** A grouped section of metadata fields for the sectioned form. */
export interface MetadataSection {
  key: string;
  label: string;
  fields: MetadataTemplateField[];
}

/** Response from the active template endpoint. */
export interface ActiveTemplateResponse {
  template_name: string;
  fields: MetadataTemplateField[];
}

/**
 * Group template fields into display sections based on sort_order ranges.
 *
 * NOTE: The backend `category_from_sort_order()` in `character_metadata.rs`
 * maps the same ranges to different labels (Biographical, Physical,
 * Preferences, Production) for completeness calculation. Keep in sync
 * if the sort_order ranges change.
 */
export function groupFieldsIntoSections(fields: MetadataTemplateField[]): MetadataSection[] {
  const sections: Record<string, MetadataSection> = {};
  const order: string[] = [];

  for (const field of fields) {
    let key: string;
    let label: string;

    if (field.sort_order < 100) {
      key = "biographical";
      label = "Biographical";
    } else if (field.sort_order < 200) {
      key = "appearance";
      label = "Appearance";
    } else if (field.sort_order < 300) {
      key = "favorites";
      label = "Favorites";
    } else if (field.sort_order < 400) {
      key = "sexual_preferences";
      label = "Sexual Preferences";
    } else {
      key = "optional";
      label = "Optional";
    }

    let section = sections[key];
    if (!section) {
      section = { key, label, fields: [] };
      sections[key] = section;
      order.push(key);
    }
    section.fields.push(field);
  }

  return order.map((k) => sections[k]).filter(Boolean) as MetadataSection[];
}

/** Badge variant for a metadata completeness percentage. */
export function completenessVariant(pct: number): BadgeVariant {
  if (pct === 100) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}
