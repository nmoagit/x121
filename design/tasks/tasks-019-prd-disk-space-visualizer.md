# Task List: Disk Space Visualizer (Treemap)

**PRD Reference:** `design/prds/019-prd-disk-space-visualizer.md`
**Scope:** Build an interactive treemap/sunburst visualization of storage usage broken down by project, character, scene, and segment, with drill-down navigation, file type breakdown, and integration with PRD-015 reclamation tools.

## Overview

This PRD creates a storage analytics system with two parts: (1) a backend service that aggregates file sizes across the entity hierarchy and caches the results for fast rendering, and (2) a React frontend using D3.js that renders an interactive treemap with drill-down, hover tooltips, and click-through navigation to entity detail views. The visualization integrates with PRD-015's reclamation system to show reclaimable space and provide cleanup shortcuts.

### What Already Exists
- PRD-000: Database conventions, pgvector extension
- PRD-001: Entity hierarchy (projects > characters > scenes > segments)
- PRD-015: Disk reclamation system with trash queue and policy engine

### What We're Building
1. Storage size aggregation service (computes per-entity usage)
2. Materialized view or cache for fast treemap data retrieval
3. Interactive treemap component (D3.js)
4. File type breakdown chart
5. Drill-down navigation with breadcrumbs
6. Reclamation integration (cleanup links from treemap)

### Key Design Decisions
1. **Materialized view for performance** — Aggregating sizes on-the-fly is too slow for interactive rendering. A materialized view is refreshed periodically (configurable interval) for fast reads.
2. **D3.js over Recharts** — D3 provides the low-level control needed for smooth treemap drill-down animations and custom hover interactions.
3. **Hierarchical data API** — The backend returns a nested JSON tree matching the entity hierarchy, not flat records. D3's treemap layout expects this format.
4. **Refresh-on-demand + scheduled** — Sizes are refreshed on a schedule (every 15 minutes) and can be manually triggered by admins.

---

## Phase 1: Database Schema & Aggregation

### Task 1.1: Storage Usage Tracking
**File:** `migrations/{timestamp}_create_storage_usage.sql`

Materialized view and supporting tables for storage aggregation.

```sql
-- File type categories for breakdown
CREATE TABLE file_type_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    extensions TEXT[] NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON file_type_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO file_type_categories (name, extensions, description) VALUES
    ('video', ARRAY['mp4', 'mov', 'webm', 'avi'], 'Video output files'),
    ('image', ARRAY['png', 'jpg', 'jpeg', 'webp', 'bmp'], 'Image files (source, derived, frames)'),
    ('intermediate', ARRAY['tmp', 'cache', 'partial'], 'Temporary and intermediate files'),
    ('metadata', ARRAY['json', 'yaml', 'toml', 'xml'], 'Metadata and configuration files'),
    ('model', ARRAY['safetensors', 'ckpt', 'pt', 'bin'], 'AI model and LoRA files');

-- Per-entity storage usage snapshot
CREATE TABLE storage_usage_snapshots (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    entity_name TEXT NOT NULL,
    parent_entity_type TEXT,
    parent_entity_id BIGINT,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    video_bytes BIGINT NOT NULL DEFAULT 0,
    image_bytes BIGINT NOT NULL DEFAULT 0,
    intermediate_bytes BIGINT NOT NULL DEFAULT 0,
    metadata_bytes BIGINT NOT NULL DEFAULT 0,
    other_bytes BIGINT NOT NULL DEFAULT 0,
    reclaimable_bytes BIGINT NOT NULL DEFAULT 0,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_usage_entity ON storage_usage_snapshots(entity_type, entity_id);
CREATE INDEX idx_storage_usage_parent ON storage_usage_snapshots(parent_entity_type, parent_entity_id);
CREATE INDEX idx_storage_usage_snapshot_at ON storage_usage_snapshots(snapshot_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_usage_snapshots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] File type categories seeded: video, image, intermediate, metadata, model
- [ ] Storage snapshots store per-entity totals broken down by file type
- [ ] Parent entity reference enables hierarchy traversal
- [ ] `reclaimable_bytes` pre-computed for reclamation integration
- [ ] Migration applies cleanly

### Task 1.2: Storage Aggregation Service
**File:** `src/storage/aggregator.rs`

Compute storage usage per entity from filesystem and database.

```rust
use sqlx::PgPool;
use crate::types::DbId;

pub async fn refresh_storage_snapshots(
    pool: &PgPool,
) -> Result<RefreshReport, StorageError> {
    let mut report = RefreshReport::default();

    // Clear old snapshots
    sqlx::query!("DELETE FROM storage_usage_snapshots")
        .execute(pool)
        .await?;

    // Aggregate per segment (leaf level)
    let segments = aggregate_segment_usage(pool).await?;
    for seg in &segments {
        insert_snapshot(pool, seg).await?;
    }
    report.segments = segments.len();

    // Aggregate per scene (sum of segments)
    let scenes = aggregate_scene_usage(pool).await?;
    for scene in &scenes {
        insert_snapshot(pool, scene).await?;
    }
    report.scenes = scenes.len();

    // Aggregate per character (sum of scenes + character images)
    let characters = aggregate_character_usage(pool).await?;
    for ch in &characters {
        insert_snapshot(pool, ch).await?;
    }
    report.characters = characters.len();

    // Aggregate per project (sum of characters)
    let projects = aggregate_project_usage(pool).await?;
    for proj in &projects {
        insert_snapshot(pool, proj).await?;
    }
    report.projects = projects.len();

    Ok(report)
}
```

**Acceptance Criteria:**
- [ ] Computes per-segment file sizes from filesystem or DB records
- [ ] Rolls up to scenes, characters, projects
- [ ] Breaks down by file type category
- [ ] Includes reclaimable bytes from PRD-015 trash queue data
- [ ] Full refresh completes in <30 seconds for 1000 entities

### Task 1.3: Hierarchical Data Builder
**File:** `src/storage/hierarchy.rs`

Build the nested JSON tree for D3 treemap consumption.

```rust
#[derive(Debug, Serialize)]
pub struct StorageNode {
    pub name: String,
    pub entity_type: String,
    pub entity_id: DbId,
    pub total_bytes: i64,
    pub file_count: i32,
    pub video_bytes: i64,
    pub image_bytes: i64,
    pub intermediate_bytes: i64,
    pub metadata_bytes: i64,
    pub reclaimable_bytes: i64,
    pub children: Vec<StorageNode>,
}

pub async fn build_storage_tree(
    pool: &PgPool,
    root_entity_type: Option<&str>,
    root_entity_id: Option<DbId>,
) -> Result<StorageNode, StorageError> {
    // Start from projects (or a specific entity) and build tree recursively
    // using storage_usage_snapshots parent references
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Produces nested JSON matching D3 treemap data format
- [ ] Each node includes size, file count, and type breakdown
- [ ] Supports starting from any level (project, character, scene)
- [ ] Builds in <2 seconds for full tree

---

## Phase 2: API Endpoints

### Task 2.1: Treemap Data Endpoint
**File:** `src/routes/storage.rs`

```rust
pub async fn get_treemap_data(
    State(pool): State<PgPool>,
    Query(params): Query<TreemapParams>,
) -> Result<impl IntoResponse, AppError> {
    let tree = crate::storage::hierarchy::build_storage_tree(
        &pool, params.entity_type.as_deref(), params.entity_id,
    ).await?;
    Ok(Json(tree))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/admin/storage/treemap` returns hierarchical storage data
- [ ] Optional entity_type and entity_id for drill-down starting point
- [ ] Response format compatible with D3 treemap layout

### Task 2.2: File Type Breakdown Endpoint
**File:** `src/routes/storage.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/storage/breakdown` returns file type distribution
- [ ] Optional project_id filter
- [ ] Returns bytes and count per category

### Task 2.3: Refresh Endpoint
**File:** `src/routes/storage.rs`

**Acceptance Criteria:**
- [ ] `POST /api/admin/storage/refresh` triggers snapshot recalculation
- [ ] Returns refresh report with counts
- [ ] Requires admin authorization

### Task 2.4: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All storage endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 3: Frontend — Treemap Visualization

### Task 3.1: Treemap Component
**File:** `frontend/src/components/storage/StorageTreemap.tsx`

Interactive D3.js treemap with hover and click interactions.

```typescript
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface StorageTreemapProps {
  data: StorageNode;
  onEntityClick: (entityType: string, entityId: number) => void;
}

export const StorageTreemap: React.FC<StorageTreemapProps> = ({ data, onEntityClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentRoot, setCurrentRoot] = useState<StorageNode>(data);
  const [breadcrumbs, setBreadcrumbs] = useState<StorageNode[]>([]);

  useEffect(() => {
    if (!svgRef.current || !currentRoot) return;

    const svg = d3.select(svgRef.current);
    const root = d3.hierarchy(currentRoot)
      .sum(d => d.total_bytes)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemap = d3.treemap<StorageNode>()
      .size([width, height])
      .padding(2)
      .round(true);

    treemap(root);

    // Render rectangles with color coding
    // Add hover tooltips
    // Add click handlers for drill-down
  }, [currentRoot]);

  return (
    <div className="storage-treemap">
      <div className="breadcrumbs">
        {breadcrumbs.map((node, i) => (
          <span key={i} onClick={() => drillUp(i)}>{node.name} / </span>
        ))}
      </div>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Treemap renders with nested rectangles proportional to disk usage
- [ ] Color coding: warm (red/orange) for large, cool (blue/green) for small
- [ ] Hover tooltip shows: entity name, total size, file count
- [ ] Click drills down to next hierarchy level
- [ ] Breadcrumbs enable navigation back to higher levels
- [ ] Renders within 2 seconds for 1000 entities
- [ ] Smooth transition animations during drill-down (<500ms)

### Task 3.2: File Type Breakdown Chart
**File:** `frontend/src/components/storage/FileTypeBreakdown.tsx`

Pie or stacked bar chart showing file type distribution.

```typescript
export const FileTypeBreakdown: React.FC<{ data: FileTypeData }> = ({ data }) => {
  // D3 pie chart or stacked bar
  // Segments: video, image, intermediate, metadata, other
  // Filter toggles to show/hide categories
};
```

**Acceptance Criteria:**
- [ ] Pie chart showing proportion by file type
- [ ] Color-coded segments: video, image, intermediate, metadata, other
- [ ] Hover shows exact size and percentage
- [ ] Filter toggles to show/hide categories in the treemap

### Task 3.3: Storage Summary Header
**File:** `frontend/src/components/storage/StorageSummary.tsx`

Summary stats bar above the treemap.

```typescript
export const StorageSummary: React.FC<{ data: StorageNode }> = ({ data }) => (
  <div className="storage-summary">
    <div className="stat">
      <span className="label">Total Storage</span>
      <span className="value">{formatBytes(data.total_bytes)}</span>
    </div>
    <div className="stat">
      <span className="label">Files</span>
      <span className="value">{data.file_count.toLocaleString()}</span>
    </div>
    <div className="stat">
      <span className="label">Reclaimable</span>
      <span className="value">{formatBytes(data.reclaimable_bytes)}</span>
    </div>
    <button onClick={onRefresh}>Refresh Sizes</button>
  </div>
);
```

**Acceptance Criteria:**
- [ ] Shows total storage, file count, reclaimable space
- [ ] Human-readable byte formatting (KB, MB, GB, TB)
- [ ] Refresh button triggers snapshot recalculation

### Task 3.4: Reclamation Integration
**File:** `frontend/src/components/storage/TreemapActions.tsx`

Context menu / action buttons for cleanup from the treemap.

**Acceptance Criteria:**
- [ ] Right-click or button to "Clean up" any entity in the treemap
- [ ] Links to PRD-015 reclamation preview for the selected entity
- [ ] Shows reclaimable space estimate in the tooltip
- [ ] "View details" action navigates to entity detail page

---

## Phase 4: Scheduled Refresh

### Task 4.1: Periodic Refresh Job
**File:** `src/storage/scheduler.rs`

Background job to refresh storage snapshots on a configurable interval.

```rust
pub async fn start_storage_refresh_scheduler(
    pool: PgPool,
    interval_minutes: u64,
) {
    let mut interval = tokio::time::interval(
        std::time::Duration::from_secs(interval_minutes * 60)
    );

    loop {
        interval.tick().await;
        match crate::storage::aggregator::refresh_storage_snapshots(&pool).await {
            Ok(report) => tracing::info!("Storage refresh complete: {:?}", report),
            Err(e) => tracing::error!("Storage refresh failed: {}", e),
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Runs on a configurable interval (default 15 minutes)
- [ ] Logs refresh results
- [ ] Handles errors gracefully (retries on next interval)
- [ ] Can be disabled via configuration

---

## Phase 5: Testing

### Task 5.1: Aggregation Tests
**File:** `tests/storage_aggregation_tests.rs`

**Acceptance Criteria:**
- [ ] Segment-level sizes are computed correctly
- [ ] Roll-up to scene/character/project is accurate
- [ ] File type breakdown sums match total
- [ ] Reclaimable bytes match PRD-015 trash queue data

### Task 5.2: Hierarchy Builder Tests
**File:** `tests/storage_hierarchy_tests.rs`

**Acceptance Criteria:**
- [ ] Tree structure is correctly nested
- [ ] Children sizes sum to parent size
- [ ] Single-entity drill-down returns correct subtree
- [ ] Empty entities (no files) are handled gracefully

### Task 5.3: API Tests
**File:** `tests/storage_api_tests.rs`

**Acceptance Criteria:**
- [ ] Treemap endpoint returns valid hierarchical JSON
- [ ] Breakdown endpoint returns all file type categories
- [ ] Refresh endpoint triggers recalculation
- [ ] Sizes are accurate within 1% of filesystem

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_storage_usage.sql` | File type categories and usage snapshots |
| `src/storage/mod.rs` | Module root |
| `src/storage/aggregator.rs` | Storage size aggregation service |
| `src/storage/hierarchy.rs` | Hierarchical tree builder for D3 |
| `src/storage/scheduler.rs` | Periodic refresh job |
| `src/routes/storage.rs` | API endpoints |
| `frontend/src/components/storage/StorageTreemap.tsx` | D3 treemap visualization |
| `frontend/src/components/storage/FileTypeBreakdown.tsx` | Pie/bar chart by file type |
| `frontend/src/components/storage/StorageSummary.tsx` | Summary stats header |
| `frontend/src/components/storage/TreemapActions.tsx` | Reclamation action links |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework
- PRD-001: Entity hierarchy for tree structure
- PRD-015: Trash queue and reclaimable bytes data

### New Infrastructure Needed
- `d3` npm package for frontend visualization
- Background task runner (tokio spawn) for scheduled refresh

## Implementation Order

### MVP
1. Phase 1: Database & Aggregation (Tasks 1.1-1.3)
2. Phase 2: API Endpoints (Tasks 2.1-2.4)
3. Phase 3: Frontend Treemap (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Treemap renders in <2 seconds for 1000 entities
- Sizes accurate within 1% of filesystem
- Drill-down transitions in <500ms
- Click-through navigates to entity detail

### Post-MVP Enhancements
1. Phase 4: Scheduled Refresh (Task 4.1)
2. Phase 5: Testing (Tasks 5.1-5.3)
3. Sunburst alternative view (PRD Phase 2)

---

## Notes

1. **Accuracy vs. performance tradeoff:** Real-time filesystem scanning is accurate but slow. The snapshot approach trades real-time accuracy for sub-second rendering. Admins can trigger manual refresh when needed.
2. **Large studios:** For studios with >10,000 entities, the treemap should lazy-load children on drill-down rather than sending the entire tree upfront.
3. **Dashboard widget:** The treemap should be designed as a reusable component that can be embedded in PRD-089's admin dashboard as a widget.
4. **Deleted file tracking:** Files in the PRD-015 trash queue should appear in the "reclaimable" category, not in the active storage count.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
