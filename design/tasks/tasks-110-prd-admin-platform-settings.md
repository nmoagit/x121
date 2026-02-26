# Task List: Admin Platform Settings Panel

**PRD Reference:** `design/prds/110-prd-admin-platform-settings.md`
**Scope:** Web-based admin panel for viewing, editing, and persisting platform-wide settings (currently managed via `.env` files) in the database with env-var fallback, validation, audit logging, restart warnings, and connection testing for URL settings.

## Overview

Platform configuration is currently scattered across environment variables. This feature introduces a `platform_settings` table, a settings registry in `x121_core`, a resolution chain (DB -> env -> hardcoded default), and an admin-only UI at `/admin/settings`. Settings are organized by category (storage, comfyui, authentication, system), validated against registry rules, and audit-logged on every change. URL-type settings support connection testing from the backend.

### What Already Exists
- `x121_api::middleware::rbac::RequireAdmin` -- Admin-only endpoint protection
- `x121_api::state::AppState` -- Shared application state (pool, config, ws_manager, etc.)
- `x121_api::error::{AppError, AppResult}` -- Standard error types with `IntoResponse`
- `x121_api::response::DataResponse` -- Standard `{ data: T }` envelope
- `x121_core::error::CoreError` -- Domain error variants (NotFound, Conflict, Validation)
- `x121_core::types::{DbId, Timestamp}` -- Shared type aliases
- `x121_db::repositories::AuditRepo` -- Audit logging infrastructure (PRD-55)
- `x121_db::models::audit::{AuditLog, CreateAuditLog}` -- Audit log DTOs
- `apps/frontend/src/app/navigation.ts` -- Sidebar navigation groups with Admin section
- `apps/frontend/src/lib/api.ts` -- Shared API client with auth handling
- `apps/frontend/src/stores/auth-store.ts` -- Role checking for admin access
- Design system primitives: `Card`, `Badge`, `Input`, `Button`, `Spinner`, `toast`

### What We're Building
1. Database migration: `platform_settings` table
2. Settings registry in `x121_core` defining all known settings with metadata
3. `SettingsService` in `x121_core` with DB -> env -> default resolution and in-memory cache
4. `PlatformSettingRepo` in `x121_db` for CRUD on `platform_settings` table
5. Admin API endpoints: list, get, update, reset, connection test
6. Settings panel UI at `/admin/settings` with category tabs, inline editing, validation
7. Restart banner infrastructure for settings that require server restart
8. Audit trail integration for all setting changes
9. Integration tests (DB-level and API-level)

### Key Design Decisions
1. **Settings stored as TEXT** -- All values stored as `TEXT` in the DB. The backend parses to the correct type using the registry's `value_type` for validation. This avoids multiple typed columns.
2. **In-memory cache with TTL** -- `tokio::sync::RwLock<HashMap<String, CachedSetting>>` with configurable TTL (default 60s) to avoid per-request DB queries. Cache invalidated explicitly on admin save.
3. **Registry is the source of truth** -- Only settings defined in the static registry are exposed via the API. Unknown keys in the DB are ignored.
4. **JWT_SECRET excluded** -- `JWT_SECRET` is env-only and never appears in the settings panel (too dangerous for casual UI editing).
5. **Boot timestamp for restart detection** -- The server records its boot time at startup. The restart banner compares the last restart-required change timestamp against the boot time.

---

## Phase 1: Database Migration

### Task 1.1: Create `platform_settings` table migration
**File:** `apps/db/migrations/20260225000001_create_platform_settings.sql`

Create the key-value settings table with category grouping and audit fields.

```sql
-- Platform settings key-value store (PRD-110 Req 1.1)
CREATE TABLE platform_settings (
    id          BIGSERIAL PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    value       TEXT NOT NULL,
    category    TEXT NOT NULL,
    updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row change
CREATE TRIGGER trg_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Unique index on key (already enforced by UNIQUE constraint, but explicit for clarity)
CREATE UNIQUE INDEX uq_platform_settings_key ON platform_settings (key);

-- Index on category for filtered queries
CREATE INDEX idx_platform_settings_category ON platform_settings (category);

-- FK index on updated_by
CREATE INDEX idx_platform_settings_updated_by ON platform_settings (updated_by);
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` `TIMESTAMPTZ`
- [ ] `key TEXT UNIQUE NOT NULL` -- each setting has a unique string key
- [ ] `value TEXT NOT NULL` -- all values stored as text, parsed by the backend
- [ ] `category TEXT NOT NULL` -- grouping key (storage, comfyui, authentication, system)
- [ ] `updated_by` FK to `users(id)` with `ON DELETE SET NULL` (user may be deactivated)
- [ ] `set_updated_at()` trigger applied
- [ ] Index on `category` for filtered queries
- [ ] Migration runs cleanly via `sqlx migrate run`

---

## Phase 2: Settings Registry & Service (Core)

### Task 2.1: Define settings registry data structures
**File:** `apps/backend/crates/core/src/settings.rs`

Define the static registry that describes all known platform settings. This module lives in `x121_core` (zero internal deps).

```rust
use serde::Serialize;

/// The type of value a setting holds, used for validation and UI rendering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingValueType {
    String,
    Url,
    WsUrl,
    Path,
    Integer,
    Boolean,
    Duration,
    CommaSeparatedList,
}

/// Metadata for a single platform setting.
#[derive(Debug, Clone, Serialize)]
pub struct SettingDefinition {
    pub key: &'static str,
    pub category: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub value_type: SettingValueType,
    pub env_var: &'static str,
    pub default_value: &'static str,
    pub requires_restart: bool,
    pub sensitive: bool,
    pub validation_regex: Option<&'static str>,
}

/// Categories for organizing settings in the UI.
pub const CATEGORY_STORAGE: &str = "storage";
pub const CATEGORY_COMFYUI: &str = "comfyui";
pub const CATEGORY_AUTH: &str = "authentication";
pub const CATEGORY_SYSTEM: &str = "system";

/// The source of a resolved setting value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingSource {
    Database,
    Env,
    Default,
}
```

Define the static registry:

```rust
/// Static registry of all known platform settings.
pub static SETTINGS_REGISTRY: &[SettingDefinition] = &[
    SettingDefinition {
        key: "data_dir",
        category: CATEGORY_STORAGE,
        label: "Data Directory",
        description: "Root directory for application data storage.",
        value_type: SettingValueType::Path,
        env_var: "DATA_DIR",
        default_value: "/data/x121",
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "storage_root",
        category: CATEGORY_STORAGE,
        label: "Storage Root",
        description: "Root directory for generated assets and uploads.",
        value_type: SettingValueType::Path,
        env_var: "STORAGE_ROOT",
        default_value: "/data/x121/storage",
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "comfyui_ws_url",
        category: CATEGORY_COMFYUI,
        label: "ComfyUI WebSocket URL",
        description: "WebSocket endpoint for ComfyUI server communication.",
        value_type: SettingValueType::WsUrl,
        env_var: "COMFYUI_WS_URL",
        default_value: "ws://localhost:8188/ws",
        requires_restart: false,
        sensitive: false,
        validation_regex: Some(r"^wss?://"),
    },
    // ... HOST, PORT, CORS_ORIGINS, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY, RUST_LOG
];
```

**Acceptance Criteria:**
- [ ] `SettingValueType` enum covers: String, Url, WsUrl, Path, Integer, Boolean, Duration, CommaSeparatedList
- [ ] `SettingDefinition` struct includes: key, category, label, description, value_type, env_var, default_value, requires_restart, sensitive, validation_regex
- [ ] `SettingSource` enum with Database, Env, Default variants
- [ ] Category constants: `CATEGORY_STORAGE`, `CATEGORY_COMFYUI`, `CATEGORY_AUTH`, `CATEGORY_SYSTEM`
- [ ] Static `SETTINGS_REGISTRY` array covers at minimum: `data_dir`, `storage_root`, `comfyui_ws_url`, `host`, `port`, `cors_origins`, `jwt_access_expiry`, `jwt_refresh_expiry`, `rust_log`
- [ ] `JWT_SECRET` is explicitly NOT in the registry
- [ ] `find_definition(key: &str) -> Option<&SettingDefinition>` helper function provided
- [ ] `list_definitions_by_category(category: &str) -> Vec<&SettingDefinition>` helper provided
- [ ] Module registered in `core/src/lib.rs`

### Task 2.2: Implement settings validation logic
**File:** `apps/backend/crates/core/src/settings.rs` (extend)

Add validation functions that check a proposed value against a setting's `value_type` and optional `validation_regex`.

```rust
use crate::error::CoreError;

/// Validate a value against a setting definition.
pub fn validate_setting_value(
    definition: &SettingDefinition,
    value: &str,
) -> Result<(), CoreError> {
    match definition.value_type {
        SettingValueType::Url => validate_url(value)?,
        SettingValueType::WsUrl => validate_ws_url(value)?,
        SettingValueType::Path => validate_path(value)?,
        SettingValueType::Integer => validate_integer(value)?,
        SettingValueType::Boolean => validate_boolean(value)?,
        SettingValueType::Duration => validate_duration(value)?,
        _ => {} // String and CommaSeparatedList accept any value
    }

    if let Some(regex) = definition.validation_regex {
        validate_regex(value, regex)?;
    }

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `validate_setting_value(definition, value) -> Result<(), CoreError>` validates by type
- [ ] URL validation: checks `http://` or `https://` prefix, basic URL structure
- [ ] WS URL validation: checks `ws://` or `wss://` prefix
- [ ] Path validation: checks non-empty, starts with `/`
- [ ] Integer validation: `value.parse::<i64>()` succeeds
- [ ] Boolean validation: value is `"true"` or `"false"` (case-insensitive)
- [ ] Duration validation: parseable as integer seconds or `"30m"`, `"1h"` format
- [ ] Regex validation: if `validation_regex` is Some, compile and match
- [ ] Returns `CoreError::Validation` with descriptive message on failure
- [ ] Unit tests for each validation function

### Task 2.3: Implement `SettingsService` with cache and resolution
**File:** `apps/backend/crates/core/src/settings.rs` (extend)

The `SettingsService` provides the resolution chain: DB -> env -> default. Since `x121_core` has no DB dependency, the service accepts an injected async closure for DB lookups.

Note: The actual DB-backed implementation of `SettingsService` that wires the repo will live in the `api` crate or be initialized during server startup (Task 4.1). The core module defines the interface and caching logic.

```rust
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// A cached setting entry.
struct CachedEntry {
    value: String,
    source: SettingSource,
    fetched_at: Instant,
}

/// Settings service with in-memory cache and DB -> env -> default resolution.
pub struct SettingsService {
    cache: Arc<RwLock<HashMap<String, CachedEntry>>>,
    ttl: Duration,
    /// Boot timestamp for restart detection.
    boot_time: Timestamp,
}
```

**Acceptance Criteria:**
- [ ] `SettingsService::new(ttl: Duration) -> Self` constructor records boot time
- [ ] `get(key: &str, db_value: Option<String>) -> (String, SettingSource)` resolves DB -> env -> default
- [ ] In-memory cache with configurable TTL (default 60 seconds)
- [ ] `invalidate(key: &str)` removes a single key from cache
- [ ] `invalidate_all()` clears entire cache
- [ ] `boot_time()` returns the server boot timestamp
- [ ] `needs_restart(last_restart_setting_change: Option<Timestamp>) -> bool` compares timestamps
- [ ] Thread-safe via `Arc<RwLock<...>>`
- [ ] Unit tests for resolution ordering (DB wins over env, env wins over default)
- [ ] Unit tests for cache TTL expiry

---

## Phase 3: Database Layer (Model & Repository)

### Task 3.1: Create `PlatformSetting` model structs
**File:** `apps/backend/crates/db/src/models/platform_setting.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/project_config.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `platform_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PlatformSetting {
    pub id: DbId,
    pub key: String,
    pub value: String,
    pub category: String,
    pub updated_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or upserting a platform setting.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertPlatformSetting {
    pub key: String,
    pub value: String,
    pub category: String,
}

/// DTO for updating a platform setting value. Only the value changes.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlatformSettingValue {
    pub value: String,
}
```

**Acceptance Criteria:**
- [ ] `PlatformSetting` derives `Debug, Clone, FromRow, Serialize`
- [ ] Uses `DbId` (`i64`) and `Timestamp` from `x121_core::types`
- [ ] `updated_by: Option<DbId>` -- nullable FK to users
- [ ] `UpsertPlatformSetting` for insert/upsert operations
- [ ] `UpdatePlatformSettingValue` for PATCH endpoint (only value field)
- [ ] Module registered in `models/mod.rs` with `pub mod platform_setting;`

### Task 3.2: Create `PlatformSettingRepo` with CRUD operations
**File:** `apps/backend/crates/db/src/repositories/platform_setting_repo.rs`

Follow the zero-sized struct pattern from existing repos.

```rust
use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::platform_setting::{PlatformSetting, UpsertPlatformSetting};

const COLUMNS: &str = "id, key, value, category, updated_by, created_at, updated_at";

pub struct PlatformSettingRepo;

impl PlatformSettingRepo {
    /// Upsert a setting (insert or update on key conflict).
    pub async fn upsert(
        pool: &PgPool,
        key: &str,
        value: &str,
        category: &str,
        user_id: DbId,
    ) -> Result<PlatformSetting, sqlx::Error>;

    /// Find a setting by its unique key.
    pub async fn find_by_key(
        pool: &PgPool,
        key: &str,
    ) -> Result<Option<PlatformSetting>, sqlx::Error>;

    /// List all settings, optionally filtered by category.
    pub async fn list(
        pool: &PgPool,
        category: Option<&str>,
    ) -> Result<Vec<PlatformSetting>, sqlx::Error>;

    /// Delete a setting by key (resets to env/default).
    pub async fn delete_by_key(
        pool: &PgPool,
        key: &str,
    ) -> Result<bool, sqlx::Error>;

    /// Find the most recent updated_at among settings
    /// whose keys are in the provided list (restart-required keys).
    pub async fn last_restart_change(
        pool: &PgPool,
        keys: &[&str],
    ) -> Result<Option<Timestamp>, sqlx::Error>;
}
```

Key SQL for upsert:
```sql
INSERT INTO platform_settings (key, value, category, updated_by)
VALUES ($1, $2, $3, $4)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by
RETURNING {COLUMNS}
```

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all `platform_settings` columns
- [ ] `upsert` uses `INSERT ... ON CONFLICT (key) DO UPDATE` and returns the row
- [ ] `find_by_key` queries by `key` (not by `id`)
- [ ] `list` returns all settings, ordered by `category, key`
- [ ] `list` supports optional `category` filter via conditional `WHERE` clause
- [ ] `delete_by_key` deletes the row and returns `true` if a row was deleted
- [ ] `last_restart_change` returns `MAX(updated_at)` for the given keys
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

---

## Phase 4: API Handlers & Routes

### Task 4.1: Add `SettingsService` to `AppState`
**File:** `apps/backend/crates/api/src/state.rs` (modify)

Add `SettingsService` to the shared application state so handlers can access the cached settings resolution.

```rust
use x121_core::settings::SettingsService;

pub struct AppState {
    pub pool: x121_db::DbPool,
    pub config: Arc<ServerConfig>,
    pub ws_manager: Arc<WsManager>,
    pub comfyui_manager: Arc<x121_comfyui::manager::ComfyUIManager>,
    pub event_bus: Arc<x121_events::EventBus>,
    pub script_orchestrator: Option<Arc<ScriptOrchestrator>>,
    pub settings_service: Arc<SettingsService>,  // NEW
}
```

Initialize in `main.rs` during server startup:
```rust
let settings_service = Arc::new(SettingsService::new(Duration::from_secs(60)));
```

**Acceptance Criteria:**
- [ ] `AppState` gains `pub settings_service: Arc<SettingsService>` field
- [ ] `SettingsService` initialized in `main.rs` with 60-second TTL
- [ ] All existing code compiles without modification (new field is additive)
- [ ] Boot time recorded at startup for restart detection

### Task 4.2: Create platform settings handler module
**File:** `apps/backend/crates/api/src/handlers/platform_settings.rs`

Implement handlers for settings CRUD, reset, and connection test. All endpoints require `RequireAdmin`.

```rust
/// GET /api/v1/admin/settings
///
/// Returns all settings grouped by category. Each entry includes the resolved
/// value, its source (database/env/default), and registry metadata.
pub async fn list_settings(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/settings/:key
///
/// Returns a single setting with full detail.
pub async fn get_setting(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(key): Path<String>,
) -> AppResult<impl IntoResponse>;

/// PATCH /api/v1/admin/settings/:key
///
/// Updates a setting value. Validates against registry rules.
/// Records an audit log entry.
pub async fn update_setting(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(key): Path<String>,
    Json(input): Json<UpdateSettingRequest>,
) -> AppResult<impl IntoResponse>;

/// DELETE /api/v1/admin/settings/:key
///
/// Resets a setting to its default (deletes the DB row).
/// Records an audit log entry.
pub async fn reset_setting(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(key): Path<String>,
) -> AppResult<impl IntoResponse>;

/// POST /api/v1/admin/settings/:key/actions/test
///
/// Tests connectivity for URL-type settings.
pub async fn test_connection(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(key): Path<String>,
    Json(input): Json<TestConnectionRequest>,
) -> AppResult<impl IntoResponse>;
```

Request/response types:

```rust
#[derive(Debug, Deserialize)]
pub struct UpdateSettingRequest {
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct TestConnectionRequest {
    /// If provided, test this value instead of the currently saved value.
    pub value: Option<String>,
}

/// A single resolved setting for the API response.
#[derive(Debug, Serialize)]
pub struct SettingResponse {
    pub key: String,
    pub category: String,
    pub label: String,
    pub description: String,
    pub value: String,  // masked if sensitive
    pub source: String, // "database", "env", "default"
    pub value_type: String,
    pub requires_restart: bool,
    pub sensitive: bool,
    pub updated_at: Option<Timestamp>,
    pub updated_by: Option<DbId>,
}

/// Response for list_settings including restart banner state.
#[derive(Debug, Serialize)]
pub struct SettingsListResponse {
    pub settings: Vec<SettingResponse>,
    pub pending_restart: bool,
    pub pending_restart_keys: Vec<String>,
}

/// Result of a connection test.
#[derive(Debug, Serialize)]
pub struct ConnectionTestResult {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] `list_settings` returns all registry-defined settings with resolved values, grouped by category
- [ ] `list_settings` includes `pending_restart` flag and `pending_restart_keys` array
- [ ] `get_setting` returns 404 if key is not in the registry
- [ ] `get_setting` masks value for sensitive settings (replaces with `"***"`)
- [ ] `update_setting` validates value against registry rules via `validate_setting_value`
- [ ] `update_setting` upserts to DB, invalidates cache, records audit log
- [ ] `update_setting` returns 422 on validation failure with descriptive error
- [ ] `reset_setting` deletes the DB row, invalidates cache, records audit log
- [ ] `reset_setting` returns the setting with updated `source` (env or default)
- [ ] `test_connection` performs HTTP HEAD for URL settings, WS handshake for WS URL settings
- [ ] `test_connection` has 5-second timeout
- [ ] `test_connection` accepts optional `value` in request body (test draft value)
- [ ] `test_connection` returns 400 if setting is not a URL/WsUrl type
- [ ] All handlers require `RequireAdmin` middleware
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.3: Create audit logging helpers for settings changes
**File:** `apps/backend/crates/api/src/handlers/platform_settings.rs` (extend)

Add helper functions that create audit log entries for setting changes.

```rust
/// Record an audit log entry for a setting change.
async fn audit_setting_change(
    pool: &PgPool,
    user_id: DbId,
    action: &str,        // "setting_updated" or "setting_reset"
    key: &str,
    old_value: Option<&str>,
    new_value: Option<&str>,
    sensitive: bool,
) -> Result<(), sqlx::Error> {
    let changes = if sensitive {
        serde_json::json!({ "old_value": "***", "new_value": "***" })
    } else {
        serde_json::json!({ "old_value": old_value, "new_value": new_value })
    };

    let entry = CreateAuditLog {
        user_id: Some(user_id),
        action_type: action.to_string(),
        entity_type: Some("platform_setting".to_string()),
        entity_id: None,
        details_json: Some(serde_json::json!({ "key": key, "changes": changes })),
        ..Default::default()
    };
    AuditRepo::create(pool, &entry).await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `audit_setting_change` creates an audit log entry with action `"setting_updated"` or `"setting_reset"`
- [ ] `entity_type` is `"platform_setting"`, `details_json` contains `key` and `changes`
- [ ] Sensitive setting values are redacted in audit logs (`"***"`)
- [ ] Non-sensitive settings record `old_value` and `new_value` in `changes` JSONB
- [ ] Reuses existing `AuditRepo::create` from PRD-55

### Task 4.4: Register settings routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify route tree)

Add settings routes nested under `/admin/settings`:

```rust
// In the admin route group:
.route("/admin/settings", get(platform_settings::list_settings))
.route("/admin/settings/{key}", get(platform_settings::get_setting)
    .patch(platform_settings::update_setting)
    .delete(platform_settings::reset_setting))
.route("/admin/settings/{key}/actions/test", post(platform_settings::test_connection))
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/admin/settings` routes to `list_settings`
- [ ] `GET /api/v1/admin/settings/:key` routes to `get_setting`
- [ ] `PATCH /api/v1/admin/settings/:key` routes to `update_setting`
- [ ] `DELETE /api/v1/admin/settings/:key` routes to `reset_setting`
- [ ] `POST /api/v1/admin/settings/:key/actions/test` routes to `test_connection`
- [ ] All routes require admin authentication (via `RequireAdmin` in handlers)
- [ ] Route tree comment updated to include new endpoints

---

## Phase 5: Frontend Settings Panel

### Task 5.1: Create settings feature module types and API hooks
**Files:**
- `apps/frontend/src/features/settings/types.ts`
- `apps/frontend/src/features/settings/hooks/use-settings.ts`

Define TypeScript types matching the API response and TanStack Query hooks.

```typescript
// types.ts
export interface PlatformSetting {
  key: string;
  category: string;
  label: string;
  description: string;
  value: string;
  source: "database" | "env" | "default";
  value_type: string;
  requires_restart: boolean;
  sensitive: boolean;
  updated_at: string | null;
  updated_by: number | null;
}

export interface SettingsListResponse {
  settings: PlatformSetting[];
  pending_restart: boolean;
  pending_restart_keys: string[];
}

export interface ConnectionTestResult {
  reachable: boolean;
  latency_ms: number | null;
  error: string | null;
}
```

```typescript
// hooks/use-settings.ts
export function useSettings();          // GET /admin/settings
export function useSetting(key: string); // GET /admin/settings/:key
export function useUpdateSetting();     // PATCH mutation
export function useResetSetting();      // DELETE mutation
export function useTestConnection();    // POST /admin/settings/:key/actions/test
```

**Acceptance Criteria:**
- [ ] TypeScript interfaces match API response shapes exactly
- [ ] `useSettings()` returns `{ data: SettingsListResponse, isLoading, isError }`
- [ ] `useUpdateSetting()` mutation invalidates `['admin-settings']` query on success
- [ ] `useResetSetting()` mutation invalidates `['admin-settings']` query on success
- [ ] `useTestConnection()` mutation returns `ConnectionTestResult`
- [ ] All hooks use `api` client from `@/lib/api`, never raw `fetch`
- [ ] Query keys follow project pattern: `['admin-settings']`, `['admin-settings', key]`

### Task 5.2: Create `SettingsPanel` page component
**File:** `apps/frontend/src/features/settings/SettingsPanel.tsx`

Main page component at `/admin/settings`. Displays settings grouped by category with tab navigation.

```tsx
export function SettingsPanel() {
  const { data, isLoading } = useSettings();
  const [activeCategory, setActiveCategory] = useState("storage");

  // Group settings by category
  // Render category tabs
  // Render SettingRow for each setting in active category
  // Render RestartBanner if pending_restart
}
```

**Acceptance Criteria:**
- [ ] Page accessible at `/admin/settings` route
- [ ] Settings grouped by category: Storage, ComfyUI, Authentication, System
- [ ] Tab navigation or collapsible sections for categories
- [ ] Loading state with `Spinner` while fetching
- [ ] Error state with retry option
- [ ] Restart banner at top when `pending_restart` is true
- [ ] Uses existing design system: `Card`, `Spinner`, page header pattern (icon + description)
- [ ] Named export, no default export

### Task 5.3: Create `SettingRow` component with inline editing
**File:** `apps/frontend/src/features/settings/components/SettingRow.tsx`

Each setting renders as a row with label, description, editable value, source badge, and action buttons.

```tsx
interface SettingRowProps {
  setting: PlatformSetting;
  onSave: (key: string, value: string) => void;
  onReset: (key: string) => void;
  onTest?: (key: string, value: string) => void;
}

export function SettingRow({ setting, onSave, onReset, onTest }: SettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(setting.value);
  // ...
}
```

**Acceptance Criteria:**
- [ ] Displays: label (bold), description (muted), current value, source badge, restart warning icon
- [ ] Source badge shows "Database" (blue), "Env Default" (yellow), or "Default" (gray)
- [ ] Clicking value enters edit mode with Save/Cancel buttons
- [ ] Sensitive settings show masked value (`***`) with a reveal toggle
- [ ] Inline validation feedback on invalid values (using Zod or manual validation matching backend types)
- [ ] "Reset to Default" button calls `DELETE` endpoint
- [ ] "Test Connection" button shown for URL/WsUrl type settings
- [ ] Success/error toast on save
- [ ] Test result shown inline: green check + latency or red X + error
- [ ] Uses React Hook Form for inline edit if complex, or simple `useState` for single-field edit
- [ ] Uses existing `Badge`, `Input`, `Button` primitives

### Task 5.4: Create `RestartBanner` component
**File:** `apps/frontend/src/features/settings/components/RestartBanner.tsx`

Persistent banner when restart-required settings have been changed.

```tsx
interface RestartBannerProps {
  pendingKeys: string[];
  settingsMap: Map<string, PlatformSetting>;
}

export function RestartBanner({ pendingKeys, settingsMap }: RestartBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  // ...
}
```

**Acceptance Criteria:**
- [ ] Banner appears when `pending_restart` is true in API response
- [ ] Lists all setting labels (not keys) that require restart
- [ ] Warning icon and yellow/amber background using design tokens
- [ ] Dismissible via close button, but reappears on next page visit (not persisted client-side)
- [ ] Automatically absent when server has restarted (API returns `pending_restart: false`)
- [ ] Uses existing design system components

### Task 5.5: Add navigation entry and route
**Files:**
- `apps/frontend/src/app/navigation.ts` (modify)
- `apps/frontend/src/app/router.tsx` (modify)

Add the settings page to the Admin navigation group and register the route.

```typescript
// navigation.ts — add to Admin group items:
{ label: "Settings", path: "/admin/settings", icon: Settings },
```

**Acceptance Criteria:**
- [ ] "Settings" nav item added to Admin group in sidebar navigation
- [ ] Uses `Settings` icon from Lucide
- [ ] Route `/admin/settings` lazy-loads the `SettingsPanel` component
- [ ] Route protected by admin role check (existing `AdminGuard` or `ProtectedRoute`)
- [ ] Navigation item appears after existing Admin items

---

## Phase 6: Integration Tests

### Task 6.1: DB-level platform setting CRUD tests
**File:** `apps/backend/crates/db/tests/platform_setting.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_upsert_creates_new_setting(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_upsert_updates_existing_setting(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_by_key(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_by_key_not_found(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_all(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_by_category(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_by_key(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_by_key_not_found(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_last_restart_change(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Upsert creates a new setting when key does not exist
- [ ] Upsert updates value and updated_by when key already exists
- [ ] `find_by_key` returns `Some` for existing key, `None` for missing key
- [ ] `list` returns all settings ordered by category, key
- [ ] `list` with category filter returns only matching settings
- [ ] `delete_by_key` returns `true` for existing key, `false` for missing
- [ ] `last_restart_change` returns the most recent `updated_at` among specified keys
- [ ] All tests pass with `#[sqlx::test]` attribute

### Task 6.2: API-level settings endpoint tests
**File:** `apps/backend/crates/api/tests/platform_settings_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_settings_requires_admin(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_settings_returns_all_registry_entries(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_setting_found(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_setting_not_in_registry_404(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_setting_valid_value(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_setting_invalid_value_422(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_reset_setting(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_setting_creates_audit_log(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_sensitive_setting_value_masked(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pending_restart_flag(pool: PgPool);
```

Each test uses `common::build_test_app` and shared HTTP helpers.

**Acceptance Criteria:**
- [ ] Non-admin requests to `/admin/settings` return 403 Forbidden
- [ ] Admin `GET /admin/settings` returns all registry-defined settings
- [ ] Each setting includes resolved value, source, and metadata
- [ ] `GET /admin/settings/:key` returns 404 for unknown keys
- [ ] `PATCH /admin/settings/:key` with valid value returns 200 with updated setting
- [ ] `PATCH /admin/settings/:key` with invalid value returns 422 with validation error
- [ ] `DELETE /admin/settings/:key` returns setting with source changed to env or default
- [ ] Update creates an audit log entry with action `"setting_updated"`
- [ ] Sensitive settings have value masked as `"***"` in GET responses
- [ ] After updating a `requires_restart` setting, `pending_restart` is `true` in list response
- [ ] All tests pass

### Task 6.3: Core settings validation unit tests
**File:** `apps/backend/crates/core/src/settings.rs` (bottom of file, `#[cfg(test)]`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_url_valid();
    #[test]
    fn test_validate_url_invalid();
    #[test]
    fn test_validate_ws_url_valid();
    #[test]
    fn test_validate_ws_url_invalid();
    #[test]
    fn test_validate_path_valid();
    #[test]
    fn test_validate_path_invalid();
    #[test]
    fn test_validate_integer_valid();
    #[test]
    fn test_validate_integer_invalid();
    #[test]
    fn test_validate_boolean_valid();
    #[test]
    fn test_validate_boolean_invalid();
    #[test]
    fn test_validate_duration_valid();
    #[test]
    fn test_validate_duration_invalid();
    #[test]
    fn test_find_definition_existing();
    #[test]
    fn test_find_definition_missing();
    #[test]
    fn test_list_definitions_by_category();
    #[test]
    fn test_resolution_db_wins_over_env();
    #[test]
    fn test_resolution_env_wins_over_default();
    #[test]
    fn test_resolution_default_when_no_db_no_env();
}
```

**Acceptance Criteria:**
- [ ] Valid URLs pass, invalid URLs fail with descriptive error
- [ ] Valid WS URLs pass, HTTP URLs fail for WS type
- [ ] Paths starting with `/` pass, empty or relative paths fail
- [ ] Numeric strings pass, non-numeric strings fail
- [ ] `"true"`/`"false"` pass, other strings fail for boolean
- [ ] Duration strings like `"900"`, `"30m"`, `"1h"` pass
- [ ] `find_definition` returns correct definition for known key, None for unknown
- [ ] `list_definitions_by_category` returns only settings for the given category
- [ ] Resolution tests verify the DB -> env -> default priority chain
- [ ] All tests pass

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260225000001_create_platform_settings.sql` | Platform settings table migration |
| `apps/backend/crates/core/src/settings.rs` | Settings registry, validation, `SettingsService` with cache |
| `apps/backend/crates/core/src/lib.rs` | Register `settings` module |
| `apps/backend/crates/db/src/models/platform_setting.rs` | Entity/create/update model structs |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model module |
| `apps/backend/crates/db/src/repositories/platform_setting_repo.rs` | CRUD repository with upsert |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo module |
| `apps/backend/crates/api/src/state.rs` | Add `settings_service` to `AppState` |
| `apps/backend/crates/api/src/main.rs` | Initialize `SettingsService` at startup |
| `apps/backend/crates/api/src/handlers/platform_settings.rs` | API handlers (list, get, update, reset, test) |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register new handler module |
| `apps/backend/crates/api/src/lib.rs` | Register routes under `/admin/settings` |
| `apps/frontend/src/features/settings/types.ts` | TypeScript type definitions |
| `apps/frontend/src/features/settings/hooks/use-settings.ts` | TanStack Query hooks |
| `apps/frontend/src/features/settings/SettingsPanel.tsx` | Main page component |
| `apps/frontend/src/features/settings/components/SettingRow.tsx` | Individual setting row with inline editing |
| `apps/frontend/src/features/settings/components/RestartBanner.tsx` | Restart warning banner |
| `apps/frontend/src/app/navigation.ts` | Add Settings nav item to Admin group |
| `apps/frontend/src/app/router.tsx` | Register `/admin/settings` route |
| `apps/backend/crates/db/tests/platform_setting.rs` | DB-level CRUD tests |
| `apps/backend/crates/api/tests/platform_settings_api.rs` | API-level endpoint tests |

---

## Dependencies

### Existing Components to Reuse
- `x121_core::types::{DbId, Timestamp}` -- Shared type aliases
- `x121_core::error::CoreError` -- Domain error variants (Validation, NotFound, Conflict)
- `x121_api::error::{AppError, AppResult}` -- HTTP error mapping
- `x121_api::response::DataResponse` -- Standard `{ data: T }` envelope
- `x121_api::middleware::rbac::RequireAdmin` -- Admin-only endpoint protection
- `x121_api::state::AppState` -- Shared app state with `pool: PgPool`
- `x121_db::repositories::AuditRepo` -- Audit log creation (PRD-55)
- `x121_db::models::audit::CreateAuditLog` -- Audit log DTO
- `tests/common/mod.rs` -- `build_test_app`, `body_json`, `post_json`, `get`, `delete` helpers
- Design system primitives: `Card`, `Badge`, `Input`, `Button`, `Spinner`, `toast`
- `apps/frontend/src/lib/api.ts` -- Shared API client
- `apps/frontend/src/stores/auth-store.ts` -- Role checking

### New Infrastructure Needed
- `platform_settings` table and migration
- `x121_core::settings` module (registry, validation, `SettingsService`)
- `x121_db::models::platform_setting` -- Model structs
- `x121_db::repositories::PlatformSettingRepo` -- Repository
- `apps/backend/crates/api/src/handlers/platform_settings.rs` -- API handlers
- `apps/frontend/src/features/settings/` -- Frontend settings feature module

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration -- Task 1.1
2. Phase 2: Core Registry & Service -- Tasks 2.1-2.3
3. Phase 3: Database Layer -- Tasks 3.1-3.2
4. Phase 4: API Handlers & Routes -- Tasks 4.1-4.4
5. Phase 5: Frontend Settings Panel -- Tasks 5.1-5.5
6. Phase 6: Integration Tests -- Tasks 6.1-6.3

**MVP Success Criteria:**
- Admin can view all platform settings organized by category at `/admin/settings`
- Admin can edit a setting value and see it persisted in the database
- Settings resolution follows DB -> env -> default chain
- Invalid values are rejected with clear validation messages
- Sensitive settings are masked in the UI and audit logs
- Setting changes are recorded in the audit log
- URL-type settings can be tested for connectivity
- Restart-required settings show a persistent warning banner
- All integration tests pass (DB-level and API-level)

### Post-MVP Enhancements
- Per-setting history view (PRD-110 Req 2.1) -- timeline of past values
- Bulk import/export integration with PRD-44 Config Export (Req 2.2)
- Restart trigger button (Req 2.3) -- graceful restart via management endpoint
- Redis-backed cache for multi-instance deployments
- WebSocket push for real-time setting updates across browser tabs
- Incremental migration of `std::env::var()` calls to `SettingsService`

---

## Notes

1. **`core` crate has zero internal deps.** The `SettingsService` in `x121_core` cannot import `sqlx` or `x121_db`. The cache layer stores raw values; the DB lookup is performed by the API handler and passed to the service. This preserves the dependency direction: `api` -> `core`, `db`.
2. **Migration timestamp.** The migration file name uses `20260225000001` as a placeholder. Adjust to the actual timestamp when creating via `sqlx migrate add`.
3. **Sensitive settings masking.** The `get_setting` and `list_settings` handlers mask `value` to `"***"` for settings where `sensitive: true`. The `update_setting` handler still accepts and stores the real value. Audit logs also redact sensitive values.
4. **Connection test timeout.** The `test_connection` handler uses `tokio::time::timeout(Duration::from_secs(5), ...)` to cap connection attempts. For WS URLs, it performs a WebSocket handshake; for HTTP URLs, it performs an HTTP HEAD request.
5. **Boot timestamp for restart detection.** The `SettingsService` records `Utc::now()` at construction time. The `pending_restart` flag is computed by comparing `last_restart_change` (from the DB) against the boot time. If any restart-required setting was changed after boot, `pending_restart` is true.
6. **Frontend feature module location.** The settings feature goes in `apps/frontend/src/features/settings/`, not `apps/frontend/src/features/admin/`, because it is a self-contained feature module per the project conventions. The admin guard is handled at the route level.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-110
