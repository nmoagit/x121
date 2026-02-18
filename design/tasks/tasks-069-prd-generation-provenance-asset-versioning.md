# Task List: Generation Provenance & Asset Versioning

**PRD Reference:** `design/prds/069-prd-generation-provenance-asset-versioning.md`
**Scope:** Build immutable generation receipts for every segment, asset version tracking, staleness detection after asset updates, targeted re-generation of affected segments, and bidirectional provenance queries.

## Overview

This PRD creates a provenance tracking system that records the exact inputs (source image hash, model version, LoRA version+weight, workflow version, prompt, seed, CFG) used to generate every segment as an immutable receipt. When any generative asset is updated (new LoRA version, new source image), the system detects all segments generated with the old version and flags them as stale. Creators can then target only the affected segments for re-generation instead of re-running everything.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Segment, scene, character entity tables
- PRD-017: Asset registry with versioned models, LoRAs, custom nodes

### What We're Building
1. Generation receipts table (immutable, write-once records)
2. Asset version history columns and service
3. Staleness detection engine (compare receipt versions against current versions)
4. Targeted re-generation queue builder
5. Bidirectional provenance query service
6. Frontend UI for receipts, staleness reports, and re-generation

### Key Design Decisions
1. **Receipts are immutable** — Once a generation receipt is written, it cannot be modified. This ensures provenance integrity.
2. **Content-addressable hashing** — Each receipt includes a hash of all inputs. This enables quick staleness comparison: if the input hash differs from current asset hashes, the segment is stale.
3. **Version columns on existing tables** — Rather than a separate version table per asset type, add `version` and `version_hash` columns to the existing asset/image tables.
4. **Staleness is computed, not stored** — Staleness is determined by comparing receipt hashes against current asset versions in real-time, not by a stored flag that could become inconsistent.

---

## Phase 1: Database Schema

### Task 1.1: Generation Receipts Table
**File:** `migrations/{timestamp}_create_generation_receipts.sql`

Immutable record of all inputs for each generated segment.

```sql
CREATE TABLE generation_receipts (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE ON UPDATE CASCADE,

    -- Input hashes (content-addressable)
    source_image_hash TEXT NOT NULL,
    variant_image_hash TEXT NOT NULL,
    workflow_version TEXT NOT NULL,
    workflow_hash TEXT NOT NULL,

    -- Model/LoRA versions
    model_asset_id BIGINT REFERENCES assets(id) ON DELETE SET NULL ON UPDATE CASCADE,
    model_version TEXT NOT NULL,
    model_hash TEXT NOT NULL,
    lora_configs JSONB NOT NULL DEFAULT '[]',  -- [{asset_id, version, hash, weight}]

    -- Generation parameters
    prompt_text TEXT NOT NULL,
    negative_prompt TEXT,
    cfg_scale FLOAT NOT NULL,
    seed BIGINT NOT NULL,
    resolution_width INTEGER NOT NULL,
    resolution_height INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    sampler TEXT NOT NULL,
    additional_params JSONB NOT NULL DEFAULT '{}',

    -- Combined input hash for quick staleness check
    inputs_hash TEXT NOT NULL,

    -- Timing
    generation_started_at TIMESTAMPTZ NOT NULL,
    generation_completed_at TIMESTAMPTZ,
    generation_duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NO updated_at — receipts are immutable
);

CREATE INDEX idx_generation_receipts_segment_id ON generation_receipts(segment_id);
CREATE INDEX idx_generation_receipts_model_asset_id ON generation_receipts(model_asset_id);
CREATE INDEX idx_generation_receipts_inputs_hash ON generation_receipts(inputs_hash);
CREATE INDEX idx_generation_receipts_source_image_hash ON generation_receipts(source_image_hash);
CREATE INDEX idx_generation_receipts_model_hash ON generation_receipts(model_hash);

-- No updated_at trigger — receipts are immutable
```

**Acceptance Criteria:**
- [ ] Receipt captures all generation inputs: images, model, LoRA, prompt, seed, CFG, resolution
- [ ] `inputs_hash` is a combined hash of all input hashes for quick comparison
- [ ] `lora_configs` JSONB supports multiple LoRAs with per-LoRA weight
- [ ] No `updated_at` column or trigger — receipt is write-once
- [ ] CASCADE delete on segment removal (receipt has no meaning without its segment)
- [ ] Indexes on segment_id, model_asset_id, and all hash columns
- [ ] Migration applies cleanly

### Task 1.2: Asset Version History
**File:** `migrations/{timestamp}_add_asset_version_tracking.sql`

Add version tracking columns to asset-related tables.

```sql
-- Add version tracking to assets table (from PRD-017)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES assets(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_assets_previous_version_id ON assets(previous_version_id);
CREATE INDEX idx_assets_current_version ON assets(name, is_current_version) WHERE is_current_version = true;

-- Track source image versions
ALTER TABLE source_images ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE source_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE source_images ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES source_images(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_source_images_previous_version ON source_images(previous_version_id);

-- Track derived image versions
ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE derived_images ADD COLUMN IF NOT EXISTS previous_version_id BIGINT REFERENCES derived_images(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_derived_images_previous_version ON derived_images(previous_version_id);
```

**Acceptance Criteria:**
- [ ] Assets track current vs. historical versions via `is_current_version`
- [ ] Version chain via `previous_version_id` enables history traversal
- [ ] Source and derived images get version tracking
- [ ] Content hash enables content-addressable comparison
- [ ] Migration applies cleanly (ALTER TABLE is safe for existing data)

---

## Phase 2: Receipt Generation Service

### Task 2.1: Receipt Builder
**File:** `src/provenance/receipt.rs`

Build and persist generation receipts.

```rust
use crate::types::DbId;
use sha2::{Sha256, Digest};

pub struct GenerationInputs {
    pub segment_id: DbId,
    pub source_image_hash: String,
    pub variant_image_hash: String,
    pub workflow_version: String,
    pub workflow_hash: String,
    pub model_asset_id: Option<DbId>,
    pub model_version: String,
    pub model_hash: String,
    pub lora_configs: Vec<LoraConfig>,
    pub prompt_text: String,
    pub negative_prompt: Option<String>,
    pub cfg_scale: f64,
    pub seed: i64,
    pub resolution_width: i32,
    pub resolution_height: i32,
    pub steps: i32,
    pub sampler: String,
    pub additional_params: serde_json::Value,
}

pub fn compute_inputs_hash(inputs: &GenerationInputs) -> String {
    let mut hasher = Sha256::new();
    hasher.update(&inputs.source_image_hash);
    hasher.update(&inputs.variant_image_hash);
    hasher.update(&inputs.workflow_hash);
    hasher.update(&inputs.model_hash);
    for lora in &inputs.lora_configs {
        hasher.update(&lora.hash);
        hasher.update(lora.weight.to_string().as_bytes());
    }
    hasher.update(&inputs.prompt_text);
    hasher.update(inputs.cfg_scale.to_string().as_bytes());
    hasher.update(inputs.seed.to_string().as_bytes());
    format!("{:x}", hasher.finalize())
}

pub async fn create_receipt(
    pool: &PgPool,
    inputs: &GenerationInputs,
    started_at: chrono::DateTime<chrono::Utc>,
) -> Result<DbId, ProvenanceError> {
    let inputs_hash = compute_inputs_hash(inputs);

    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO generation_receipts (
            segment_id, source_image_hash, variant_image_hash,
            workflow_version, workflow_hash,
            model_asset_id, model_version, model_hash, lora_configs,
            prompt_text, negative_prompt, cfg_scale, seed,
            resolution_width, resolution_height, steps, sampler,
            additional_params, inputs_hash, generation_started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id
        "#,
        inputs.segment_id, inputs.source_image_hash, inputs.variant_image_hash,
        inputs.workflow_version, inputs.workflow_hash,
        inputs.model_asset_id, inputs.model_version, inputs.model_hash,
        serde_json::to_value(&inputs.lora_configs).unwrap(),
        inputs.prompt_text, inputs.negative_prompt, inputs.cfg_scale, inputs.seed,
        inputs.resolution_width, inputs.resolution_height, inputs.steps, inputs.sampler,
        inputs.additional_params, inputs_hash, started_at
    )
    .fetch_one(pool)
    .await?;

    Ok(id)
}
```

**Acceptance Criteria:**
- [ ] Computes combined inputs_hash from all input hashes
- [ ] Writes immutable receipt to database
- [ ] All generation parameters captured
- [ ] LoRA configs stored as JSONB array
- [ ] Returns receipt ID

### Task 2.2: Receipt Completion
**File:** `src/provenance/receipt.rs`

Mark receipt with completion timing after generation finishes.

```rust
pub async fn complete_receipt(
    pool: &PgPool,
    receipt_id: DbId,
    completed_at: chrono::DateTime<chrono::Utc>,
    duration_ms: i32,
) -> Result<(), ProvenanceError> {
    sqlx::query!(
        "UPDATE generation_receipts SET generation_completed_at = $2, generation_duration_ms = $3 WHERE id = $1",
        receipt_id, completed_at, duration_ms
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Updates only timing fields (receipt content remains immutable)
- [ ] Duration recorded in milliseconds

---

## Phase 3: Staleness Detection

### Task 3.1: Staleness Detector
**File:** `src/provenance/staleness.rs`

Compare receipt hashes against current asset versions.

```rust
#[derive(Debug, Serialize)]
pub struct StaleSegment {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub character_name: String,
    pub receipt_id: DbId,
    pub stale_reason: Vec<StalenessReason>,
}

#[derive(Debug, Serialize)]
pub struct StalenessReason {
    pub asset_type: String,     // 'model', 'lora', 'source_image', 'workflow'
    pub asset_name: String,
    pub receipt_version: String,
    pub current_version: String,
}

pub async fn detect_stale_segments(
    pool: &PgPool,
    project_id: Option<DbId>,
) -> Result<Vec<StaleSegment>, ProvenanceError> {
    // Query receipts and compare model/lora/image hashes against current versions
    let stale = sqlx::query_as!(
        StaleReceiptRow,
        r#"
        SELECT gr.id as receipt_id, gr.segment_id, gr.model_hash, gr.model_version,
               gr.source_image_hash, gr.lora_configs,
               a.checksum_sha256 as current_model_hash, a.version as current_model_version,
               s.id as scene_id
        FROM generation_receipts gr
        JOIN segments seg ON seg.id = gr.segment_id
        JOIN scenes s ON s.id = seg.scene_id
        LEFT JOIN assets a ON a.id = gr.model_asset_id AND a.is_current_version = true
        WHERE ($1::BIGINT IS NULL OR s.character_id IN (SELECT id FROM characters WHERE project_id = $1))
          AND (a.checksum_sha256 IS NULL OR gr.model_hash != a.checksum_sha256)
        "#,
        project_id
    )
    .fetch_all(pool)
    .await?;

    // Build stale segment list with reasons
    todo!()
}

pub async fn detect_staleness_for_asset(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<Vec<StaleSegment>, ProvenanceError> {
    // Find all receipts using this asset's old hash
    let asset = get_current_asset(pool, asset_id).await?;

    let stale_receipts = sqlx::query!(
        r#"
        SELECT gr.id, gr.segment_id, gr.model_version
        FROM generation_receipts gr
        WHERE gr.model_asset_id = $1
          AND gr.model_hash != $2
        "#,
        asset_id, asset.checksum_sha256
    )
    .fetch_all(pool)
    .await?;

    // Build result
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Detects segments where receipt model hash differs from current model hash
- [ ] Detects segments where receipt LoRA hashes differ from current LoRA hashes
- [ ] Detects segments where receipt source image hash differs from current source
- [ ] Returns staleness reasons per segment
- [ ] Staleness detection within 1 minute of asset update (per success metric)
- [ ] Project-scoped and asset-scoped queries

### Task 3.2: Staleness Report Builder
**File:** `src/provenance/staleness.rs`

Generate human-readable staleness report.

```rust
#[derive(Debug, Serialize)]
pub struct StalenessReport {
    pub project_id: Option<DbId>,
    pub total_stale_segments: usize,
    pub total_stale_scenes: usize,
    pub by_asset: Vec<AssetStaleness>,
}

#[derive(Debug, Serialize)]
pub struct AssetStaleness {
    pub asset_name: String,
    pub asset_type: String,
    pub receipt_version: String,
    pub current_version: String,
    pub affected_segments: usize,
    pub affected_scenes: usize,
}
```

**Acceptance Criteria:**
- [ ] Report groups staleness by asset
- [ ] Shows: "12 segments across 3 scenes used model_v1 — you are on v2"
- [ ] Aggregated counts for quick decision making
- [ ] Actionable: each entry links to affected segments

---

## Phase 4: Targeted Re-generation

### Task 4.1: Re-generation Queue Builder
**File:** `src/provenance/regeneration.rs`

Build a re-generation queue from staleness report.

```rust
pub async fn build_regeneration_queue(
    pool: &PgPool,
    stale_segments: &[StaleSegment],
    selected_segment_ids: Option<&[DbId]>,
) -> Result<Vec<RegenerationJob>, ProvenanceError> {
    let segments_to_regen = if let Some(ids) = selected_segment_ids {
        stale_segments.iter().filter(|s| ids.contains(&s.segment_id)).collect()
    } else {
        stale_segments.iter().collect()
    };

    let mut jobs = Vec::new();
    for seg in segments_to_regen {
        // Load current asset versions
        // Build generation inputs with updated versions
        // Create regeneration job
        jobs.push(RegenerationJob {
            segment_id: seg.segment_id,
            scene_id: seg.scene_id,
            // ... current asset versions
        });
    }

    Ok(jobs)
}
```

**Acceptance Criteria:**
- [ ] Builds jobs for selected stale segments (or all stale)
- [ ] Uses current asset versions (not the stale ones)
- [ ] Old segments preserved for comparison (new segments created)
- [ ] Returns job list for submission to generation pipeline

---

## Phase 5: Provenance Queries

### Task 5.1: Forward Provenance (Segment -> Inputs)
**File:** `src/provenance/queries.rs`

```rust
pub async fn get_segment_provenance(
    pool: &PgPool,
    segment_id: DbId,
) -> Result<GenerationReceipt, ProvenanceError> {
    let receipt = sqlx::query_as!(
        GenerationReceipt,
        "SELECT * FROM generation_receipts WHERE segment_id = $1 ORDER BY created_at DESC LIMIT 1",
        segment_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ProvenanceError::NoReceipt)?;

    Ok(receipt)
}
```

**Acceptance Criteria:**
- [ ] Returns full generation receipt for a segment
- [ ] Includes all input hashes, parameters, and timing
- [ ] Returns most recent receipt if multiple exist (re-generation case)
- [ ] Query returns in <500ms (per success metric)

### Task 5.2: Reverse Provenance (Asset -> Segments)
**File:** `src/provenance/queries.rs`

```rust
pub async fn get_asset_usage(
    pool: &PgPool,
    asset_id: DbId,
    version: Option<&str>,
) -> Result<Vec<AssetUsageEntry>, ProvenanceError> {
    let results = sqlx::query_as!(
        AssetUsageEntry,
        r#"
        SELECT gr.segment_id, gr.model_version, gr.created_at,
               seg.sequence_index, s.id as scene_id
        FROM generation_receipts gr
        JOIN segments seg ON seg.id = gr.segment_id
        JOIN scenes s ON s.id = seg.scene_id
        WHERE gr.model_asset_id = $1
          AND ($2::TEXT IS NULL OR gr.model_version = $2)
        ORDER BY gr.created_at DESC
        "#,
        asset_id, version
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}
```

**Acceptance Criteria:**
- [ ] Returns all segments that used a specific asset
- [ ] Optionally filter by version
- [ ] Returns in <500ms (per success metric)
- [ ] Results navigable (click to go to segment or asset)

---

## Phase 6: API Endpoints

### Task 6.1: Provenance Endpoints
**File:** `src/routes/provenance.rs`

**Acceptance Criteria:**
- [ ] `GET /api/segments/:id/provenance` returns generation receipt
- [ ] `GET /api/assets/:id/usage` returns reverse provenance
- [ ] `GET /api/projects/:id/staleness-report` returns staleness report
- [ ] `POST /api/projects/:id/regenerate-stale` submits re-generation jobs

### Task 6.2: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All provenance endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 7: Frontend

### Task 7.1: Generation Receipt Panel
**File:** `frontend/src/components/provenance/ReceiptPanel.tsx`

Expandable receipt display in segment detail view.

**Acceptance Criteria:**
- [ ] Shows all inputs: images, model, LoRA, prompt, seed, CFG
- [ ] Expandable/collapsible sections
- [ ] Hash values shown with copy button
- [ ] Timing information (duration)

### Task 7.2: Staleness Report View
**File:** `frontend/src/components/provenance/StalenessReport.tsx`

Action-oriented staleness report.

**Acceptance Criteria:**
- [ ] Lists stale segments grouped by asset
- [ ] Shows: asset name, old version, current version, affected count
- [ ] Checkboxes to select segments for re-generation
- [ ] "Re-generate selected" button
- [ ] Stale segments have orange warning icon in all views

### Task 7.3: Asset Version History
**File:** `frontend/src/components/provenance/VersionHistory.tsx`

**Acceptance Criteria:**
- [ ] Timeline of versions per asset
- [ ] Each version shows: timestamp, uploader, usage count
- [ ] Current version clearly distinguished
- [ ] Click to see which segments used each version

---

## Phase 8: Testing

### Task 8.1: Receipt Tests
**File:** `tests/provenance_receipt_tests.rs`

**Acceptance Criteria:**
- [ ] Receipt created with all fields
- [ ] inputs_hash is deterministic for same inputs
- [ ] Receipt is not modifiable after creation (except timing)

### Task 8.2: Staleness Tests
**File:** `tests/provenance_staleness_tests.rs`

**Acceptance Criteria:**
- [ ] Detects staleness when model hash changes
- [ ] Detects staleness when LoRA hash changes
- [ ] Non-stale segments not flagged
- [ ] Staleness report counts are accurate

### Task 8.3: Provenance Query Tests
**File:** `tests/provenance_query_tests.rs`

**Acceptance Criteria:**
- [ ] Forward query returns correct receipt for segment
- [ ] Reverse query returns all segments using an asset
- [ ] Version filter narrows results correctly
- [ ] Queries return in <500ms

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_generation_receipts.sql` | Immutable receipt table |
| `migrations/{timestamp}_add_asset_version_tracking.sql` | Version columns on existing tables |
| `src/provenance/mod.rs` | Module root |
| `src/provenance/receipt.rs` | Receipt builder and persistence |
| `src/provenance/staleness.rs` | Staleness detection and reporting |
| `src/provenance/regeneration.rs` | Targeted re-generation queue |
| `src/provenance/queries.rs` | Bidirectional provenance queries |
| `src/routes/provenance.rs` | API endpoints |
| `frontend/src/components/provenance/ReceiptPanel.tsx` | Receipt display |
| `frontend/src/components/provenance/StalenessReport.tsx` | Staleness report |
| `frontend/src/components/provenance/VersionHistory.tsx` | Asset version timeline |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework
- PRD-001: Segment, scene, character tables
- PRD-017: Asset registry (assets table, checksums)

### New Infrastructure Needed
- `sha2` crate for input hash computation
- `chrono` crate for timing

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Receipt Generation (Tasks 2.1-2.2)
3. Phase 3: Staleness Detection (Tasks 3.1-3.2)
4. Phase 4: Targeted Re-generation (Task 4.1)
5. Phase 5: Provenance Queries (Tasks 5.1-5.2)
6. Phase 6: API Endpoints (Tasks 6.1-6.2)

**MVP Success Criteria:**
- 100% of segments have generation receipts
- Staleness detected within 1 minute of asset update
- Targeted re-generation uses updated assets
- Provenance queries in <500ms

### Post-MVP Enhancements
1. Phase 7: Frontend (Tasks 7.1-7.3)
2. Phase 8: Testing (Tasks 8.1-8.3)
3. Reproducibility (PRD Phase 2)

---

## Notes

1. **Receipt immutability:** The generation_receipts table intentionally has no `updated_at` trigger. The only allowed update is setting `generation_completed_at` and `generation_duration_ms`.
2. **Hash computation:** The combined `inputs_hash` uses SHA-256. All individual input hashes should also use SHA-256 for consistency.
3. **LoRA multi-version:** A single generation may use multiple LoRAs at different weights. The `lora_configs` JSONB array captures all of them with their individual hashes and weights.
4. **Integration with generation pipeline:** The receipt builder should be called at the start of generation (PRD-024) and completed when the segment is written. This ensures every segment has a receipt.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
