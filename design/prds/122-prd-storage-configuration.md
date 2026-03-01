# PRD-122: Storage Configuration (Local & Cloud S3)

**Document ID:** 122-prd-storage-configuration
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-02-28
**Last Updated:** 2026-02-28

---

## 1. Introduction/Overview

The platform already has comprehensive storage *metadata* infrastructure (PRD-48) -- database tables for storage backends, asset locations, tiering policies, and storage migrations; Rust models and repository CRUD for all of them; and a full frontend with `BackendConfigPanel`, `MigrationProgressView`, hooks, and types. However, none of this metadata is backed by an actual storage abstraction that can read and write files. All file I/O today goes directly to the local filesystem via `std::fs` calls scattered across handlers and core modules. The `crates/cloud/src/storage.rs` module generates presigned URL stubs but has no S3 SDK dependency.

This PRD bridges the gap between the existing metadata layer and real file operations by introducing a `StorageProvider` trait with local-filesystem and S3-compatible implementations, wiring it into the application's file upload/download paths, and exposing S3 credential configuration through the existing Admin Platform Settings panel (PRD-110). The result is that an admin can switch the platform's file storage between local disk and S3 (or any S3-compatible service like MinIO, DigitalOcean Spaces, Backblaze B2) from the settings UI without code changes or restarts.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-48** (External & Tiered Storage): Database schema, models, repositories, and frontend components for storage backends, asset locations, tiering policies, and migrations. All exist and are done.
- **PRD-110** (Admin Platform Settings Panel): Settings registry (`x121_core::settings`), `SettingsService` cache, admin settings API, frontend `SettingsPanel` with category tabs. Done.
- **PRD-00** (Data Model): `set_updated_at` trigger, ID conventions. Done.
- **PRD-02** (Backend Foundation): Axum app state, middleware, `AppError`, `DataResponse`. Done.

### Extends
- **PRD-48**: Adds actual file I/O implementations behind the existing metadata layer.
- **PRD-110**: Adds S3-related settings to the settings registry (storage category).
- **PRD-114** (Cloud GPU Provider): The `crates/cloud/src/storage.rs` presigned URL bridge will be upgraded to use the real S3 SDK.

### Related
- **PRD-15** (Disk Reclamation): File deletion now goes through the storage abstraction.
- **PRD-17** (Asset Registry): `validate_file()` in `x121_core::assets::registry` currently uses `std::fs` directly; will be updated to use the storage provider.
- **PRD-81** (Backup & Disaster Recovery): Backup file storage can leverage the new abstraction.

## 3. Goals

### Primary Goals
1. Introduce a `StorageProvider` trait that abstracts file operations (upload, download, delete, exists, list, presigned URL) behind a unified interface.
2. Implement a `LocalStorageProvider` that wraps the existing filesystem operations.
3. Implement an `S3StorageProvider` using the `aws-sdk-s3` crate for S3-compatible object storage.
4. Add S3 configuration settings (bucket, region, endpoint, access key, secret key) to the settings registry so they can be managed from the Admin Settings panel.
5. Wire the storage provider into the application state so all file operations route through the abstraction.
6. Provide a "Test Connection" button for S3 settings in the settings UI.

### Secondary Goals
1. Allow per-project storage backend overrides (project A uses local, project B uses S3).
2. Track storage usage metrics per backend (used bytes, file counts) in the existing `storage_backends` table.
3. Enable migration of existing files between backends using the existing `storage_migrations` infrastructure.

## 4. User Stories

- As an Admin, I want to configure the platform to store all generated files on S3 instead of local disk, so that I can use cloud storage for scalability and durability without modifying code or config files.
- As an Admin, I want to enter S3 credentials (bucket, region, access key, secret key) in the platform settings UI, so that I do not need SSH access to configure cloud storage.
- As an Admin, I want to test my S3 connection from the settings panel before saving, so that I know the credentials are valid and the bucket is accessible.
- As an Admin, I want to switch between local and S3 storage at any time, so that I can start with local storage for development and move to S3 for production.
- As a Creator, I want file uploads and downloads to work the same way regardless of the storage backend, so that my workflow is not affected by infrastructure changes.
- As an Admin, I want to see which storage backend is active and how much space is used, so that I can monitor storage health.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: StorageProvider Trait
**Description:** Define a Rust trait in `x121_core` that abstracts all file storage operations behind a unified interface. The trait must support both local filesystem and S3-compatible backends.

**Acceptance Criteria:**
- [ ] Trait `StorageProvider` defined in `x121_core::storage` module with methods: `upload(key, data) -> Result<()>`, `download(key) -> Result<Vec<u8>>`, `download_stream(key) -> Result<impl AsyncRead>`, `delete(key) -> Result<()>`, `exists(key) -> Result<bool>`, `list(prefix) -> Result<Vec<StorageObject>>`, `presigned_url(key, expiry) -> Result<String>`
- [ ] Trait uses `async_trait` for async method support
- [ ] `StorageObject` struct contains: `key: String`, `size_bytes: i64`, `last_modified: Option<DateTime<Utc>>`, `etag: Option<String>`
- [ ] Errors are mapped to `CoreError` variants: `StorageError::ConnectionFailed`, `StorageError::ObjectNotFound`, `StorageError::PermissionDenied`, `StorageError::BucketNotFound`, `StorageError::Io`
- [ ] Trait is `Send + Sync + 'static` for use in Axum's shared state

**Technical Notes:** Place in `crates/core/src/storage/mod.rs` alongside the trait. Keep the trait in `x121_core` (zero internal deps) so both `crates/api` and `crates/cloud` can implement it.

#### Requirement 1.2: LocalStorageProvider Implementation
**Description:** A filesystem-backed implementation of `StorageProvider` that uses `tokio::fs` for async file I/O, rooted at the configured `STORAGE_ROOT` path.

**Acceptance Criteria:**
- [ ] `LocalStorageProvider` implements `StorageProvider` in `x121_core::storage::local`
- [ ] Constructor takes a `root_dir: PathBuf` parameter (resolved from the `storage_root` setting)
- [ ] `upload()` creates parent directories automatically (`tokio::fs::create_dir_all`)
- [ ] `download()` reads the file at `{root_dir}/{key}` and returns bytes
- [ ] `download_stream()` returns a `tokio::io::BufReader<tokio::fs::File>`
- [ ] `delete()` removes the file and cleans up empty parent directories
- [ ] `exists()` uses `tokio::fs::try_exists()`
- [ ] `list(prefix)` uses `tokio::fs::read_dir` recursively under `{root_dir}/{prefix}`
- [ ] `presigned_url()` returns a local file path URL (`file://...`) for local-only use cases
- [ ] Path traversal attacks are prevented by canonicalizing and validating that resolved paths stay within `root_dir`
- [ ] Unit tests cover all methods including error cases (missing file, path traversal)

**Technical Notes:** This replaces scattered `std::fs` calls across the codebase. Existing code that uses `std::fs::metadata`, `std::fs::read`, `std::fs::write` for asset files should be migrated to use this provider.

#### Requirement 1.3: S3StorageProvider Implementation
**Description:** An S3-compatible implementation of `StorageProvider` using the official `aws-sdk-s3` crate. Works with AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, and any S3-compatible endpoint.

**Acceptance Criteria:**
- [ ] `S3StorageProvider` implements `StorageProvider` in a new module (either `x121_core::storage::s3` if the SDK dependency is acceptable in core, or `crates/cloud/src/storage_provider.rs`)
- [ ] Constructor takes `S3Config { bucket, region, endpoint, access_key_id, secret_access_key }` and builds an `aws_sdk_s3::Client`
- [ ] Custom endpoint support for S3-compatible services (MinIO, etc.) via the `endpoint_url` config
- [ ] `upload()` uses `PutObject` with content-type detection based on file extension
- [ ] `download()` uses `GetObject` and reads the body into a `Vec<u8>`
- [ ] `download_stream()` returns the `GetObject` body stream
- [ ] `delete()` uses `DeleteObject`
- [ ] `exists()` uses `HeadObject` (returns false on `NoSuchKey` error)
- [ ] `list(prefix)` uses `ListObjectsV2` with pagination
- [ ] `presigned_url()` generates a real presigned GET URL with configurable expiry (default 1 hour)
- [ ] Connection validation method: `test_connection() -> Result<()>` that calls `HeadBucket` to verify credentials and bucket access
- [ ] Workspace `Cargo.toml` adds `aws-sdk-s3` and `aws-config` dependencies

**Technical Notes:** The `crates/cloud/src/storage.rs` presigned URL stub should be replaced by this real implementation. Keep the `StorageBridgeConfig` struct for backward compatibility but mark it as deprecated in favor of `S3Config`.

#### Requirement 1.4: Storage Provider Factory & App State Integration
**Description:** A factory function that reads the active storage configuration and instantiates the correct `StorageProvider` implementation. The provider instance is stored in `AppState` as `Arc<dyn StorageProvider>`.

**Acceptance Criteria:**
- [ ] Factory function `create_storage_provider(settings: &SettingsService, pool: &PgPool) -> Result<Arc<dyn StorageProvider>>` in `x121_core::storage`
- [ ] Reads the active default backend from `storage_backends` table (where `is_default = true`)
- [ ] If backend type is "local" (type_id 1), creates `LocalStorageProvider` with `storage_root` from settings
- [ ] If backend type is "s3" (type_id 2), creates `S3StorageProvider` with credentials from the backend's `config` JSONB column
- [ ] `AppState` struct in `crates/api/src/state.rs` gains a `storage: Arc<dyn StorageProvider>` field
- [ ] Provider is initialized during application startup in `main.rs`
- [ ] If no default backend exists, falls back to `LocalStorageProvider` with the `storage_root` setting
- [ ] Provider can be swapped at runtime via a `swap_provider()` method on `AppState` (using `Arc<RwLock<Arc<dyn StorageProvider>>>` or `ArcSwap`)

**Technical Notes:** Use `arc-swap` crate for lock-free atomic provider swapping, avoiding read-lock overhead on every request.

#### Requirement 1.5: S3 Settings in Settings Registry
**Description:** Add S3 configuration settings to the platform settings registry (PRD-110) so admins can configure S3 credentials from the settings UI under the "Storage" category tab.

**Acceptance Criteria:**
- [ ] New settings added to `SETTINGS_REGISTRY` in `x121_core::settings`:
  - `storage_backend_type` (String, category: storage, default: "local", label: "Active Storage Backend", description: "Choose 'local' for filesystem or 's3' for S3-compatible cloud storage.")
  - `s3_bucket` (String, category: storage, default: none, label: "S3 Bucket Name")
  - `s3_region` (String, category: storage, default: "us-east-1", label: "S3 Region")
  - `s3_endpoint` (Url, category: storage, default: none, label: "S3 Endpoint URL", description: "Custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces). Leave empty for AWS S3.")
  - `s3_access_key_id` (String, category: storage, sensitive: true, label: "S3 Access Key ID")
  - `s3_secret_access_key` (String, category: storage, sensitive: true, label: "S3 Secret Access Key")
  - `s3_path_prefix` (String, category: storage, default: "", label: "S3 Path Prefix", description: "Optional prefix for all object keys (e.g. 'x121/production/').")
- [ ] `s3_access_key_id` and `s3_secret_access_key` are marked `sensitive: true` (values masked in API responses)
- [ ] All S3 settings have `requires_restart: false` (provider swaps at runtime)
- [ ] Settings are visible under the "Storage" tab in the settings panel
- [ ] Env var fallbacks: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PATH_PREFIX`

**Technical Notes:** The `SettingValueType` enum may need a new variant or these can use existing `String`/`Url` types with appropriate validation regex.

#### Requirement 1.6: S3 Connection Test Endpoint
**Description:** Extend the existing connection test infrastructure (PRD-110 Req 1.7) to support testing S3 connectivity from the settings panel.

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/settings/s3_bucket/actions/test` (or a dedicated `POST /api/v1/admin/storage/test-connection`) accepts S3 config and tests connectivity
- [ ] Test performs: (1) build S3 client with provided credentials, (2) `HeadBucket` to verify bucket exists and credentials are valid, (3) `PutObject` with a small test file, (4) `GetObject` to verify read access, (5) `DeleteObject` to clean up
- [ ] Returns `{ data: { success: bool, message: string, latency_ms: number, permissions: { read: bool, write: bool, delete: bool } } }`
- [ ] Accepts either saved settings or draft values passed in the request body (test before saving)
- [ ] Frontend "Test Connection" button appears next to S3 settings when `storage_backend_type` is set to "s3"
- [ ] Shows success (green check, latency, permission summary) or failure (red X, specific error message) inline

**Technical Notes:** Reuse the connection test UI pattern from PRD-110's `SettingRow` component. The backend test handler can be a new admin-only endpoint.

#### Requirement 1.7: Default Backend Seeding & Migration
**Description:** Ensure a default "local" storage backend row exists in the `storage_backends` table on fresh installs, and provide a mechanism to set the default backend.

**Acceptance Criteria:**
- [ ] New migration seeds a default row: `INSERT INTO storage_backends (name, backend_type_id, status_id, tier, config, is_default) VALUES ('Local Storage', 1, 1, 'hot', '{"root": "./storage"}', true) ON CONFLICT DO NOTHING`
- [ ] `PATCH /api/v1/admin/storage/backends/:id` supports setting `is_default: true` (automatically clears `is_default` on all other backends in a transaction)
- [ ] `POST /api/v1/admin/storage/backends` endpoint for creating a new S3 backend (already exists in PRD-48 code)
- [ ] When the default backend is changed, the storage provider is swapped at runtime
- [ ] Frontend `BackendConfigPanel` shows a "Set as Default" button on non-default backends
- [ ] Changing default backend shows a confirmation dialog warning that new uploads will go to the new backend

**Technical Notes:** The existing `StorageBackendRepo::update()` already supports `is_default`. Add a transaction to ensure only one backend is default at a time.

#### Requirement 1.8: File Upload Path Integration
**Description:** Wire the `StorageProvider` into the primary file upload/save code paths so that files are stored in the active backend.

**Acceptance Criteria:**
- [ ] Image upload handlers (PRD-21 source images, PRD-22 QA) use `StorageProvider::upload()` instead of direct filesystem writes
- [ ] Video segment output from the generation pipeline is saved through the storage provider
- [ ] Asset registration (`x121_core::assets::registry::validate_file()`) is updated to use the storage provider for file existence and metadata checks
- [ ] `AssetLocation` records are created in the database for each stored file, linking the file to its backend
- [ ] File download/serving endpoints use `StorageProvider::download()` or serve presigned URLs for S3 backends
- [ ] For S3 backends, large file uploads use multipart upload (files > 100 MB)
- [ ] For S3 backends, downloads can redirect to presigned URLs to avoid proxying through the backend

**Technical Notes:** This is the largest integration task. Prioritize the most-used paths (image upload, video output) first. Less-used paths (backup exports, sidecar exports) can be migrated incrementally.

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Storage Migration Execution
**Description:** Wire the existing `StorageMigration` infrastructure (PRD-48) to actually transfer files between backends using the storage providers.
**Acceptance Criteria:**
- [ ] Migration engine reads from source provider and writes to target provider
- [ ] Checksum verification after each file transfer
- [ ] Progress tracking via the existing `StorageMigrationRepo::update_progress()`
- [ ] Frontend `MigrationProgressView` shows real-time progress
- [ ] Rollback support: if migration fails, moved files are deleted from target

#### Requirement 2.2: Per-Project Storage Override
**Description:** Allow individual projects to use a different storage backend than the platform default.
**Acceptance Criteria:**
- [ ] `storage_backends.project_id` column (already exists) is used to assign backends to projects
- [ ] Storage provider resolution checks project-specific backend first, then falls back to default
- [ ] Project settings UI includes a storage backend selector

#### Requirement 2.3: NFS/SMB Support
**Description:** Implement the NFS backend type (type_id 3) already seeded in the database.
**Acceptance Criteria:**
- [ ] `NfsStorageProvider` that mounts or uses a pre-mounted NFS path
- [ ] Configuration: mount point path, read/write permissions
- [ ] Falls back to local filesystem operations on the mounted path

#### Requirement 2.4: Storage Usage Dashboard
**Description:** Real-time storage usage metrics per backend with alerts on capacity thresholds.
**Acceptance Criteria:**
- [ ] Background job periodically scans backends and updates `used_bytes` and file counts
- [ ] Dashboard widget on the admin home page showing usage per backend
- [ ] Configurable alerts when usage exceeds threshold (e.g., 80%, 90%)

## 6. Non-Functional Requirements

### Performance
- Local storage operations must have less than 5ms overhead compared to direct `std::fs` calls.
- S3 operations should use connection pooling and keep-alive connections.
- Presigned URL generation must complete in under 10ms (no network calls needed for signing).
- File downloads from S3 should support streaming to avoid loading entire files into memory.
- Large file uploads (>100 MB) must use S3 multipart upload to avoid timeouts.

### Security
- S3 credentials (`access_key_id`, `secret_access_key`) must be stored encrypted at rest in the database (using the existing AES-256-GCM infrastructure from PRD-114).
- S3 credentials must be masked in API responses (`sensitive: true`).
- Presigned URLs must have a configurable expiry (default 1 hour, maximum 7 days).
- Path traversal attacks in the local provider must be prevented by canonicalization.
- S3 bucket policies should be validated to ensure the provided credentials have the minimum required permissions.

### Reliability
- If the configured S3 backend is unreachable, the system must log errors and surface them in the admin UI rather than silently failing.
- File operations must be retried with exponential backoff for transient S3 errors (HTTP 503, network timeouts).
- The system must gracefully degrade if the storage provider is unavailable (queue uploads for retry rather than losing data).

## 7. Non-Goals (Out of Scope)

- **File deduplication**: Content-addressable storage or deduplication is not part of this PRD.
- **CDN integration**: Serving files via CloudFront or another CDN is out of scope.
- **Client-side direct upload**: Browser-to-S3 direct uploads (bypassing the backend) are post-MVP.
- **Multi-region replication**: S3 cross-region replication is managed at the AWS level, not by this system.
- **Azure Blob / GCS**: Only S3-compatible storage is in scope for MVP. Other cloud providers are future enhancements.
- **Automatic tiering execution**: Policy-driven automatic file movement (PRD-48 Req 1.2) is tracked separately; this PRD provides the underlying file transfer mechanism.
- **Backup storage**: Backup file storage (PRD-81) may use this abstraction but is not modified by this PRD.

## 8. Design Considerations

- **Settings Panel Integration**: S3 configuration appears under the existing "Storage" tab in the admin settings panel. When `storage_backend_type` is set to "local", S3 fields are grayed out or hidden. When set to "s3", S3 fields become required and a "Test Connection" button appears.
- **Backend Config Panel Reuse**: The existing `BackendConfigPanel` component (PRD-48) displays storage backends with status badges, tier indicators, and capacity bars. Extend it with a "Set as Default" action and visual distinction for the active default backend.
- **Provider Status Indicator**: The System Status Footer Bar (PRD-117) should show the active storage backend type (local/S3) with a health indicator.
- **Confirmation on Switch**: Switching the default backend should show a confirmation dialog explaining that existing files remain in their original location and only new uploads go to the new backend.

## 9. Technical Considerations

### Existing Code to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| `StorageBackend` model | `crates/db/src/models/storage.rs` | Full reuse -- no changes needed |
| `StorageBackendRepo` | `crates/db/src/repositories/storage_repo.rs` | Full reuse -- CRUD already works |
| `AssetLocationRepo` | `crates/db/src/repositories/storage_repo.rs` | Full reuse for tracking file locations |
| `StorageMigrationRepo` | `crates/db/src/repositories/storage_repo.rs` | Reuse for Phase 2 migration execution |
| `BackendConfigPanel` | `apps/frontend/src/features/storage/BackendConfigPanel.tsx` | Extend with "Set as Default" action |
| `MigrationProgressView` | `apps/frontend/src/features/storage/MigrationProgressView.tsx` | Reuse in Phase 2 |
| Frontend hooks | `apps/frontend/src/features/storage/hooks/use-storage.ts` | Full reuse -- all CRUD hooks exist |
| Frontend types | `apps/frontend/src/features/storage/types.ts` | Full reuse -- `BACKEND_TYPE`, `BACKEND_STATUS` constants, interfaces |
| `SettingsService` | `crates/core/src/settings.rs` | Extend registry with S3 settings |
| `SettingsPanel` | `apps/frontend/src/features/settings/SettingsPanel.tsx` | S3 settings appear here automatically |
| `StorageBridgeConfig` | `crates/cloud/src/storage.rs` | Replace with real S3 implementation |
| AES-256-GCM crypto | `crates/cloud` (PRD-114) | Reuse for encrypting S3 credentials at rest |

### New Code Required

| Component | Location | Description |
|-----------|----------|-------------|
| `StorageProvider` trait | `crates/core/src/storage/mod.rs` | Async trait with upload/download/delete/exists/list/presigned_url |
| `LocalStorageProvider` | `crates/core/src/storage/local.rs` | tokio::fs-based implementation |
| `S3StorageProvider` | `crates/cloud/src/storage_provider.rs` | aws-sdk-s3 implementation |
| Storage factory | `crates/core/src/storage/factory.rs` | Reads config, returns `Arc<dyn StorageProvider>` |
| S3 connection test handler | `crates/api/src/handlers/storage.rs` | Admin endpoint for testing S3 connectivity |
| Storage settings entries | `crates/core/src/settings.rs` | 7 new entries in `SETTINGS_REGISTRY` |

### Database Changes

- **New migration**: Seed a default "Local Storage" backend row in `storage_backends` if none exists:
  ```sql
  INSERT INTO storage_backends (name, backend_type_id, status_id, tier, config, is_default)
  VALUES ('Local Storage', 1, 1, 'hot', '{"root": "./storage"}', true)
  ON CONFLICT DO NOTHING;
  ```
- **No new tables**: All required tables already exist from PRD-48 migrations.
- **ID Strategy**: Existing tables already use `BIGSERIAL id`. No UUID column is present on `storage_backends` -- consider adding `uuid UUID NOT NULL DEFAULT gen_random_uuid()` for external API exposure in a separate migration if needed.

### API Changes

| Method | Endpoint | Description | New? |
|--------|----------|-------------|------|
| POST | `/api/v1/admin/storage/test-connection` | Test S3 connectivity with provided or saved credentials | Yes |
| PATCH | `/api/v1/admin/storage/backends/:id/set-default` | Set a backend as the platform default | Yes |
| GET | `/api/v1/admin/storage/backends` | List all backends | Exists (PRD-48) |
| POST | `/api/v1/admin/storage/backends` | Create a new backend | Exists (PRD-48) |
| PATCH | `/api/v1/admin/storage/backends/:id` | Update a backend | Exists (PRD-48) |

### Workspace Dependencies

Add to `apps/backend/Cargo.toml` `[workspace.dependencies]`:
```toml
aws-sdk-s3 = "1"
aws-config = { version = "1", features = ["behavior-version-latest"] }
aws-credential-types = "1"
arc-swap = "1"
```

Add to `crates/cloud/Cargo.toml` `[dependencies]`:
```toml
aws-sdk-s3 = { workspace = true }
aws-config = { workspace = true }
aws-credential-types = { workspace = true }
```

Add to `crates/api/Cargo.toml` or `crates/core/Cargo.toml`:
```toml
arc-swap = { workspace = true }
```

## 10. Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| S3 credentials are invalid | `test_connection()` returns clear error message ("AccessDenied: invalid credentials"); upload attempts log error and return HTTP 502 |
| S3 bucket does not exist | `test_connection()` returns "BucketNotFound"; settings panel shows error inline |
| S3 endpoint is unreachable | Connection timeout after 5 seconds; error surfaced in settings test and upload handlers |
| Switch from S3 to local mid-operation | In-flight S3 uploads complete; new uploads go to local; no data loss |
| Local storage root directory missing | `LocalStorageProvider` creates it on first upload; logs warning |
| File key contains path traversal (`../../etc/passwd`) | `LocalStorageProvider` canonicalizes path and rejects keys that escape `root_dir` |
| S3 rate limiting (HTTP 429/503) | Retry with exponential backoff (3 attempts, 1s/2s/4s delays) |
| Very large file upload (>5 GB) | S3 multipart upload with 100 MB parts; local provider streams to disk |
| Concurrent default backend switch | `ArcSwap` ensures atomic swap; in-flight operations use the provider they started with |
| S3 object not found during download | Return HTTP 404 with `{ error: { code: "STORAGE_OBJECT_NOT_FOUND", message: "..." } }` |
| Network partition during S3 upload | Upload fails; file is queued for retry; asset location is not created in DB until upload succeeds |

## 11. Success Metrics

- Admin can configure S3 as the default storage backend and upload files within 5 minutes of setup.
- S3 connection test completes in under 3 seconds.
- File upload latency overhead (abstraction layer) is under 5ms for local storage.
- Zero data loss during storage backend switches.
- S3 presigned URLs are generated in under 10ms.
- All existing file upload/download paths work unchanged after migrating to the storage abstraction.
- Storage backend status is visible in the admin UI at all times.

## 12. Testing Requirements

### Unit Tests (x121_core)
- `LocalStorageProvider`: upload, download, delete, exists, list, path traversal prevention (8+ tests)
- `S3StorageProvider`: mock-based tests for upload, download, delete, presigned URL generation (6+ tests)
- Storage factory: correct provider selection based on config (3+ tests)

### Integration Tests (crates/api)
- End-to-end file upload with local provider (2+ tests)
- S3 connection test endpoint with mock S3 (2+ tests)
- Set-default-backend endpoint with provider swap verification (2+ tests)
- Settings registry includes all S3 settings (1 test)

### Frontend Tests
- BackendConfigPanel renders "Set as Default" button on non-default backends (1 test)
- S3 settings fields appear when backend type is "s3" (1 test)
- Connection test button shows success/failure states (2 tests)
- Default backend switch shows confirmation dialog (1 test)

## 13. Open Questions

1. **Credential encryption**: Should S3 credentials stored in `platform_settings` use the existing AES-256-GCM encryption from PRD-114, or is database-level encryption sufficient for MVP?
2. **S3 provider placement**: Should `S3StorageProvider` live in `crates/cloud` (which already has S3 stubs) or in a new `crates/storage` crate? Placing it in `crates/cloud` keeps the `aws-sdk-s3` dependency contained but adds a dependency from `crates/api` on `crates/cloud`.
3. **Presigned URL strategy for downloads**: Should the backend proxy S3 downloads (allows access control) or redirect to presigned URLs (better performance, less server load)?
4. **Migration of existing files**: When switching from local to S3, should existing files be automatically migrated in the background, or left in place with a manual migration trigger?

## 14. Version History

- **v1.0** (2026-02-28): Initial PRD creation. Covers storage abstraction trait, local + S3 implementations, settings integration, and admin UI wiring.
