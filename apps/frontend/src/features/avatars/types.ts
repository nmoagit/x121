/**
 * TypeScript types for avatar sub-resources (PRD-112).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Pipeline settings key constants
   -------------------------------------------------------------------------- */

/** Settings JSONB key for the ElevenLabs VoiceID. */
export const SETTING_KEY_VOICE = "elevenlabs_voice";

/** Check whether a avatar's settings contain a non-empty VoiceID. */
export function hasVoiceId(settings: Record<string, unknown> | null | undefined): boolean {
  if (!settings) return false;
  const voice = settings[SETTING_KEY_VOICE];
  return typeof voice === "string" && voice.length > 0;
}

/**
 * Extract the VoiceID string from avatar settings, or null if missing.
 */
export function getVoiceId(settings: Record<string, unknown> | null | undefined): string | null {
  if (!settings) return null;
  const voice = settings[SETTING_KEY_VOICE];
  return typeof voice === "string" && voice.length > 0 ? voice : null;
}

/* --------------------------------------------------------------------------
   Metadata source key constants
   -------------------------------------------------------------------------- */

/** Reserved metadata key for the raw bio.json source object. */
export const SOURCE_KEY_BIO = "_source_bio";

/** Reserved metadata key for the raw tov.json source object. */
export const SOURCE_KEY_TOV = "_source_tov";

/** Set of all reserved source keys (excluded from form rendering). */
export const SOURCE_KEYS = new Set([SOURCE_KEY_BIO, SOURCE_KEY_TOV]);

/* --------------------------------------------------------------------------
   Interfaces
   -------------------------------------------------------------------------- */

export interface AvatarSettings {
  [key: string]: unknown;
}

export interface AvatarMetadata {
  [key: string]: unknown;
}

/**
 * A single field from a metadata template (mirrors backend MetadataTemplateField).
 *
 * CANONICAL definition -- import from here, never redefine.
 * Also re-exported by: settings/hooks/use-metadata-templates, avatar-ingest/types.
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
 * NOTE: The backend `category_from_sort_order()` in `avatar_metadata.rs`
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

/* --------------------------------------------------------------------------
   Metadata versioning types
   -------------------------------------------------------------------------- */

/** A versioned metadata snapshot. */
export interface MetadataVersion {
  id: number;
  avatar_id: number;
  version_number: number;
  metadata: Record<string, unknown>;
  source: "manual" | "generated" | "csv_import" | "json_import" | "llm_refined";
  source_bio: Record<string, unknown> | null;
  source_tov: Record<string, unknown> | null;
  generation_report: GenerationReport | null;
  is_active: boolean;
  approval_status: "pending" | "approved" | "rejected";
  approved_by: number | null;
  approved_at: string | null;
  approval_comment: string | null;
  notes: string | null;
  rejection_reason: string | null;
  outdated_at: string | null;
  outdated_reason: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Map metadata approval_status to Badge variant. */
export function metadataApprovalBadgeVariant(
  status: MetadataVersion["approval_status"],
): BadgeVariant {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "pending":
    default:
      return "warning";
  }
}

/** Human-readable labels for metadata approval statuses. */
export const METADATA_APPROVAL_LABEL: Record<
  MetadataVersion["approval_status"],
  string
> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

/** Report from the metadata generation engine. */
export interface GenerationReport {
  field_count: number;
  missing: MissingField[];
  warnings: string[];
  errors: string[];
}

/** A field that was expected but missing. */
export interface MissingField {
  field: string;
  category: string;
}

/* --------------------------------------------------------------------------
   Speech & TTS types (PRD-124)
   -------------------------------------------------------------------------- */

export interface SpeechType {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface AvatarSpeech {
  id: number;
  avatar_id: number;
  speech_type_id: number;
  language_id: number;
  status_id: number;
  sort_order: number;
  version: number;
  text: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ImportSpeechesResponse {
  imported: number;
  created_types: string[];
  errors: string[];
}

/* --------------------------------------------------------------------------
   LLM Refinement types (PRD-125)
   -------------------------------------------------------------------------- */

export interface RefinementJob {
  id: number;
  uuid: string;
  avatar_id: number;
  status: "queued" | "running" | "completed" | "failed";
  source_bio: Record<string, unknown> | null;
  source_tov: Record<string, unknown> | null;
  llm_provider: string;
  llm_model: string;
  enrich: boolean;
  iterations: unknown[];
  final_metadata: Record<string, unknown> | null;
  final_report: RefinementReport | null;
  error: string | null;
  metadata_version_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RefinementReport {
  changes: FieldChange[];
  iterations_count: number;
  warnings: string[];
  enriched_field_count: number;
}

export interface FieldChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
  change_type: "added" | "modified" | "removed" | "enriched";
  source: "formatted" | "normalized" | "enriched" | "script_corrected";
}

/** Badge variant for a metadata completeness percentage. */
export function completenessVariant(pct: number): BadgeVariant {
  if (pct === 100) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}

/* --------------------------------------------------------------------------
   Language & multilingual speech types (PRD-136)
   -------------------------------------------------------------------------- */

export interface Language {
  id: number;
  code: string;
  name: string;
  flag_code: string;
  created_at: string;
}

export const SPEECH_STATUS_DRAFT = 1;
export const SPEECH_STATUS_APPROVED = 2;
export const SPEECH_STATUS_REJECTED = 3;

export interface ProjectSpeechConfigEntry {
  id?: number;
  project_id?: number;
  speech_type_id: number;
  language_id: number;
  min_variants: number;
}

export interface CompletenessSummary {
  total_slots: number;
  filled_slots: number;
  completeness_pct: number;
  breakdown: CompletenessEntry[];
}

export interface CompletenessEntry {
  speech_type_id: number;
  speech_type_name: string;
  language_id: number;
  language_code: string;
  required: number;
  approved: number;
  status: "complete" | "partial" | "not_started";
}

export interface SpeechDeliverable {
  avatar_id: number;
  avatar_slug: string;
  avatar_name: string;
  voice_id: string | null;
  generated_at: string;
  languages: string[];
  speech: Record<string, Record<string, string[]>>;
}

export interface BulkImportReport {
  imported: number;
  skipped: number;
  errors: string[];
  avatars_matched: string[];
  avatars_unmatched: string[];
}
