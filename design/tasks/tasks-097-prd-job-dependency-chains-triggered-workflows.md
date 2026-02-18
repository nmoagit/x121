# Task List: Job Dependency Chains & Triggered Workflows

**PRD Reference:** `design/prds/097-prd-job-dependency-chains-triggered-workflows.md`
**Scope:** Configurable "when X completes, automatically start Y" trigger rules that turn a supervised pipeline into a self-advancing one, with visual condition builder, chain visualization, safety controls, and audit logging.

## Overview

Without configurable triggers, advancing through the pipeline requires manual intervention at each stage. This feature provides event-driven trigger rules ("when variants are approved, auto-generate scenes"), a visual condition builder for non-technical users, directed graph visualization of dependency chains, safety controls (max chain depth, dry-run, admin approval for costly triggers), and a complete trigger audit log.

### What Already Exists
- PRD-008: Queue management, PRD-010: Event bus
- PRD-012: External API/webhooks, PRD-045: Audit logging, PRD-057: Batch orchestrator

### What We're Building
1. `triggers` table for rule definitions
2. Trigger engine listening to PRD-010 events
3. Condition evaluator and action dispatcher
4. Safety controls (max depth, dry-run, approval gates)
5. Visual condition builder UI
6. Chain visualization as directed graph
7. Trigger audit log

### Key Design Decisions
1. **Event-driven** — Triggers listen to PRD-010 event bus events. No polling.
2. **Max chain depth** — Prevents infinite loops. Default: 10 steps.
3. **Dry-run mode** — Shows what would happen without executing. Essential for testing trigger configurations.
4. **Admin approval for GPU triggers** — Triggers that submit generation jobs require admin approval unless explicitly pre-approved.

---

## Phase 1: Database Schema

### Task 1.1: Triggers Table
**File:** `migrations/YYYYMMDD_create_triggers.sql`

```sql
CREATE TABLE triggers (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,  -- 'completed', 'approved', 'failed'
    entity_type TEXT NOT NULL,  -- 'variant', 'scene', 'segment', 'production_run'
    scope JSONB,  -- {character_id: ..., scene_type_id: ..., filters: {...}}
    conditions JSONB,  -- Additional filter conditions
    actions JSONB NOT NULL,  -- [{action: "submit_job", params: {...}}, {action: "send_notification", ...}]
    execution_mode TEXT NOT NULL DEFAULT 'sequential',  -- 'sequential', 'parallel'
    max_chain_depth INTEGER NOT NULL DEFAULT 10,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_project_id ON triggers(project_id);
CREATE INDEX idx_triggers_event_type ON triggers(event_type);
CREATE INDEX idx_triggers_is_enabled ON triggers(is_enabled);
CREATE INDEX idx_triggers_created_by_id ON triggers(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON triggers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### Task 1.2: Trigger Log Table
**File:** `migrations/YYYYMMDD_create_trigger_log.sql`

```sql
CREATE TABLE trigger_log (
    id BIGSERIAL PRIMARY KEY,
    trigger_id BIGINT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_data JSONB NOT NULL,
    actions_taken JSONB NOT NULL,
    chain_depth INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL,  -- 'success', 'failed', 'blocked', 'dry_run'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trigger_log_trigger_id ON trigger_log(trigger_id);
CREATE INDEX idx_trigger_log_created_at ON trigger_log(created_at);
```

---

## Phase 2: Trigger Engine

### Task 2.1: Trigger Engine
**File:** `src/services/trigger_engine.rs`

```rust
pub async fn on_event(pool: &sqlx::PgPool, event: &Event, current_depth: u32) -> Result<(), anyhow::Error> {
    // 1. Find all enabled triggers matching this event type + entity type
    // 2. Evaluate conditions/scope filters
    // 3. Check chain depth (prevent infinite loops)
    // 4. Check if approval required
    // 5. Execute actions (sequential or parallel)
    // 6. Log trigger firing
    // 7. Actions may produce new events -> recursive (depth-limited)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Triggers fire within 10 seconds of event
- [ ] Max chain depth enforced
- [ ] Admin approval gates respected
- [ ] All firings logged

### Task 2.2: Dry-Run Service
**File:** `src/services/trigger_engine.rs`

**Acceptance Criteria:**
- [ ] Shows what would happen without executing
- [ ] Full chain walkthrough
- [ ] Output: list of actions that would fire

### Task 2.3: Safety Controls
**File:** `src/services/trigger_safety_service.rs`

**Acceptance Criteria:**
- [ ] Maximum chain depth configurable (default: 10)
- [ ] Emergency disable switch (pause all triggers)
- [ ] Admin approval required for triggers submitting generation jobs

---

## Phase 3: API & Frontend

### Task 3.1: Trigger API
**File:** `src/routes/trigger_routes.rs`

```rust
/// CRUD /api/triggers
/// POST /api/triggers/:id/dry-run
/// GET /api/triggers/chain-graph
/// GET /api/triggers/log
```

### Task 3.2: Condition Builder
**File:** `frontend/src/components/triggers/ConditionBuilder.tsx`

**Acceptance Criteria:**
- [ ] Visual builder: event type, entity scope, filters
- [ ] Action configuration: submit job, trigger QA, send notification, call webhook
- [ ] Preview: "If this fires, here's what would happen"

### Task 3.3: Chain Visualization
**File:** `frontend/src/components/triggers/ChainGraph.tsx`

**Acceptance Criteria:**
- [ ] Directed graph: events -> actions -> downstream triggers
- [ ] Automated vs. approval gates distinguished
- [ ] Click to edit any trigger in chain

---

## Phase 4: Testing

### Task 4.1: Trigger Tests
**File:** `tests/trigger_engine_test.rs`

**Acceptance Criteria:**
- [ ] Trigger fires on matching event
- [ ] Chain depth limit prevents infinite loops
- [ ] Dry-run correctly predicts outcome
- [ ] Disabled triggers don't fire

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_triggers.sql` | Triggers table |
| `migrations/YYYYMMDD_create_trigger_log.sql` | Trigger audit log |
| `src/services/trigger_engine.rs` | Core trigger engine |
| `src/services/trigger_safety_service.rs` | Safety controls |
| `src/routes/trigger_routes.rs` | Trigger API |
| `frontend/src/components/triggers/ConditionBuilder.tsx` | Visual builder |
| `frontend/src/components/triggers/ChainGraph.tsx` | Chain visualization |

## Implementation Order

### MVP
1. Phase 1 — Tasks 1.1-1.2
2. Phase 2 — Tasks 2.1, 2.3
3. Phase 3 — Task 3.1

### Post-MVP
1. Phase 2 — Task 2.2 (Dry-run)
2. Phase 3 — Tasks 3.2-3.3 (UI)
3. Conditional logic (if/else branching)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-097 v1.0
