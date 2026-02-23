/**
 * Character Readiness & State View types (PRD-107).
 */

/* --------------------------------------------------------------------------
   Readiness state union
   -------------------------------------------------------------------------- */

/** Possible readiness states for a character. */
export type ReadinessState = "ready" | "partially_ready" | "not_started";

/** Scope type for readiness criteria. */
export type CriteriaScopeType = "studio" | "project";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A readiness criteria record from the server. */
export interface ReadinessCriteria {
  id: number;
  scope_type: CriteriaScopeType;
  scope_id: number | null;
  criteria_json: CriteriaJson;
  created_at: string;
  updated_at: string;
}

/** The criteria_json structure inside a readiness criteria record. */
export interface CriteriaJson {
  required_fields: {
    source_image?: boolean;
    approved_variant?: boolean;
    metadata_complete?: boolean;
    settings?: string[];
  };
}

/** A cached readiness result for a character. */
export interface CharacterReadinessCache {
  character_id: number;
  state: ReadinessState;
  missing_items: string[];
  readiness_pct: number;
  computed_at: string;
}

/** Readiness summary statistics for a project or library. */
export interface ReadinessSummary {
  total: number;
  ready: number;
  partially_ready: number;
  not_started: number;
}

/** A missing item tag label. */
export type MissingItem = string;

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating readiness criteria. */
export interface CreateReadinessCriteria {
  scope_type: CriteriaScopeType;
  scope_id?: number | null;
  criteria_json: CriteriaJson;
}

/** Request body for updating readiness criteria. */
export interface UpdateReadinessCriteria {
  criteria_json?: CriteriaJson;
}

/** Request body for batch evaluation. */
export interface BatchEvaluateRequest {
  character_ids: number[];
}
