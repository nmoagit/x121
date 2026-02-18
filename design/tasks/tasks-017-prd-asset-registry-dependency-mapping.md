# Task List: Asset Registry & Dependency Mapping

**PRD Reference:** `design/prds/017-prd-asset-registry-dependency-mapping.md`
**Scope:** Build a versioned asset registry for models, LoRAs, and custom nodes with dependency graphs, compatibility notes, quality ratings, and dependency-aware update impact analysis.

## Overview

This PRD creates a centralized registry for all pipeline assets (AI models, LoRAs, custom ComfyUI nodes) with version tracking, file integrity verification, and a reverse-dependency graph that answers "where is this asset used?" The registry enables compatibility notes between asset pairs, quality ratings, and automated impact analysis when assets are updated. This feeds into PRD-065 (regression testing) and PRD-069 (staleness detection).

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Core entity tables (scene_types reference models/LoRAs)

### What We're Building
1. Asset registry tables with version tracking and checksum integrity
2. Dependency tracking table linking assets to scene types, templates, jobs
3. Compatibility notes system (per-asset and per-asset-pair)
4. Quality rating system with aggregation
5. Update impact analysis service
6. Asset browser UI with dependency visualization

### Key Design Decisions
1. **Asset types as a lookup table** — Not hardcoded. Start with model/LoRA/custom_node but extensible.
2. **Dependency graph via join table** — `asset_dependencies` links assets to any entity type (scene_type, scene, template) using entity_type + entity_id pattern.
3. **Notes on pairs, not just singles** — A note can reference one asset (general) or a pair (compatibility). This captures "LoRA X breaks with Model Y" patterns.
4. **Checksums for integrity** — SHA-256 hash stored at registration, verifiable on demand to detect file corruption or silent replacement.

---

## Phase 1: Database Schema

### Task 1.1: Asset Registry Tables
**File:** `migrations/{timestamp}_create_asset_registry.sql`

Core asset inventory with version tracking.

```sql
CREATE TABLE asset_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO asset_types (name, description) VALUES
    ('model', 'AI model checkpoint (e.g., Stable Diffusion, AnimateDiff)'),
    ('lora', 'LoRA fine-tuning weights'),
    ('custom_node', 'Custom ComfyUI node package');

CREATE TABLE asset_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO asset_statuses (name, description) VALUES
    ('active', 'Asset is available for use'),
    ('deprecated', 'Asset is still available but should not be used for new work'),
    ('removed', 'Asset has been removed from the system');

CREATE TABLE assets (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    asset_type_id BIGINT NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES asset_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 TEXT NOT NULL,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',  -- type-specific metadata (architecture, base model, etc.)
    registered_by BIGINT NULL,             -- FK to users when available
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_asset_type_id ON assets(asset_type_id);
CREATE INDEX idx_assets_status_id ON assets(status_id);
CREATE INDEX idx_assets_name ON assets(name);
CREATE UNIQUE INDEX uq_assets_name_version ON assets(name, version);
CREATE INDEX idx_assets_checksum ON assets(checksum_sha256);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Asset types seeded: model, lora, custom_node
- [ ] Asset statuses seeded: active, deprecated, removed
- [ ] Assets tracked with name, version, file_path, file_size, checksum
- [ ] Unique constraint on (name, version)
- [ ] JSONB metadata for type-specific info
- [ ] All FK columns indexed
- [ ] Migration applies cleanly

### Task 1.2: Asset Dependencies Table
**File:** `migrations/{timestamp}_create_asset_dependencies.sql`

Track which entities reference which assets.

```sql
CREATE TABLE asset_dependencies (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE ON UPDATE CASCADE,
    dependent_entity_type TEXT NOT NULL,  -- 'scene_type', 'scene', 'template', 'job'
    dependent_entity_id BIGINT NOT NULL,
    dependency_role TEXT NOT NULL,         -- 'primary_model', 'lora', 'auxiliary_model'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_dependencies_asset_id ON asset_dependencies(asset_id);
CREATE INDEX idx_asset_dependencies_entity ON asset_dependencies(dependent_entity_type, dependent_entity_id);
CREATE UNIQUE INDEX uq_asset_dependencies_asset_entity_role
    ON asset_dependencies(asset_id, dependent_entity_type, dependent_entity_id, dependency_role);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_dependencies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Links assets to scene types, scenes, templates, and jobs
- [ ] `dependency_role` distinguishes primary model vs. LoRA vs. auxiliary
- [ ] Unique constraint prevents duplicate dependency records
- [ ] CASCADE on delete: removing an asset removes its dependency records
- [ ] Migration applies cleanly

### Task 1.3: Compatibility Notes Table
**File:** `migrations/{timestamp}_create_asset_notes.sql`

Store compatibility observations for assets and asset pairs.

```sql
CREATE TABLE asset_notes (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE ON UPDATE CASCADE,
    related_asset_id BIGINT NULL REFERENCES assets(id) ON DELETE CASCADE ON UPDATE CASCADE,  -- NULL for single-asset notes
    note_text TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    author_id BIGINT NULL,                -- FK to users when available
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_notes_asset_id ON asset_notes(asset_id);
CREATE INDEX idx_asset_notes_related_asset_id ON asset_notes(related_asset_id);
CREATE INDEX idx_asset_notes_severity ON asset_notes(severity);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_notes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Notes can reference a single asset (general) or a pair (compatibility)
- [ ] Severity levels: info, warning, critical
- [ ] Notes attributed to the author
- [ ] CASCADE delete: removing an asset removes its notes
- [ ] Migration applies cleanly

### Task 1.4: Asset Ratings Table
**File:** `migrations/{timestamp}_create_asset_ratings.sql`

Quality ratings per asset.

```sql
CREATE TABLE asset_ratings (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE ON UPDATE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    reviewer_id BIGINT NULL,             -- FK to users when available
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_ratings_asset_id ON asset_ratings(asset_id);
CREATE UNIQUE INDEX uq_asset_ratings_asset_reviewer ON asset_ratings(asset_id, reviewer_id)
    WHERE reviewer_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_ratings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] 1-5 star rating with CHECK constraint
- [ ] One rating per user per asset (unique constraint)
- [ ] Optional review text
- [ ] CASCADE delete: removing an asset removes its ratings
- [ ] Migration applies cleanly

---

## Phase 2: Asset Registry Service

### Task 2.1: Asset Registration
**File:** `src/assets/registry.rs`

Register new assets with integrity verification.

```rust
use sqlx::PgPool;
use crate::types::DbId;

pub struct RegisterAssetRequest {
    pub name: String,
    pub version: String,
    pub asset_type: String,
    pub file_path: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

pub async fn register_asset(
    pool: &PgPool,
    req: &RegisterAssetRequest,
) -> Result<DbId, AssetError> {
    // Verify file exists
    let file_meta = tokio::fs::metadata(&req.file_path).await
        .map_err(|_| AssetError::FileNotFound(req.file_path.clone()))?;

    // Compute checksum
    let checksum = compute_sha256(&req.file_path).await?;

    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO assets (name, version, asset_type_id, status_id, file_path,
                            file_size_bytes, checksum_sha256, description, metadata)
        VALUES ($1, $2,
                (SELECT id FROM asset_types WHERE name = $3),
                (SELECT id FROM asset_statuses WHERE name = 'active'),
                $4, $5, $6, $7, $8)
        RETURNING id
        "#,
        req.name, req.version, req.asset_type,
        req.file_path, file_meta.len() as i64, checksum,
        req.description, req.metadata.as_ref().unwrap_or(&serde_json::json!({}))
    )
    .fetch_one(pool)
    .await?;

    Ok(id)
}

async fn compute_sha256(path: &str) -> Result<String, AssetError> {
    use sha2::{Sha256, Digest};
    let bytes = tokio::fs::read(path).await?;
    let hash = Sha256::digest(&bytes);
    Ok(format!("{:x}", hash))
}
```

**Acceptance Criteria:**
- [ ] Verifies file exists before registration
- [ ] Computes and stores SHA-256 checksum
- [ ] Records file size from filesystem metadata
- [ ] Unique constraint prevents duplicate name+version
- [ ] Returns asset ID on success

### Task 2.2: Asset Search & Discovery
**File:** `src/assets/search.rs`

Search and browse the asset registry.

```rust
pub struct AssetSearchParams {
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub status: Option<String>,
    pub min_rating: Option<f64>,
    pub sort_by: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

pub async fn search_assets(
    pool: &PgPool,
    params: &AssetSearchParams,
) -> Result<Vec<AssetWithStats>, sqlx::Error> {
    // Join with ratings for avg_rating and dependency count
    sqlx::query_as!(
        AssetWithStats,
        r#"
        SELECT a.id, a.name, a.version, at.name as asset_type, ast.name as status,
               a.file_path, a.file_size_bytes, a.description,
               COALESCE(AVG(ar.rating), 0) as avg_rating,
               COUNT(DISTINCT ar.id) as rating_count,
               COUNT(DISTINCT ad.id) as dependency_count
        FROM assets a
        JOIN asset_types at ON at.id = a.asset_type_id
        JOIN asset_statuses ast ON ast.id = a.status_id
        LEFT JOIN asset_ratings ar ON ar.asset_id = a.id
        LEFT JOIN asset_dependencies ad ON ad.asset_id = a.id
        WHERE ($1::TEXT IS NULL OR a.name ILIKE '%' || $1 || '%')
          AND ($2::TEXT IS NULL OR at.name = $2)
          AND ($3::TEXT IS NULL OR ast.name = $3)
        GROUP BY a.id, at.name, ast.name
        HAVING ($4::FLOAT8 IS NULL OR COALESCE(AVG(ar.rating), 0) >= $4)
        ORDER BY a.name
        LIMIT $5 OFFSET $6
        "#,
        params.name, params.asset_type, params.status,
        params.min_rating, params.limit, params.offset
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Search by name (ILIKE), asset type, status
- [ ] Filter by minimum average rating
- [ ] Returns avg_rating, rating_count, and dependency_count per asset
- [ ] Paginated results
- [ ] Query executes in <500ms

### Task 2.3: Integrity Verification
**File:** `src/assets/integrity.rs`

Verify file integrity on demand.

```rust
pub async fn verify_asset_integrity(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<IntegrityResult, AssetError> {
    let asset = get_asset(pool, asset_id).await?;
    let current_checksum = compute_sha256(&asset.file_path).await?;

    let is_valid = current_checksum == asset.checksum_sha256;

    Ok(IntegrityResult {
        asset_id,
        expected_checksum: asset.checksum_sha256,
        actual_checksum: current_checksum,
        is_valid,
        file_exists: tokio::fs::metadata(&asset.file_path).await.is_ok(),
    })
}
```

**Acceptance Criteria:**
- [ ] Recomputes SHA-256 and compares to stored checksum
- [ ] Reports file_exists separately from checksum match
- [ ] Returns both expected and actual checksum for debugging

---

## Phase 3: Dependency Graph

### Task 3.1: Dependency Tracker
**File:** `src/assets/dependencies.rs`

Register and query asset dependencies.

```rust
pub async fn register_dependency(
    pool: &PgPool,
    asset_id: DbId,
    entity_type: &str,
    entity_id: DbId,
    role: &str,
) -> Result<DbId, AssetError> {
    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO asset_dependencies (asset_id, dependent_entity_type, dependent_entity_id, dependency_role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (asset_id, dependent_entity_type, dependent_entity_id, dependency_role) DO NOTHING
        RETURNING id
        "#,
        asset_id, entity_type, entity_id, role
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_asset_dependents(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<Vec<AssetDependent>, sqlx::Error> {
    sqlx::query_as!(
        AssetDependent,
        r#"
        SELECT ad.dependent_entity_type, ad.dependent_entity_id, ad.dependency_role,
               ad.created_at
        FROM asset_dependencies ad
        WHERE ad.asset_id = $1
        ORDER BY ad.dependent_entity_type, ad.created_at
        "#,
        asset_id
    )
    .fetch_all(pool)
    .await
}

pub async fn get_entity_assets(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
) -> Result<Vec<AssetSummary>, sqlx::Error> {
    sqlx::query_as!(
        AssetSummary,
        r#"
        SELECT a.id, a.name, a.version, at.name as asset_type, ad.dependency_role
        FROM asset_dependencies ad
        JOIN assets a ON a.id = ad.asset_id
        JOIN asset_types at ON at.id = a.asset_type_id
        WHERE ad.dependent_entity_type = $1 AND ad.dependent_entity_id = $2
        "#,
        entity_type, entity_id
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] `get_asset_dependents` returns all entities using a given asset
- [ ] `get_entity_assets` returns all assets used by a given entity
- [ ] Dependency registration is idempotent (ON CONFLICT DO NOTHING)
- [ ] Results include dependency role (primary_model, lora, etc.)

### Task 3.2: Delete Protection
**File:** `src/assets/dependencies.rs`

Prevent deletion of assets with active dependencies.

```rust
pub async fn check_deletion_safe(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<DeletionCheck, AssetError> {
    let dependents = get_asset_dependents(pool, asset_id).await?;

    Ok(DeletionCheck {
        asset_id,
        is_safe: dependents.is_empty(),
        active_dependency_count: dependents.len(),
        dependents,
    })
}
```

**Acceptance Criteria:**
- [ ] Returns whether asset can be safely deleted
- [ ] Lists all active dependents if not safe
- [ ] Deletion requires explicit confirmation when dependents exist
- [ ] Confirmation lists affected entities

### Task 3.3: Impact Analysis for Updates
**File:** `src/assets/impact.rs`

Analyze the downstream impact of updating an asset.

```rust
pub async fn analyze_update_impact(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<UpdateImpact, AssetError> {
    let dependents = get_asset_dependents(pool, asset_id).await?;

    let mut impact = UpdateImpact {
        asset_id,
        affected_scene_types: vec![],
        affected_active_scenes: vec![],
        stale_segment_count: 0,
    };

    for dep in &dependents {
        match dep.dependent_entity_type.as_str() {
            "scene_type" => {
                impact.affected_scene_types.push(dep.dependent_entity_id);
                // Count active scenes using this scene type
                let scene_count = count_active_scenes_for_type(pool, dep.dependent_entity_id).await?;
                impact.stale_segment_count += count_segments_for_type(pool, dep.dependent_entity_id).await?;
            }
            "scene" => {
                impact.affected_active_scenes.push(dep.dependent_entity_id);
            }
            _ => {}
        }
    }

    Ok(impact)
}
```

**Acceptance Criteria:**
- [ ] Identifies all affected scene types
- [ ] Counts active scenes using those scene types
- [ ] Counts segments that would become stale
- [ ] Provides actionable options: run regression tests, view affected, dismiss
- [ ] Integrates with PRD-065 and PRD-069

---

## Phase 4: Compatibility Notes & Ratings

### Task 4.1: Notes Service
**File:** `src/assets/notes.rs`

CRUD operations for compatibility notes.

```rust
pub async fn add_note(
    pool: &PgPool,
    asset_id: DbId,
    related_asset_id: Option<DbId>,
    note_text: &str,
    severity: &str,
    author_id: Option<DbId>,
) -> Result<DbId, AssetError> {
    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO asset_notes (asset_id, related_asset_id, note_text, severity, author_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
        asset_id, related_asset_id, note_text, severity, author_id
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_notes_for_asset(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<Vec<AssetNote>, sqlx::Error> {
    sqlx::query_as!(
        AssetNote,
        r#"
        SELECT an.id, an.asset_id, an.related_asset_id, an.note_text, an.severity,
               an.author_id, an.created_at
        FROM asset_notes an
        WHERE an.asset_id = $1 OR an.related_asset_id = $1
        ORDER BY an.severity DESC, an.created_at DESC
        "#,
        asset_id
    )
    .fetch_all(pool)
    .await
}

pub async fn get_compatibility_warnings(
    pool: &PgPool,
    asset_ids: &[DbId],
) -> Result<Vec<AssetNote>, sqlx::Error> {
    // Find notes for any pair combination of the given assets
    sqlx::query_as!(
        AssetNote,
        r#"
        SELECT an.id, an.asset_id, an.related_asset_id, an.note_text, an.severity,
               an.author_id, an.created_at
        FROM asset_notes an
        WHERE an.severity IN ('warning', 'critical')
          AND (an.asset_id = ANY($1) AND an.related_asset_id = ANY($1))
        ORDER BY an.severity DESC
        "#,
        asset_ids
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Notes can be added for a single asset or an asset pair
- [ ] `get_notes_for_asset` returns notes where asset is either primary or related
- [ ] `get_compatibility_warnings` surfaces warnings when configuring a scene type with specific assets
- [ ] Notes are sorted by severity (critical first) then by date
- [ ] Notes are searchable

### Task 4.2: Ratings Service
**File:** `src/assets/ratings.rs`

Star rating system with aggregation.

```rust
pub async fn rate_asset(
    pool: &PgPool,
    asset_id: DbId,
    rating: i16,
    review_text: Option<&str>,
    reviewer_id: Option<DbId>,
) -> Result<(), AssetError> {
    if !(1..=5).contains(&rating) {
        return Err(AssetError::InvalidRating(rating));
    }

    sqlx::query!(
        r#"
        INSERT INTO asset_ratings (asset_id, rating, review_text, reviewer_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (asset_id, reviewer_id) WHERE reviewer_id IS NOT NULL
        DO UPDATE SET rating = $2, review_text = $3
        "#,
        asset_id, rating, review_text, reviewer_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_asset_rating_summary(
    pool: &PgPool,
    asset_id: DbId,
) -> Result<RatingSummary, sqlx::Error> {
    sqlx::query_as!(
        RatingSummary,
        r#"
        SELECT COALESCE(AVG(rating), 0) as average,
               COUNT(*) as count
        FROM asset_ratings
        WHERE asset_id = $1
        "#,
        asset_id
    )
    .fetch_one(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] 1-5 star rating enforced at both Rust and DB level
- [ ] One rating per user per asset (upsert on conflict)
- [ ] Average and count computed efficiently
- [ ] Optional review text

---

## Phase 5: API Endpoints

### Task 5.1: Asset CRUD Endpoints
**File:** `src/routes/assets.rs`

```rust
pub async fn register_asset_endpoint(
    State(pool): State<PgPool>,
    Json(body): Json<RegisterAssetRequest>,
) -> Result<impl IntoResponse, AppError> {
    let id = crate::assets::registry::register_asset(&pool, &body).await?;
    Ok(Json(serde_json::json!({ "id": id })))
}

pub async fn list_assets(
    State(pool): State<PgPool>,
    Query(params): Query<AssetSearchParams>,
) -> Result<impl IntoResponse, AppError> {
    let assets = crate::assets::search::search_assets(&pool, &params).await?;
    Ok(Json(assets))
}

pub async fn get_asset(
    State(pool): State<PgPool>,
    Path(asset_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    // Return asset with notes, ratings, dependencies
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `POST /api/assets` registers a new asset
- [ ] `GET /api/assets` lists/searches assets with filtering
- [ ] `GET /api/assets/:id` returns full asset details with notes, ratings, dependencies
- [ ] `PUT /api/assets/:id` updates asset metadata
- [ ] `DELETE /api/assets/:id` with deletion safety check

### Task 5.2: Dependency Endpoints
**File:** `src/routes/assets.rs`

**Acceptance Criteria:**
- [ ] `GET /api/assets/:id/dependencies` returns "where is this used?" data
- [ ] `GET /api/assets/:id/impact` returns update impact analysis
- [ ] Dependency count included in list/search responses

### Task 5.3: Notes & Ratings Endpoints
**File:** `src/routes/assets.rs`

**Acceptance Criteria:**
- [ ] `POST /api/assets/:id/notes` adds a compatibility note
- [ ] `GET /api/assets/:id/notes` lists notes for an asset
- [ ] `PUT /api/assets/:id/rating` sets or updates rating
- [ ] `GET /api/assets/:id/ratings` returns rating summary and individual ratings

### Task 5.4: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All asset endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 6: Frontend — Asset Browser

### Task 6.1: Asset List View
**File:** `frontend/src/components/assets/AssetBrowser.tsx`

Card/list view of registered assets with search and filtering.

```typescript
export const AssetBrowser: React.FC = () => {
  const [assets, setAssets] = useState<AssetWithStats[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Fetch and display assets with avg rating, dependency count
  // Card view with name, version, type badge, rating stars, dependency count
};
```

**Acceptance Criteria:**
- [ ] Card view with asset name, version, type badge, average rating
- [ ] Search by name
- [ ] Filter by type (model, lora, custom_node) and status
- [ ] Sort by name, rating, dependency count
- [ ] Dependency count badge per asset

### Task 6.2: Asset Detail Panel
**File:** `frontend/src/components/assets/AssetDetail.tsx`

Detailed view of a single asset with dependencies, notes, and ratings.

**Acceptance Criteria:**
- [ ] Shows full asset info: name, version, type, status, file path, size, checksum
- [ ] Dependency list: all entities using this asset
- [ ] Compatibility notes section with add/edit
- [ ] Rating widget with average and individual reviews
- [ ] "Verify Integrity" button

### Task 6.3: Dependency Graph Visualization
**File:** `frontend/src/components/assets/DependencyGraph.tsx`

Interactive graph showing asset dependencies.

**Acceptance Criteria:**
- [ ] Visual graph with asset at center, dependents radiating out
- [ ] Clickable nodes navigate to the entity detail view
- [ ] Color-coded by entity type
- [ ] Shows dependency role on edges

### Task 6.4: Compatibility Warning Banner
**File:** `frontend/src/components/assets/CompatibilityWarning.tsx`

Warning banner shown when configuring scene types with flagged asset combinations.

```typescript
export const CompatibilityWarning: React.FC<{ warnings: AssetNote[] }> = ({ warnings }) => (
  <div className="compatibility-warnings">
    {warnings.map(w => (
      <div key={w.id} className={`warning-${w.severity}`}>
        <strong>{w.severity}:</strong> {w.note_text}
      </div>
    ))}
  </div>
);
```

**Acceptance Criteria:**
- [ ] Automatically surfaces when selected assets have compatibility notes
- [ ] Color-coded by severity (info, warning, critical)
- [ ] Shown prominently in scene type configuration

---

## Phase 7: Testing

### Task 7.1: Registry Tests
**File:** `tests/asset_registry_tests.rs`

**Acceptance Criteria:**
- [ ] Register asset with valid file succeeds
- [ ] Register asset with missing file fails
- [ ] Duplicate name+version is rejected
- [ ] Integrity verification detects modified files

### Task 7.2: Dependency Tests
**File:** `tests/asset_dependency_tests.rs`

**Acceptance Criteria:**
- [ ] Dependency registration creates correct links
- [ ] `get_asset_dependents` returns all linked entities
- [ ] `get_entity_assets` returns all linked assets
- [ ] Delete protection prevents deletion with active dependents
- [ ] Impact analysis counts affected scenes and segments

### Task 7.3: Notes & Ratings Tests
**File:** `tests/asset_notes_ratings_tests.rs`

**Acceptance Criteria:**
- [ ] Notes can be added for single asset and asset pair
- [ ] Compatibility warnings surface for asset pairs
- [ ] Ratings enforce 1-5 range
- [ ] One rating per user per asset (upsert)
- [ ] Average and count are computed correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_asset_registry.sql` | Assets, types, statuses tables |
| `migrations/{timestamp}_create_asset_dependencies.sql` | Dependency tracking |
| `migrations/{timestamp}_create_asset_notes.sql` | Compatibility notes |
| `migrations/{timestamp}_create_asset_ratings.sql` | Quality ratings |
| `src/assets/mod.rs` | Module root |
| `src/assets/registry.rs` | Asset registration and management |
| `src/assets/search.rs` | Asset search and discovery |
| `src/assets/integrity.rs` | Checksum verification |
| `src/assets/dependencies.rs` | Dependency graph and delete protection |
| `src/assets/impact.rs` | Update impact analysis |
| `src/assets/notes.rs` | Compatibility notes CRUD |
| `src/assets/ratings.rs` | Star ratings |
| `src/routes/assets.rs` | API endpoints |
| `frontend/src/components/assets/AssetBrowser.tsx` | Asset list/search UI |
| `frontend/src/components/assets/AssetDetail.tsx` | Asset detail panel |
| `frontend/src/components/assets/DependencyGraph.tsx` | Visual dependency graph |
| `frontend/src/components/assets/CompatibilityWarning.tsx` | Warning banner |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity tables (scene_types, scenes) that assets link to

### New Infrastructure Needed
- `sha2` crate for SHA-256 checksums
- Graph visualization library for frontend (e.g., react-flow, d3-force)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.4)
2. Phase 2: Registry Service (Tasks 2.1-2.3)
3. Phase 3: Dependency Graph (Tasks 3.1-3.3)
4. Phase 4: Notes & Ratings (Tasks 4.1-4.2)
5. Phase 5: API Endpoints (Tasks 5.1-5.4)

**MVP Success Criteria:**
- All models/LoRAs registered with version and checksum
- Dependency lookup returns complete results in <500ms
- Compatibility warnings surface for flagged combinations
- Impact analysis identifies all affected entities

### Post-MVP Enhancements
1. Phase 6: Frontend Asset Browser (Tasks 6.1-6.4)
2. Phase 7: Testing (Tasks 7.1-7.3)
3. Asset recommendations (PRD Phase 2)

---

## Notes

1. **Auto-dependency registration:** When a scene type is saved with model/LoRA references, the system should automatically register dependencies. This hook should live in the scene type save logic, not in the asset module.
2. **Version management:** Assets can have multiple versions. The registry supports this natively via the (name, version) unique constraint. Dependency queries should be version-aware.
3. **Large file checksums:** Computing SHA-256 on multi-GB model files can be slow. Consider streaming the hash computation and running it as a background task with status tracking.
4. **Integration with PRD-104:** The model/LoRA download manager (PRD-104) should auto-register downloaded assets in this registry.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
