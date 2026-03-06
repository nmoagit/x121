# Task List: Storage Configuration (Local & Cloud S3)

**PRD Reference:** `design/prds/122-prd-storage-configuration.md`
**Scope:** Introduce a `StorageProvider` trait with local-filesystem and S3-compatible implementations, wire it into the application state and file I/O paths, and expose S3 configuration through the admin settings panel.

## Overview

This implementation bridges the existing storage metadata layer (PRD-48) with real file operations by introducing a `StorageProvider` async trait in `x121_core`, a `LocalStorageProvider` using `tokio::fs`, and an `S3StorageProvider` using `aws-sdk-s3` in `crates/cloud`. A factory reads the active default backend from the database to instantiate the correct provider, which is stored in `AppState` via `arc-swap` for lock-free runtime swapping. S3 credentials are added to the settings registry (PRD-110) and managed from the existing admin settings panel. New API endpoints support setting a default backend and testing S3 connectivity.

### What Already Exists
- `StorageBackend`, `AssetLocation`, `StorageMigration` models in `crates/db/src/models/storage.rs` -- full reuse
- `StorageBackendRepo`, `AssetLocationRepo`, `StorageMigrationRepo` in `crates/db/src/repositories/storage_repo.rs` -- full CRUD
- Storage constants, validation, and enums in `crates/core/src/storage.rs` -- extend with trait
- `StorageBridgeConfig` presigned URL stubs in `crates/cloud/src/storage.rs` -- replace with real S3 SDK
- `SettingsService` and `SETTINGS_REGISTRY` in `crates/core/src/settings.rs` -- extend with S3 settings
- `SettingsPanel`, `SettingRow`, `use-settings` hooks in `apps/frontend/src/features/settings/` -- automatic S3 settings display
- `BackendConfigPanel`, `use-storage` hooks in `apps/frontend/src/features/storage/` -- extend with "Set as Default"
- Storage handler routes at `/admin/storage/*` in `crates/api/src/handlers/storage.rs` -- extend with new endpoints
- `AppState` in `crates/api/src/state.rs` -- add `storage` field
- `AppError` in `crates/api/src/error.rs` -- add storage error conversion

### What We're Building
1. `StorageProvider` async trait with `StorageObject` and `StorageError` types
2. `LocalStorageProvider` implementation (tokio::fs-based)
3. `S3StorageProvider` implementation (aws-sdk-s3)
4. Storage provider factory and `arc-swap`-based runtime swapping in `AppState`
5. Seven new S3 settings in the settings registry
6. S3 connection test endpoint and set-default-backend endpoint
7. Seed migration for default "Local Storage" backend row
8. Frontend: "Set as Default" button, S3 connection test UI, conditional S3 fields

### Key Design Decisions
1. **Trait in `x121_core`, S3 impl in `crates/cloud`** -- keeps `aws-sdk-s3` dependency out of the core crate (which has zero internal deps), while the trait and local provider stay in core where all crates can access them.
2. **`arc-swap` for provider swapping** -- avoids `RwLock` read-lock overhead on every request; atomic pointer swap ensures zero-contention reads.
3. **Settings registry for S3 credentials** -- reuses the existing PRD-110 infrastructure; settings appear automatically in the "Storage" tab with no frontend changes needed.
4. **Default backend from `storage_backends` table** -- uses the existing `is_default` column rather than a separate setting, keeping the single source of truth in the database.

---

## Phase 1: Core Trait & Error Types

### Task 1.1: Define `StorageError` variants in `CoreError`
**File:** `apps/backend/crates/core/src/error.rs`

Add storage-specific error variants to `CoreError` so that both the local and S3 providers can map their errors into the domain error type. This keeps error handling consistent across all crates.

```rust
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    // ... existing variants ...

    #[error("Storage connection failed: {0}")]
    StorageConnectionFailed(String),

    #[error("Storage object not found: {0}")]
    StorageObjectNotFound(String),

    #[error("Storage permission denied: {0}")]
    StoragePermissionDenied(String),

    #[error("Storage bucket not found: {0}")]
    StorageBucketNotFound(String),

    #[error("Storage I/O error: {0}")]
    StorageIo(String),
}
```

**Acceptance Criteria:**
- [ ] Five new `Storage*` variants added to `CoreError`
- [ ] Each variant holds a `String` message for context
- [ ] Existing code continues to compile without changes
- [ ] `cargo check -p x121-core` passes

### Task 1.2: Define the `StorageProvider` trait and `StorageObject` struct
**File:** `apps/backend/crates/core/src/storage/mod.rs` (convert existing `storage.rs` to a directory module)

Convert the existing `crates/core/src/storage.rs` into a module directory (`storage/mod.rs`) so sub-modules can be added. Move all existing content into `mod.rs`, then add the `StorageProvider` trait and `StorageObject` struct.

The module restructure:
- Rename `crates/core/src/storage.rs` to `crates/core/src/storage/mod.rs`
- Add `pub mod local;` (created in Task 1.3)
- Add the trait definition in `mod.rs` alongside the existing constants/validation code

```rust
use async_trait::async_trait;
use chrono::{DateTime, Utc};

/// Metadata about a stored object.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageObject {
    pub key: String,
    pub size_bytes: i64,
    pub last_modified: Option<DateTime<Utc>>,
    pub etag: Option<String>,
}

/// Unified interface for file storage backends.
///
/// Implementations must be `Send + Sync + 'static` for use in Axum's shared state.
#[async_trait]
pub trait StorageProvider: Send + Sync + 'static {
    /// Upload data to the given key.
    async fn upload(&self, key: &str, data: &[u8]) -> Result<(), crate::error::CoreError>;

    /// Download the full contents of a key.
    async fn download(&self, key: &str) -> Result<Vec<u8>, crate::error::CoreError>;

    /// Delete the object at the given key.
    async fn delete(&self, key: &str) -> Result<(), crate::error::CoreError>;

    /// Check whether an object exists at the given key.
    async fn exists(&self, key: &str) -> Result<bool, crate::error::CoreError>;

    /// List objects under the given prefix.
    async fn list(&self, prefix: &str) -> Result<Vec<StorageObject>, crate::error::CoreError>;

    /// Generate a URL for accessing the object (presigned for S3, file:// for local).
    async fn presigned_url(
        &self,
        key: &str,
        expiry_secs: u64,
    ) -> Result<String, crate::error::CoreError>;

    /// Test that the backend is reachable and operational.
    async fn test_connection(&self) -> Result<(), crate::error::CoreError>;
}
```

**Acceptance Criteria:**
- [ ] `crates/core/src/storage.rs` converted to `crates/core/src/storage/mod.rs` with all existing code preserved
- [ ] `StorageProvider` trait defined with 7 methods: `upload`, `download`, `delete`, `exists`, `list`, `presigned_url`, `test_connection`
- [ ] Trait is `Send + Sync + 'static` (enforced by supertraits)
- [ ] `StorageObject` struct with `key`, `size_bytes`, `last_modified`, `etag` fields
- [ ] `pub mod local;` declared (module file created in next task)
- [ ] All existing tests in the storage module continue to pass
- [ ] `cargo check -p x121-core` passes

### Task 1.3: Implement `LocalStorageProvider`
**File:** `apps/backend/crates/core/src/storage/local.rs`

Implement the local filesystem storage provider using `tokio::fs`. This is the default provider for development and single-server deployments.

```rust
pub struct LocalStorageProvider {
    root_dir: std::path::PathBuf,
}

impl LocalStorageProvider {
    pub fn new(root_dir: std::path::PathBuf) -> Result<Self, CoreError> {
        // Canonicalize root_dir if it exists, or create it
        // ...
    }

    /// Resolve a key to a safe absolute path, preventing path traversal.
    fn resolve_path(&self, key: &str) -> Result<std::path::PathBuf, CoreError> {
        // Join root_dir + key, canonicalize, verify it starts with root_dir
        // ...
    }
}
```

Key behaviors:
- `upload()`: creates parent directories via `tokio::fs::create_dir_all`, then writes via `tokio::fs::write`
- `download()`: reads via `tokio::fs::read`
- `delete()`: removes file via `tokio::fs::remove_file`, then cleans up empty parent dirs
- `exists()`: uses `tokio::fs::try_exists()`
- `list(prefix)`: recursive `tokio::fs::read_dir` under `{root_dir}/{prefix}`, returns `StorageObject` with file metadata
- `presigned_url()`: returns `file://{absolute_path}`
- `test_connection()`: verifies `root_dir` exists and is writable (creates a temp file, deletes it)
- Path traversal prevention: canonicalize resolved path and verify it starts with `root_dir`

**Acceptance Criteria:**
- [ ] `LocalStorageProvider` struct with `root_dir: PathBuf` field
- [ ] Constructor `new(root_dir)` creates the directory if missing
- [ ] `resolve_path()` prevents path traversal by canonicalizing and validating
- [ ] All 7 trait methods implemented with `tokio::fs` async operations
- [ ] `upload()` creates parent directories automatically
- [ ] `delete()` cleans up empty parent directories after file removal
- [ ] Unit tests: upload+download round-trip, delete, exists (true/false), list, path traversal rejection, test_connection
- [ ] Uses `tempfile` crate in tests (already in `[dev-dependencies]`)
- [ ] `cargo test -p x121-core -- storage::local` passes (8+ tests)

---

## Phase 2: S3 Provider Implementation

### Task 2.1: Add AWS SDK and `arc-swap` workspace dependencies
**File:** `apps/backend/Cargo.toml`

Add the AWS SDK crates and `arc-swap` to the workspace dependency table.

```toml
# In [workspace.dependencies] section:
aws-sdk-s3 = "1"
aws-config = { version = "1", features = ["behavior-version-latest"] }
aws-credential-types = "1"
aws-smithy-types = "1"
arc-swap = "1"
```

**Acceptance Criteria:**
- [ ] `aws-sdk-s3`, `aws-config`, `aws-credential-types`, `aws-smithy-types` added to `[workspace.dependencies]`
- [ ] `arc-swap` added to `[workspace.dependencies]`
- [ ] `cargo check` still passes (no crate uses them yet)

### Task 2.2: Add AWS SDK dependencies to `crates/cloud/Cargo.toml`
**File:** `apps/backend/crates/cloud/Cargo.toml`

Wire the AWS SDK workspace dependencies into the cloud crate.

```toml
# Add to [dependencies]:
aws-sdk-s3 = { workspace = true }
aws-config = { workspace = true }
aws-credential-types = { workspace = true }
aws-smithy-types = { workspace = true }
```

**Acceptance Criteria:**
- [ ] Four AWS SDK dependencies added to `crates/cloud/Cargo.toml`
- [ ] `cargo check -p x121-cloud` passes

### Task 2.3: Implement `S3StorageProvider`
**File:** `apps/backend/crates/cloud/src/storage_provider.rs`

Implement the S3-compatible storage provider using the `aws-sdk-s3` crate. This replaces the presigned URL stubs in `crates/cloud/src/storage.rs`.

```rust
use aws_sdk_s3::Client;

/// Configuration for the S3 storage provider.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub path_prefix: Option<String>,
}

pub struct S3StorageProvider {
    client: Client,
    bucket: String,
    path_prefix: String,
}
```

Key behaviors:
- Constructor builds `aws_sdk_s3::Client` from `S3Config`, supporting custom endpoints for MinIO/DO Spaces/B2
- `upload()`: `PutObject` with content-type detection based on file extension (using a simple match on common extensions)
- `download()`: `GetObject`, read body into `Vec<u8>`
- `delete()`: `DeleteObject`
- `exists()`: `HeadObject`, return false on `NoSuchKey` error
- `list(prefix)`: `ListObjectsV2` with pagination (continuation tokens), prepends `path_prefix`
- `presigned_url()`: use `aws_sdk_s3::presigning::PresigningConfig` to generate a real presigned GET URL
- `test_connection()`: `HeadBucket` to verify credentials and bucket access
- All keys are prefixed with `path_prefix` (e.g., `x121/production/`) before S3 operations

**Acceptance Criteria:**
- [ ] `S3Config` struct with all fields (bucket, region, endpoint, access_key_id, secret_access_key, path_prefix)
- [ ] `S3StorageProvider` implements `StorageProvider` trait from `x121_core::storage`
- [ ] Custom endpoint support for S3-compatible services
- [ ] Content-type detection for `upload()` based on file extension
- [ ] `list()` handles pagination via continuation tokens
- [ ] `presigned_url()` generates real presigned URLs via the SDK's presigning API
- [ ] `test_connection()` uses `HeadBucket`
- [ ] `path_prefix` is prepended to all keys
- [ ] Error mapping: SDK errors mapped to `CoreError::Storage*` variants
- [ ] Module registered in `crates/cloud/src/lib.rs` as `pub mod storage_provider;`
- [ ] `cargo check -p x121-cloud` passes

### Task 2.4: Deprecate `StorageBridgeConfig` in `crates/cloud/src/storage.rs`
**File:** `apps/backend/crates/cloud/src/storage.rs`

Mark the existing `StorageBridgeConfig` and presigned URL functions as deprecated in favor of `S3StorageProvider`. Do not remove them yet to avoid breaking existing callers.

```rust
#[deprecated(
    since = "0.1.0",
    note = "Use S3StorageProvider from x121_cloud::storage_provider instead"
)]
pub struct StorageBridgeConfig { ... }
```

**Acceptance Criteria:**
- [ ] `StorageBridgeConfig` marked `#[deprecated]` with a note pointing to `S3StorageProvider`
- [ ] `generate_presigned_upload_url` and `generate_presigned_download_url` marked `#[deprecated]`
- [ ] Existing code still compiles (deprecation warnings only, no errors)
- [ ] `cargo check -p x121-cloud` passes

---

## Phase 3: Settings Registry & Database Seeding

### Task 3.1: Add S3 settings to `SETTINGS_REGISTRY`
**File:** `apps/backend/crates/core/src/settings.rs`

Add seven new settings to `SETTINGS_REGISTRY` for S3 configuration, all in the `storage` category. These will automatically appear in the admin settings panel under the "Storage" tab.

```rust
// Add after the existing storage_root entry:
SettingDefinition {
    key: "storage_backend_type",
    category: CATEGORY_STORAGE,
    label: "Active Storage Backend",
    description: "Choose 'local' for filesystem or 's3' for S3-compatible cloud storage.",
    value_type: SettingValueType::String,
    env_var: Some("STORAGE_BACKEND_TYPE"),
    default_value: Some("local"),
    requires_restart: false,
    sensitive: false,
    validation_regex: Some("^(local|s3)$"),
},
SettingDefinition {
    key: "s3_bucket",
    category: CATEGORY_STORAGE,
    label: "S3 Bucket Name",
    description: "The name of the S3 bucket to store files in.",
    value_type: SettingValueType::String,
    env_var: Some("S3_BUCKET"),
    default_value: None,
    requires_restart: false,
    sensitive: false,
    validation_regex: None,
},
// ... s3_region, s3_endpoint, s3_access_key_id, s3_secret_access_key, s3_path_prefix
```

**Acceptance Criteria:**
- [ ] 7 new settings added: `storage_backend_type`, `s3_bucket`, `s3_region`, `s3_endpoint`, `s3_access_key_id`, `s3_secret_access_key`, `s3_path_prefix`
- [ ] All in `CATEGORY_STORAGE`
- [ ] `s3_access_key_id` and `s3_secret_access_key` have `sensitive: true`
- [ ] All S3 settings have `requires_restart: false`
- [ ] `storage_backend_type` has `validation_regex: Some("^(local|s3)$")`
- [ ] `s3_region` has default `"us-east-1"`
- [ ] `s3_endpoint` uses `SettingValueType::Url` (or `String` with no validation -- since it may be empty)
- [ ] Env var fallbacks set: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PATH_PREFIX`
- [ ] Existing tests still pass; add test: `list_definitions_by_category("storage")` now returns 9 entries
- [ ] `cargo test -p x121-core -- settings` passes

### Task 3.2: Seed default "Local Storage" backend row
**File:** `apps/db/migrations/20260301000029_seed_default_local_storage_backend.sql`

Create a migration that inserts a default "Local Storage" row into `storage_backends` so that fresh installs have a working default provider.

```sql
-- PRD-122: Seed a default "Local Storage" backend if none exists.
INSERT INTO storage_backends (name, backend_type_id, status_id, tier, config, is_default)
VALUES ('Local Storage', 1, 1, 'hot', '{"root": "./storage"}', true)
ON CONFLICT DO NOTHING;
```

Note: `ON CONFLICT DO NOTHING` requires a unique constraint or primary key to trigger. Since there is no unique constraint on `name`, this needs a guard clause instead:

```sql
-- PRD-122: Seed a default "Local Storage" backend if none exists.
INSERT INTO storage_backends (name, backend_type_id, status_id, tier, config, is_default)
SELECT 'Local Storage', 1, 1, 'hot', '{"root": "./storage"}'::jsonb, true
WHERE NOT EXISTS (
    SELECT 1 FROM storage_backends WHERE is_default = true
);
```

**Acceptance Criteria:**
- [ ] Migration file created with the correct timestamp prefix (next available after existing migrations)
- [ ] Inserts a default row only if no default backend exists
- [ ] Row has: name "Local Storage", backend_type_id 1 (local), status_id 1 (active), tier "hot", is_default true
- [ ] Config JSON contains `{"root": "./storage"}`
- [ ] Migration is idempotent (safe to run multiple times)
- [ ] `sqlx migrate run` succeeds

---

## Phase 4: Factory & App State Integration

### Task 4.1: Add `arc-swap` dependency to `crates/api/Cargo.toml`
**File:** `apps/backend/crates/api/Cargo.toml`

Add `arc-swap` to the API crate's dependencies for lock-free atomic provider swapping.

```toml
arc-swap = { workspace = true }
```

**Acceptance Criteria:**
- [ ] `arc-swap` added to `[dependencies]` in `crates/api/Cargo.toml`
- [ ] `cargo check -p x121-api` passes

### Task 4.2: Implement `create_storage_provider` factory function
**File:** `apps/backend/crates/core/src/storage/factory.rs`

Create a factory module that builds the correct `StorageProvider` based on the active storage backend configuration. The factory reads from the `storage_backends` table (via a passed-in backend row) and settings service.

```rust
use std::sync::Arc;
use crate::error::CoreError;
use crate::settings::SettingsService;
use crate::storage::StorageProvider;
use crate::storage::local::LocalStorageProvider;

/// Configuration needed to build a storage provider.
///
/// This struct is populated by the caller from the database
/// (to keep `x121_core` free of database dependencies).
pub struct StorageBackendConfig {
    pub backend_type: String,   // "local" or "s3"
    pub config: serde_json::Value,
}

/// Build a storage provider from the given backend configuration.
///
/// Falls back to a `LocalStorageProvider` with the `storage_root` setting
/// if no configuration is provided.
pub fn build_provider(
    backend_config: Option<&StorageBackendConfig>,
    settings: &SettingsService,
) -> Result<Arc<dyn StorageProvider>, CoreError> {
    match backend_config.map(|c| c.backend_type.as_str()) {
        Some("s3") => {
            // Return Err indicating the S3 provider must be constructed
            // by the cloud crate (core cannot depend on aws-sdk).
            // The caller (main.rs) handles this case.
            Err(CoreError::Internal(
                "S3 provider must be built by the cloud crate. Use x121_cloud::storage_provider::S3StorageProvider::from_config()".into()
            ))
        }
        _ => {
            // Local provider: read root from backend config or settings.
            let root = backend_config
                .and_then(|c| c.config.get("root").and_then(|v| v.as_str()))
                .map(String::from)
                .unwrap_or_else(|| {
                    let (val, _) = settings.resolve("storage_root", None);
                    val
                });
            let provider = LocalStorageProvider::new(std::path::PathBuf::from(root))?;
            Ok(Arc::new(provider))
        }
    }
}
```

**Acceptance Criteria:**
- [ ] `factory.rs` module created in `crates/core/src/storage/`
- [ ] `pub mod factory;` added to `crates/core/src/storage/mod.rs`
- [ ] `StorageBackendConfig` struct defined with `backend_type` and `config` fields
- [ ] `build_provider()` function returns `LocalStorageProvider` for "local" type
- [ ] `build_provider()` returns an error for "s3" type (delegated to the cloud crate)
- [ ] Falls back to `storage_root` setting when no backend config provided
- [ ] `cargo check -p x121-core` passes

### Task 4.3: Add `storage` field to `AppState` with `ArcSwap`
**File:** `apps/backend/crates/api/src/state.rs`

Add a storage provider field to `AppState` using `arc_swap::ArcSwap` for lock-free runtime swapping.

```rust
use arc_swap::ArcSwap;
use x121_core::storage::StorageProvider;

pub struct AppState {
    // ... existing fields ...

    /// Active storage provider, swappable at runtime (PRD-122).
    pub storage: Arc<ArcSwap<dyn StorageProvider>>,
}
```

Provide a helper method for accessing the current provider:

```rust
impl AppState {
    /// Get a snapshot of the current storage provider.
    pub fn storage_provider(&self) -> arc_swap::Guard<Arc<dyn StorageProvider>> {
        self.storage.load()
    }

    /// Swap the active storage provider at runtime.
    pub fn swap_storage_provider(&self, new_provider: Arc<dyn StorageProvider>) {
        self.storage.store(new_provider);
    }
}
```

**Acceptance Criteria:**
- [ ] `storage` field added to `AppState` as `Arc<ArcSwap<dyn StorageProvider>>`
- [ ] `storage_provider()` helper returns a guard for zero-copy reads
- [ ] `swap_storage_provider()` helper performs atomic swap
- [ ] `AppState` remains `Clone` (Arc wrapping handles it)
- [ ] `cargo check -p x121-api` passes

### Task 4.4: Initialize storage provider in `main.rs` at startup
**File:** `apps/backend/crates/api/src/main.rs`

Wire the storage provider initialization into the application startup sequence. Query the default backend from the database, build the appropriate provider, and pass it to `AppState`.

Insert after the settings service creation and before the `AppState` construction:

```rust
// --- Storage provider (PRD-122) ---
let default_backend = x121_db::repositories::StorageBackendRepo::find_default(&pool).await;
let storage_provider: Arc<dyn x121_core::storage::StorageProvider> = match &default_backend {
    Ok(Some(backend)) if backend.backend_type_id == 2 => {
        // S3 backend
        let s3_config = serde_json::from_value::<x121_cloud::storage_provider::S3Config>(
            backend.config.clone(),
        ).expect("Invalid S3 config in default storage backend");
        Arc::new(
            x121_cloud::storage_provider::S3StorageProvider::new(s3_config)
                .await
                .expect("Failed to initialize S3 storage provider"),
        )
    }
    _ => {
        // Local backend (default fallback)
        let backend_config = default_backend.ok().flatten().map(|b| {
            x121_core::storage::factory::StorageBackendConfig {
                backend_type: "local".to_string(),
                config: b.config.clone(),
            }
        });
        x121_core::storage::factory::build_provider(
            backend_config.as_ref(),
            &settings_service,
        ).expect("Failed to initialize local storage provider")
    }
};
let storage = Arc::new(arc_swap::ArcSwap::from_pointee(storage_provider));
tracing::info!("Storage provider initialized");
```

Then add `storage` to the `AppState` initialization block.

**Acceptance Criteria:**
- [ ] Storage provider initialized from the default backend in the database
- [ ] Falls back to `LocalStorageProvider` if no default backend or if backend type is local
- [ ] Builds `S3StorageProvider` if default backend type is S3
- [ ] `storage` field passed to `AppState` constructor
- [ ] Application starts successfully with the default local provider
- [ ] `cargo build` passes

### Task 4.5: Add `StorageBackendRepo::find_default` method
**File:** `apps/backend/crates/db/src/repositories/storage_repo.rs`

Add a method to find the current default storage backend.

```rust
impl StorageBackendRepo {
    /// Find the default storage backend (where `is_default = true`).
    pub async fn find_default(pool: &PgPool) -> Result<Option<StorageBackend>, sqlx::Error> {
        let query = format!(
            "SELECT {BACKEND_COLUMNS} FROM storage_backends WHERE is_default = true LIMIT 1"
        );
        sqlx::query_as::<_, StorageBackend>(&query)
            .fetch_optional(pool)
            .await
    }
}
```

**Acceptance Criteria:**
- [ ] `find_default()` method added to `StorageBackendRepo`
- [ ] Returns `Option<StorageBackend>` -- `None` if no default is set
- [ ] Uses `LIMIT 1` for safety (there should only be one default)
- [ ] `cargo check -p x121-db` passes

### Task 4.6: Add `StorageBackendRepo::set_default` transactional method
**File:** `apps/backend/crates/db/src/repositories/storage_repo.rs`

Add a method that sets a backend as default in a transaction, clearing `is_default` on all other backends first.

```rust
impl StorageBackendRepo {
    /// Set a backend as the platform default. Clears `is_default` on all
    /// other backends within a transaction.
    pub async fn set_default(pool: &PgPool, id: DbId) -> Result<StorageBackend, sqlx::Error> {
        let mut tx = pool.begin().await?;

        sqlx::query("UPDATE storage_backends SET is_default = false WHERE is_default = true")
            .execute(&mut *tx)
            .await?;

        let query = format!(
            "UPDATE storage_backends SET is_default = true WHERE id = $1 RETURNING {BACKEND_COLUMNS}"
        );
        let backend = sqlx::query_as::<_, StorageBackend>(&query)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(backend)
    }
}
```

**Acceptance Criteria:**
- [ ] `set_default()` method added to `StorageBackendRepo`
- [ ] Uses a transaction to clear all `is_default` and set the new one atomically
- [ ] Returns the updated backend row
- [ ] Fails with `RowNotFound` if the ID does not exist
- [ ] `cargo check -p x121-db` passes

---

## Phase 5: API Endpoints

### Task 5.1: Add `set_default_backend` handler
**File:** `apps/backend/crates/api/src/handlers/storage.rs`

Add a handler for `PATCH /admin/storage/backends/{id}/set-default` that sets a backend as the platform default and swaps the runtime storage provider.

```rust
/// PATCH /admin/storage/backends/{id}/set-default
///
/// Set a storage backend as the platform default. Swaps the active
/// storage provider at runtime.
pub async fn set_default_backend(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify backend exists and is active.
    let backend = ensure_backend_exists(&state.pool, id).await?;

    if backend.status_id != StorageBackendStatus::Active.id() {
        return Err(AppError::BadRequest(
            "Cannot set an inactive backend as default".to_string(),
        ));
    }

    // Set as default in a transaction.
    let updated = StorageBackendRepo::set_default(&state.pool, id).await?;

    // Swap the runtime provider.
    // (build new provider based on backend type, then call state.swap_storage_provider)

    tracing::info!(
        backend_id = id,
        backend_name = %updated.name,
        admin_id = admin.user_id,
        "Default storage backend changed",
    );

    Ok(Json(DataResponse { data: updated }))
}
```

**Acceptance Criteria:**
- [ ] Handler validates backend exists and is active
- [ ] Calls `StorageBackendRepo::set_default()` in a transaction
- [ ] Builds a new provider instance based on the backend type
- [ ] Calls `state.swap_storage_provider()` to atomically swap
- [ ] Logs the change with admin_id
- [ ] Returns the updated backend in `DataResponse`
- [ ] `cargo check -p x121-api` passes

### Task 5.2: Add S3 connection test handler
**File:** `apps/backend/crates/api/src/handlers/storage.rs`

Add a handler for `POST /admin/storage/test-connection` that tests S3 connectivity with provided credentials. Supports both saved settings and draft values.

```rust
#[derive(Debug, Deserialize)]
pub struct TestS3ConnectionRequest {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
}

#[derive(Debug, Serialize)]
pub struct TestS3ConnectionResponse {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
    pub permissions: S3Permissions,
}

#[derive(Debug, Serialize)]
pub struct S3Permissions {
    pub read: bool,
    pub write: bool,
    pub delete: bool,
}

/// POST /admin/storage/test-connection
pub async fn test_s3_connection(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<TestS3ConnectionRequest>,
) -> AppResult<impl IntoResponse> {
    let start = std::time::Instant::now();

    // Build a temporary S3 provider with the provided credentials.
    // Run: HeadBucket, PutObject (test file), GetObject, DeleteObject.
    // Return success/failure with permission flags and latency.

    // ...
}
```

**Acceptance Criteria:**
- [ ] Handler accepts `TestS3ConnectionRequest` with S3 config fields
- [ ] Builds a temporary `S3StorageProvider` from the request (does not save to DB)
- [ ] Tests sequence: HeadBucket, PutObject (small test file), GetObject, DeleteObject
- [ ] Returns `TestS3ConnectionResponse` with `success`, `message`, `latency_ms`, and `permissions` object
- [ ] Permissions object reports `read`, `write`, `delete` independently
- [ ] Handles connection failures gracefully with specific error messages
- [ ] Times out after 10 seconds total
- [ ] `cargo check -p x121-api` passes

### Task 5.3: Register new routes
**File:** `apps/backend/crates/api/src/routes/storage.rs`

Add the new endpoints to the storage router.

```rust
pub fn router() -> Router<AppState> {
    Router::new()
        // ... existing routes ...
        .route(
            "/backends/{id}/set-default",
            axum::routing::patch(storage::set_default_backend),
        )
        .route(
            "/test-connection",
            post(storage::test_s3_connection),
        )
}
```

**Acceptance Criteria:**
- [ ] `PATCH /backends/{id}/set-default` route added
- [ ] `POST /test-connection` route added
- [ ] Existing routes unchanged
- [ ] `cargo check -p x121-api` passes

### Task 5.4: Add `StorageError` to `AppError` conversion
**File:** `apps/backend/crates/api/src/error.rs`

Ensure the new `CoreError::Storage*` variants map to appropriate HTTP status codes in `AppError::into_response()`.

```rust
// Inside the AppError::Core match:
CoreError::StorageConnectionFailed(msg) => {
    (StatusCode::BAD_GATEWAY, "STORAGE_CONNECTION_FAILED", msg.clone())
}
CoreError::StorageObjectNotFound(msg) => {
    (StatusCode::NOT_FOUND, "STORAGE_OBJECT_NOT_FOUND", msg.clone())
}
CoreError::StoragePermissionDenied(msg) => {
    (StatusCode::FORBIDDEN, "STORAGE_PERMISSION_DENIED", msg.clone())
}
CoreError::StorageBucketNotFound(msg) => {
    (StatusCode::BAD_REQUEST, "STORAGE_BUCKET_NOT_FOUND", msg.clone())
}
CoreError::StorageIo(msg) => {
    tracing::error!(error = %msg, "Storage I/O error");
    (StatusCode::INTERNAL_SERVER_ERROR, "STORAGE_IO_ERROR", "Storage I/O error occurred".to_string())
}
```

**Acceptance Criteria:**
- [ ] `StorageConnectionFailed` maps to HTTP 502
- [ ] `StorageObjectNotFound` maps to HTTP 404
- [ ] `StoragePermissionDenied` maps to HTTP 403
- [ ] `StorageBucketNotFound` maps to HTTP 400
- [ ] `StorageIo` maps to HTTP 500 with sanitized message
- [ ] `cargo check -p x121-api` passes

---

## Phase 6: File Upload Path Integration

### Task 6.1: Update `validate_file()` in asset registry to use `StorageProvider`
**File:** `apps/backend/crates/core/src/assets/registry.rs`

The existing `validate_file()` uses `std::fs::metadata` and `Path::exists` directly. Update it to accept an optional `StorageProvider` reference so callers can validate files in any backend. Keep backward compatibility by retaining the local filesystem path as fallback.

```rust
use crate::storage::StorageProvider;

/// Validate that the given storage key exists and compute basic metadata.
///
/// If a `provider` is given, uses it for existence and size checks.
/// Otherwise falls back to local filesystem (backward compatibility).
pub async fn validate_file_with_provider(
    key: &str,
    provider: &dyn StorageProvider,
) -> Result<FileInfo, AssetError> {
    if !provider.exists(key).await.map_err(|e| AssetError::FileNotFound(e.to_string()))? {
        return Err(AssetError::FileNotFound(key.to_string()));
    }

    // Get file info via list with the exact key prefix
    let objects = provider.list(key).await.map_err(|e| AssetError::FileNotFound(e.to_string()))?;
    let obj = objects.into_iter().find(|o| o.key == key);

    let size_bytes = obj.map(|o| o.size_bytes).unwrap_or(0);
    let checksum = format!("placeholder-sha256-{size_bytes}");

    Ok(FileInfo { size_bytes, checksum })
}
```

Keep the original `validate_file()` function unchanged for backward compatibility.

**Acceptance Criteria:**
- [ ] New `validate_file_with_provider()` async function added
- [ ] Uses `StorageProvider::exists()` and `StorageProvider::list()` for metadata
- [ ] Original `validate_file()` function remains untouched (backward compat)
- [ ] `cargo check -p x121-core` passes

### Task 6.2: Create a helper for storage-backed file serving
**File:** `apps/backend/crates/api/src/helpers/storage_serve.rs` (new file)

Create a helper module for serving files through the storage provider. For local backends, stream the file directly. For S3 backends, redirect to a presigned URL.

```rust
use axum::response::{IntoResponse, Redirect, Response};
use axum::body::Body;
use x121_core::storage::StorageProvider;

/// Serve a file from the storage provider.
///
/// For local backends, downloads and streams the file.
/// For S3 backends, could redirect to a presigned URL (configurable).
pub async fn serve_file(
    provider: &dyn StorageProvider,
    key: &str,
    content_type: Option<&str>,
) -> Result<Response, x121_core::error::CoreError> {
    let data = provider.download(key).await?;
    let mut response = Response::builder();
    if let Some(ct) = content_type {
        response = response.header("Content-Type", ct);
    }
    response = response.header("Content-Length", data.len().to_string());
    Ok(response.body(Body::from(data)).unwrap())
}

/// Generate a presigned URL for client-side download.
pub async fn presigned_download_url(
    provider: &dyn StorageProvider,
    key: &str,
    expiry_secs: u64,
) -> Result<String, x121_core::error::CoreError> {
    provider.presigned_url(key, expiry_secs).await
}
```

**Acceptance Criteria:**
- [ ] `storage_serve.rs` helper module created
- [ ] `serve_file()` function downloads bytes via provider and returns an Axum `Response`
- [ ] `presigned_download_url()` delegates to the provider's `presigned_url()` method
- [ ] Sets `Content-Type` and `Content-Length` headers on the response
- [ ] Module registered in `crates/api/src/helpers/mod.rs` (create if needed)
- [ ] `cargo check -p x121-api` passes

---

## Phase 7: Frontend Enhancements

### Task 7.1: Add `useSetDefaultBackend` and `useTestS3Connection` hooks
**File:** `apps/frontend/src/features/storage/hooks/use-storage.ts`

Add mutation hooks for the two new API endpoints.

```typescript
/** Set a storage backend as the platform default. */
export function useSetDefaultBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.patch<StorageBackend>(`/admin/storage/backends/${id}/set-default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.backends() });
    },
  });
}

/** Test S3 connection with the provided credentials. */
export function useTestS3Connection() {
  return useMutation({
    mutationFn: (input: TestS3ConnectionRequest) =>
      api.post<TestS3ConnectionResponse>("/admin/storage/test-connection", input),
  });
}
```

**Acceptance Criteria:**
- [ ] `useSetDefaultBackend` hook calls `PATCH /admin/storage/backends/{id}/set-default`
- [ ] Invalidates backend list query on success
- [ ] `useTestS3Connection` hook calls `POST /admin/storage/test-connection`
- [ ] Both hooks follow existing TanStack Query patterns (same file structure as other hooks)

### Task 7.2: Add `TestS3ConnectionRequest` and `TestS3ConnectionResponse` types
**File:** `apps/frontend/src/features/storage/types.ts`

Add TypeScript interfaces for the S3 connection test request/response.

```typescript
/** Request body for S3 connection test. */
export interface TestS3ConnectionRequest {
  bucket: string;
  region: string;
  endpoint?: string;
  access_key_id: string;
  secret_access_key: string;
}

/** Response from S3 connection test. */
export interface TestS3ConnectionResponse {
  success: boolean;
  message: string;
  latency_ms: number | null;
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };
}
```

**Acceptance Criteria:**
- [ ] `TestS3ConnectionRequest` interface added with all S3 config fields
- [ ] `TestS3ConnectionResponse` interface added with `success`, `message`, `latency_ms`, `permissions`
- [ ] Interfaces exported from the module

### Task 7.3: Add "Set as Default" button to `BackendConfigPanel`
**File:** `apps/frontend/src/features/storage/BackendConfigPanel.tsx`

Extend the backend card to show a "Set as Default" button on non-default, active backends. Clicking it opens a confirmation dialog, then calls the `useSetDefaultBackend` hook.

Changes:
- Add `onSetDefault?: (backend: StorageBackend) => void` to `BackendConfigPanelProps`
- Show a "Set as Default" button on backends where `!backend.is_default && backend.status_id === BACKEND_STATUS.ACTIVE`
- Include a confirmation dialog that warns: "New uploads will be stored in this backend. Existing files will remain in their current location."

**Acceptance Criteria:**
- [ ] "Set as Default" button appears on non-default, active backends
- [ ] Button does not appear on the current default backend
- [ ] Button does not appear on offline/decommissioned backends
- [ ] Clicking button triggers `onSetDefault` callback (parent handles confirmation dialog)
- [ ] Visual distinction for the current default backend (existing "Default" badge)
- [ ] No changes to existing card layout or functionality

### Task 7.4: Add S3 connection test UI to settings panel
**File:** `apps/frontend/src/features/settings/types.ts`

Extend `TESTABLE_VALUE_TYPES` to include a marker for S3-type settings, or handle S3 connection testing via a separate mechanism in the storage feature.

Since S3 connection testing requires multiple fields (bucket, region, key, secret) rather than a single URL, the test cannot be done per-setting. Instead, add a dedicated "Test S3 Connection" button that appears in the storage settings section when `storage_backend_type` is set to `"s3"`.

**File:** `apps/frontend/src/features/settings/components/S3ConnectionTest.tsx` (new)

```typescript
interface S3ConnectionTestProps {
  settings: PlatformSetting[];
}

export function S3ConnectionTest({ settings }: S3ConnectionTestProps) {
  // Extract S3 settings values from the settings array
  // Show "Test Connection" button
  // On click, call useTestS3Connection with the current values
  // Show success/failure inline with latency and permission summary
}
```

**Acceptance Criteria:**
- [ ] `S3ConnectionTest` component created
- [ ] Collects S3 credentials from current settings values
- [ ] Shows "Test Connection" button only when `storage_backend_type` is `"s3"`
- [ ] Displays success (green check, latency, permission summary) or failure (red X, error message)
- [ ] Loading state shown during test
- [ ] Component integrated into `SettingsPanel` in the storage tab

### Task 7.5: Conditionally show/hide S3 fields in settings panel
**File:** `apps/frontend/src/features/settings/SettingsPanel.tsx`

When the `storage_backend_type` setting is set to `"local"`, S3-specific settings (`s3_bucket`, `s3_region`, `s3_endpoint`, `s3_access_key_id`, `s3_secret_access_key`, `s3_path_prefix`) should be visually dimmed or collapsed. When set to `"s3"`, they should be fully visible and editable.

```typescript
// In the storage tab rendering logic:
const isS3Active = filteredSettings.find(
  (s) => s.key === "storage_backend_type"
)?.value === "s3";

// Filter or style S3 settings based on isS3Active
const s3Keys = new Set([
  "s3_bucket", "s3_region", "s3_endpoint",
  "s3_access_key_id", "s3_secret_access_key", "s3_path_prefix",
]);

// Render S3 settings with reduced opacity when !isS3Active
```

**Acceptance Criteria:**
- [ ] S3 settings are dimmed (reduced opacity, non-interactive) when `storage_backend_type` is `"local"`
- [ ] S3 settings are fully visible and editable when `storage_backend_type` is `"s3"`
- [ ] `S3ConnectionTest` component shown only when backend type is `"s3"`
- [ ] Non-S3 storage settings (`data_dir`, `storage_root`) always visible
- [ ] Changing `storage_backend_type` immediately updates visibility (no page refresh)

### Task 7.6: Update `BackendConfigPanel` test for "Set as Default" button
**File:** `apps/frontend/src/features/storage/__tests__/BackendConfigPanel.test.tsx`

Extend existing tests to verify the new "Set as Default" behavior.

**Acceptance Criteria:**
- [ ] Test: "Set as Default" button renders on non-default active backends
- [ ] Test: "Set as Default" button does not render on the default backend
- [ ] Test: "Set as Default" button does not render on decommissioned backends
- [ ] Test: Clicking "Set as Default" calls the `onSetDefault` callback
- [ ] Existing tests continue to pass

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/core/src/error.rs` | Add `Storage*` error variants |
| `apps/backend/crates/core/src/storage/mod.rs` | `StorageProvider` trait, `StorageObject`, existing constants/validation (converted from `storage.rs`) |
| `apps/backend/crates/core/src/storage/local.rs` | `LocalStorageProvider` implementation |
| `apps/backend/crates/core/src/storage/factory.rs` | Provider factory function |
| `apps/backend/crates/core/src/settings.rs` | 7 new S3 settings in `SETTINGS_REGISTRY` |
| `apps/backend/crates/core/src/assets/registry.rs` | `validate_file_with_provider()` function |
| `apps/backend/crates/cloud/src/storage_provider.rs` | `S3StorageProvider` and `S3Config` |
| `apps/backend/crates/cloud/src/storage.rs` | Deprecate `StorageBridgeConfig` |
| `apps/backend/crates/cloud/src/lib.rs` | Register `storage_provider` module |
| `apps/backend/crates/cloud/Cargo.toml` | Add AWS SDK dependencies |
| `apps/backend/crates/db/src/repositories/storage_repo.rs` | `find_default()` and `set_default()` methods |
| `apps/backend/crates/api/src/state.rs` | Add `storage: Arc<ArcSwap<dyn StorageProvider>>` field |
| `apps/backend/crates/api/src/main.rs` | Initialize storage provider at startup |
| `apps/backend/crates/api/src/handlers/storage.rs` | `set_default_backend` and `test_s3_connection` handlers |
| `apps/backend/crates/api/src/routes/storage.rs` | Register new routes |
| `apps/backend/crates/api/src/error.rs` | Map `Storage*` errors to HTTP codes |
| `apps/backend/crates/api/src/helpers/storage_serve.rs` | File serving helper |
| `apps/backend/crates/api/Cargo.toml` | Add `arc-swap` dependency |
| `apps/backend/Cargo.toml` | Add workspace dependencies |
| `apps/db/migrations/20260301000029_seed_default_local_storage_backend.sql` | Seed default backend |
| `apps/frontend/src/features/storage/types.ts` | Add S3 test request/response types |
| `apps/frontend/src/features/storage/hooks/use-storage.ts` | Add `useSetDefaultBackend`, `useTestS3Connection` hooks |
| `apps/frontend/src/features/storage/BackendConfigPanel.tsx` | Add "Set as Default" button |
| `apps/frontend/src/features/storage/__tests__/BackendConfigPanel.test.tsx` | Tests for "Set as Default" |
| `apps/frontend/src/features/settings/SettingsPanel.tsx` | Conditional S3 field visibility |
| `apps/frontend/src/features/settings/components/S3ConnectionTest.tsx` | S3 connection test component |

---

## Dependencies

### Existing Components to Reuse
- `StorageBackend` model and `StorageBackendRepo` CRUD from `crates/db/src/repositories/storage_repo.rs`
- `AssetLocationRepo` for tracking file locations from `crates/db/src/repositories/storage_repo.rs`
- `SettingsService` and `SETTINGS_REGISTRY` from `crates/core/src/settings.rs`
- `SettingsPanel` and `SettingRow` from `apps/frontend/src/features/settings/`
- `BackendConfigPanel` and storage hooks from `apps/frontend/src/features/storage/`
- `RequireAdmin` RBAC middleware from `crates/api/src/middleware/rbac.rs`
- `DataResponse` envelope from `crates/api/src/response.rs`
- `AppError` and `CoreError` error chain from `crates/api/src/error.rs` and `crates/core/src/error.rs`
- Storage validation functions from `crates/core/src/storage.rs` (validate_tier, validate_backend_config)
- `StorageBackendType` enum from `crates/core/src/storage.rs`

### New Infrastructure Needed
- `aws-sdk-s3`, `aws-config`, `aws-credential-types`, `aws-smithy-types` crate dependencies
- `arc-swap` crate for lock-free atomic provider swapping
- `StorageProvider` async trait (new abstraction)
- `LocalStorageProvider` (new implementation)
- `S3StorageProvider` (new implementation)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Core Trait & Error Types - Tasks 1.1-1.3
2. Phase 2: S3 Provider Implementation - Tasks 2.1-2.3
3. Phase 3: Settings Registry & Database Seeding - Tasks 3.1-3.2
4. Phase 4: Factory & App State Integration - Tasks 4.1-4.6
5. Phase 5: API Endpoints - Tasks 5.1-5.4

**MVP Success Criteria:**
- Admin can configure S3 credentials in the settings panel
- Admin can set a storage backend as the platform default via API
- Admin can test S3 connectivity via API
- Storage provider is initialized at startup and swappable at runtime
- Local filesystem provider works as the default out of the box

### Post-MVP Enhancements
1. Phase 6: File Upload Path Integration - Tasks 6.1-6.2
2. Phase 7: Frontend Enhancements - Tasks 7.1-7.6

---

## Notes

1. **`x121_core` must remain free of AWS SDK dependencies.** The `StorageProvider` trait lives in core, but `S3StorageProvider` lives in `crates/cloud`. The factory in core can only build local providers; S3 provider construction is handled by the caller (`main.rs`) using `crates/cloud`.
2. **Migration numbering:** The seed migration uses `20260301000029` as the next available number after the last existing migration (`20260301000028_cloud_cost_events.sql`). Verify this is still correct at implementation time.
3. **`storage.rs` to directory conversion:** Task 1.2 converts the existing `crates/core/src/storage.rs` single file into a `storage/mod.rs` directory module. All existing code, tests, and public API must be preserved. The `pub mod storage;` declaration in `crates/core/src/lib.rs` does not change.
4. **ArcSwap trait object compatibility:** `ArcSwap<dyn StorageProvider>` requires the trait to be object-safe. All methods in `StorageProvider` use `&self` and return concrete types (no `impl Trait` in return position except through `async_trait` desugaring), which satisfies object safety.
5. **S3 credential security:** For MVP, S3 credentials stored in `platform_settings` use the `sensitive: true` flag for API masking. Full AES-256-GCM encryption at rest (per PRD-114 infrastructure) is a separate enhancement.
6. **Existing file handlers:** The source image handler (`crates/api/src/handlers/source_image.rs`) currently stores metadata paths only (no direct file I/O). Full file upload migration to the storage provider is in Phase 6 and can be done incrementally across handlers.

---

## Version History

- **v1.0** (2026-02-28): Initial task list creation from PRD-122
