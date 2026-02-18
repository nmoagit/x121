# Task List: External & Tiered Storage

**PRD Reference:** `design/prds/048-prd-external-tiered-storage.md`
**Scope:** Build a pluggable storage abstraction layer with local, S3, and NFS/SMB backends; policy-driven automatic tiering between hot and cold storage; transparent access with retrieval indicators; and bulk migration tools with integrity verification.

## Overview

This PRD extends the platform's storage model from single-tier local disk to multi-tier storage with pluggable backends. The storage abstraction layer provides a unified interface (read, write, delete, exists) regardless of whether a file lives on local SSD, S3, or NFS. Tiering policies automatically move cold assets (old, approved, infrequently accessed) off hot storage while keeping metadata and thumbnails always local. When a user accesses a cold asset, it is transparently retrieved and cached.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Entity tables with file path columns
- PRD-015: Disk reclamation policies (foundation for tiering rules)

### What We're Building
1. Storage backend abstraction trait (Rust trait with local/S3/NFS implementations)
2. Storage backend configuration tables
3. Tiering policy engine (age, status, access frequency rules)
4. Transparent retrieval service with temporary caching
5. Bulk migration tools with checksum verification
6. Admin UI for backend configuration and migration progress

### Key Design Decisions
1. **Trait-based abstraction** — A `StorageBackend` trait with `read`, `write`, `delete`, `exists`, `size` methods. Each backend implements the trait. All file operations go through the trait.
2. **Metadata always local** — Only binary assets (videos, images, model files) are tiered. Database records, JSON metadata, and thumbnails remain on local storage always.
3. **Lazy retrieval with cache** — Cold assets are not pre-fetched. They are retrieved on access and cached locally with a configurable TTL.
4. **Asset location table** — Instead of updating file paths in entity tables, a separate `asset_locations` table maps entity files to their current storage backend and path. Entity tables keep their original path as a logical reference.

---

## Phase 1: Database Schema

### Task 1.1: Storage Backends Configuration
**File:** `migrations/{timestamp}_create_storage_backends.sql`

```sql
CREATE TABLE storage_backend_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_backend_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO storage_backend_types (name, description) VALUES
    ('local', 'Local filesystem storage'),
    ('s3', 'S3-compatible object storage (AWS S3, MinIO, etc.)'),
    ('nfs', 'NFS/SMB network-attached storage');

CREATE TABLE storage_backend_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_backend_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO storage_backend_statuses (name, description) VALUES
    ('active', 'Backend is available and accepting operations'),
    ('read_only', 'Backend is available for reads but not writes'),
    ('offline', 'Backend is temporarily unavailable'),
    ('decommissioned', 'Backend is being migrated off and will be removed');

CREATE TABLE storage_backends (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    backend_type_id BIGINT NOT NULL REFERENCES storage_backend_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES storage_backend_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tier TEXT NOT NULL DEFAULT 'hot',     -- 'hot' or 'cold'
    config JSONB NOT NULL,               -- backend-specific config (bucket, endpoint, mount path, etc.)
    is_default BOOLEAN NOT NULL DEFAULT false,
    total_capacity_bytes BIGINT,
    used_bytes BIGINT NOT NULL DEFAULT 0,
    project_id BIGINT NULL,              -- NULL = global, set = project-specific
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_backends_type_id ON storage_backends(backend_type_id);
CREATE INDEX idx_storage_backends_status_id ON storage_backends(status_id);
CREATE INDEX idx_storage_backends_tier ON storage_backends(tier);
CREATE INDEX idx_storage_backends_project_id ON storage_backends(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_backends
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Backend types: local, s3, nfs
- [ ] Backend statuses: active, read_only, offline, decommissioned
- [ ] Config JSONB stores backend-specific settings (bucket, endpoint, credentials ref, mount path)
- [ ] Tier designation: hot or cold
- [ ] `is_default` flag for default write target
- [ ] Migration applies cleanly

### Task 1.2: Asset Locations Table
**File:** `migrations/{timestamp}_create_asset_locations.sql`

Map entity files to their current storage location.

```sql
CREATE TABLE asset_locations (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    file_field TEXT NOT NULL,             -- which field on the entity (e.g., 'output_video_path')
    backend_id BIGINT NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    storage_path TEXT NOT NULL,           -- path within the backend (S3 key, NFS path, local path)
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    checksum_sha256 TEXT,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_asset_locations_entity_field
    ON asset_locations(entity_type, entity_id, file_field);
CREATE INDEX idx_asset_locations_backend_id ON asset_locations(backend_id);
CREATE INDEX idx_asset_locations_last_accessed ON asset_locations(last_accessed_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_locations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Maps each entity file field to a storage backend + path
- [ ] Unique per entity + field (one location per file)
- [ ] Tracks access frequency for tiering decisions
- [ ] Checksum for migration integrity
- [ ] Migration applies cleanly

### Task 1.3: Tiering Policies Table
**File:** `migrations/{timestamp}_create_tiering_policies.sql`

```sql
CREATE TABLE tiering_policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    source_tier TEXT NOT NULL DEFAULT 'hot',  -- tier to move FROM
    target_tier TEXT NOT NULL DEFAULT 'cold', -- tier to move TO
    target_backend_id BIGINT NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    condition_field TEXT NOT NULL,
    condition_operator TEXT NOT NULL,
    condition_value TEXT NOT NULL,
    age_threshold_days INTEGER,           -- files older than N days
    access_threshold_days INTEGER,        -- files not accessed in N days
    project_id BIGINT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiering_policies_target_backend ON tiering_policies(target_backend_id);
CREATE INDEX idx_tiering_policies_project_id ON tiering_policies(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tiering_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Policies define source tier, target tier, and target backend
- [ ] Conditions based on entity status, age, access frequency
- [ ] Configurable at studio and project level
- [ ] Migration applies cleanly

### Task 1.4: Migration Jobs Table
**File:** `migrations/{timestamp}_create_storage_migrations.sql`

Track bulk migration operations.

```sql
CREATE TABLE storage_migration_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_migration_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO storage_migration_statuses (name, description) VALUES
    ('pending', 'Migration queued'),
    ('in_progress', 'Migration actively transferring files'),
    ('verifying', 'Verifying checksums after transfer'),
    ('completed', 'Migration completed successfully'),
    ('failed', 'Migration failed'),
    ('rolled_back', 'Migration rolled back after failure');

CREATE TABLE storage_migrations (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES storage_migration_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_backend_id BIGINT NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    target_backend_id BIGINT NOT NULL REFERENCES storage_backends(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    total_files INTEGER NOT NULL DEFAULT 0,
    transferred_files INTEGER NOT NULL DEFAULT 0,
    verified_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    transferred_bytes BIGINT NOT NULL DEFAULT 0,
    error_log JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    initiated_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_migrations_status_id ON storage_migrations(status_id);
CREATE INDEX idx_storage_migrations_source ON storage_migrations(source_backend_id);
CREATE INDEX idx_storage_migrations_target ON storage_migrations(target_backend_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_migrations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks migration progress: total, transferred, verified, failed
- [ ] Links source and target backends
- [ ] Error log for failed file transfers
- [ ] Migration applies cleanly

---

## Phase 2: Storage Abstraction Layer

### Task 2.1: Storage Backend Trait
**File:** `src/storage/backend.rs`

```rust
use async_trait::async_trait;
use std::path::Path;

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn read(&self, path: &str) -> Result<Vec<u8>, StorageError>;
    async fn write(&self, path: &str, data: &[u8]) -> Result<(), StorageError>;
    async fn delete(&self, path: &str) -> Result<(), StorageError>;
    async fn exists(&self, path: &str) -> Result<bool, StorageError>;
    async fn size(&self, path: &str) -> Result<u64, StorageError>;
    async fn copy_to(&self, path: &str, target: &dyn StorageBackend, target_path: &str) -> Result<(), StorageError>;
    fn backend_type(&self) -> &str;
}
```

**Acceptance Criteria:**
- [ ] Trait defines all required operations: read, write, delete, exists, size, copy_to
- [ ] All methods are async
- [ ] Trait is Send + Sync for use across tokio tasks

### Task 2.2: Local Filesystem Backend
**File:** `src/storage/local_backend.rs`

```rust
pub struct LocalBackend {
    pub base_path: String,
}

#[async_trait]
impl StorageBackend for LocalBackend {
    async fn read(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let full_path = std::path::Path::new(&self.base_path).join(path);
        tokio::fs::read(&full_path).await.map_err(StorageError::Io)
    }

    async fn write(&self, path: &str, data: &[u8]) -> Result<(), StorageError> {
        let full_path = std::path::Path::new(&self.base_path).join(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&full_path, data).await.map_err(StorageError::Io)
    }

    // ... other methods
}
```

**Acceptance Criteria:**
- [ ] All trait methods implemented for local filesystem
- [ ] Handles directory creation on write
- [ ] Returns appropriate errors for missing files

### Task 2.3: S3 Backend
**File:** `src/storage/s3_backend.rs`

```rust
pub struct S3Backend {
    pub client: aws_sdk_s3::Client,
    pub bucket: String,
    pub prefix: String,
}

#[async_trait]
impl StorageBackend for S3Backend {
    async fn read(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let key = format!("{}{}", self.prefix, path);
        let resp = self.client.get_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await?;
        let bytes = resp.body.collect().await?.into_bytes();
        Ok(bytes.to_vec())
    }
    // ... other methods
}
```

**Acceptance Criteria:**
- [ ] All trait methods implemented for S3
- [ ] Supports configurable bucket, prefix, endpoint (for MinIO)
- [ ] Handles large files with multipart upload
- [ ] Proper error handling for S3 API errors

### Task 2.4: NFS/SMB Backend
**File:** `src/storage/nfs_backend.rs`

```rust
pub struct NfsBackend {
    pub mount_path: String,
}

// Essentially a LocalBackend with a different base path (the NFS mount point)
#[async_trait]
impl StorageBackend for NfsBackend {
    // Same as LocalBackend but with mount_path as base
}
```

**Acceptance Criteria:**
- [ ] Implemented as filesystem operations on the mount point
- [ ] Verifies mount is accessible before operations
- [ ] Returns appropriate error if mount is offline

### Task 2.5: Backend Registry
**File:** `src/storage/registry.rs`

Manage backend instances from database configuration.

```rust
pub struct StorageRegistry {
    backends: std::collections::HashMap<DbId, Arc<dyn StorageBackend>>,
}

impl StorageRegistry {
    pub async fn from_database(pool: &PgPool) -> Result<Self, StorageError> {
        let configs = sqlx::query!("SELECT * FROM storage_backends WHERE status_id = (SELECT id FROM storage_backend_statuses WHERE name = 'active')")
            .fetch_all(pool)
            .await?;

        let mut backends = std::collections::HashMap::new();
        for config in configs {
            let backend = create_backend_from_config(&config)?;
            backends.insert(config.id, backend);
        }

        Ok(Self { backends })
    }

    pub fn get(&self, backend_id: DbId) -> Option<&Arc<dyn StorageBackend>> {
        self.backends.get(&backend_id)
    }
}
```

**Acceptance Criteria:**
- [ ] Loads backend configurations from database
- [ ] Creates appropriate backend instance per type
- [ ] Provides lookup by backend ID
- [ ] Only loads active backends

---

## Phase 3: Tiering Engine

### Task 3.1: Tiering Policy Evaluator
**File:** `src/storage/tiering.rs`

Identify assets eligible for tier movement.

```rust
pub async fn find_tiering_candidates(
    pool: &PgPool,
) -> Result<Vec<TieringCandidate>, StorageError> {
    let policies = load_active_policies(pool).await?;
    let mut candidates = Vec::new();

    for policy in &policies {
        let assets = find_assets_matching_policy(pool, policy).await?;
        for asset in assets {
            // Verify not already on target tier
            if asset.current_tier != policy.target_tier {
                candidates.push(TieringCandidate {
                    asset_location_id: asset.id,
                    entity_type: asset.entity_type,
                    entity_id: asset.entity_id,
                    current_backend_id: asset.backend_id,
                    target_backend_id: policy.target_backend_id,
                    file_size_bytes: asset.file_size_bytes,
                    policy_id: policy.id,
                });
            }
        }
    }

    Ok(candidates)
}
```

**Acceptance Criteria:**
- [ ] Evaluates all active tiering policies
- [ ] Identifies assets matching age, status, and access criteria
- [ ] Excludes assets already on the target tier
- [ ] Returns candidates with source and target backend info

### Task 3.2: Tier Movement Executor
**File:** `src/storage/tiering.rs`

Move assets between tiers.

```rust
pub async fn execute_tier_movement(
    pool: &PgPool,
    registry: &StorageRegistry,
    candidate: &TieringCandidate,
) -> Result<(), StorageError> {
    let source = registry.get(candidate.current_backend_id).ok_or(StorageError::BackendNotFound)?;
    let target = registry.get(candidate.target_backend_id).ok_or(StorageError::BackendNotFound)?;

    let location = get_asset_location(pool, candidate.asset_location_id).await?;

    // Copy to target
    source.copy_to(&location.storage_path, target.as_ref(), &location.storage_path).await?;

    // Verify checksum on target
    let target_data = target.read(&location.storage_path).await?;
    let target_checksum = sha256_hex(&target_data);
    if Some(&target_checksum) != location.checksum_sha256.as_ref() {
        target.delete(&location.storage_path).await?;
        return Err(StorageError::ChecksumMismatch);
    }

    // Update location record
    update_asset_location(pool, candidate.asset_location_id, candidate.target_backend_id).await?;

    // Delete from source
    source.delete(&location.storage_path).await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Copies file to target backend
- [ ] Verifies checksum after copy (100% match per success metric)
- [ ] Updates asset_locations record
- [ ] Deletes from source only after verification
- [ ] Rolls back on checksum mismatch

---

## Phase 4: Transparent Access & Caching

### Task 4.1: Asset Access Service
**File:** `src/storage/access.rs`

Transparently serve assets regardless of tier.

```rust
pub async fn access_asset(
    pool: &PgPool,
    registry: &StorageRegistry,
    entity_type: &str,
    entity_id: DbId,
    file_field: &str,
) -> Result<AssetAccessResult, StorageError> {
    let location = get_asset_location_by_entity(pool, entity_type, entity_id, file_field).await?;
    let backend = registry.get(location.backend_id).ok_or(StorageError::BackendNotFound)?;

    // Update access tracking
    update_access_tracking(pool, location.id).await?;

    // If on hot storage, return directly
    if is_hot_backend(pool, location.backend_id).await? {
        return Ok(AssetAccessResult::Available {
            path: location.storage_path,
            backend_id: location.backend_id,
        });
    }

    // Cold storage: check cache first
    if let Some(cached_path) = check_retrieval_cache(&location).await? {
        return Ok(AssetAccessResult::Available {
            path: cached_path,
            backend_id: location.backend_id,
        });
    }

    // Trigger async retrieval
    trigger_retrieval(pool, registry, &location).await?;

    Ok(AssetAccessResult::Retrieving {
        estimated_seconds: estimate_retrieval_time(&location),
    })
}

pub enum AssetAccessResult {
    Available { path: String, backend_id: DbId },
    Retrieving { estimated_seconds: u64 },
}
```

**Acceptance Criteria:**
- [ ] Hot assets returned immediately
- [ ] Cold assets trigger retrieval and return "Retrieving" status
- [ ] Retrieval cache checked before initiating new retrieval
- [ ] Access tracking updated on every access
- [ ] Retrieval begins within 5 seconds (per success metric)

### Task 4.2: Retrieval Cache
**File:** `src/storage/cache.rs`

Local cache for recently retrieved cold assets.

```rust
pub struct RetrievalCache {
    cache_dir: String,
    max_size_bytes: u64,
    ttl_hours: u64,
}

impl RetrievalCache {
    pub async fn get(&self, cache_key: &str) -> Option<String> {
        let path = std::path::Path::new(&self.cache_dir).join(cache_key);
        if path.exists() {
            // Check TTL
            let meta = tokio::fs::metadata(&path).await.ok()?;
            let age = meta.modified().ok()?.elapsed().ok()?;
            if age < std::time::Duration::from_secs(self.ttl_hours * 3600) {
                return Some(path.to_string_lossy().to_string());
            }
            // Expired — remove
            let _ = tokio::fs::remove_file(&path).await;
        }
        None
    }

    pub async fn put(&self, cache_key: &str, data: &[u8]) -> Result<String, StorageError> {
        self.evict_if_needed().await?;
        let path = std::path::Path::new(&self.cache_dir).join(cache_key);
        tokio::fs::write(&path, data).await?;
        Ok(path.to_string_lossy().to_string())
    }
}
```

**Acceptance Criteria:**
- [ ] Configurable max cache size and TTL
- [ ] Automatic eviction of expired entries
- [ ] LRU eviction when cache is full
- [ ] Cache directory configurable via environment

---

## Phase 5: API Endpoints

### Task 5.1: Backend Configuration Endpoints
**File:** `src/routes/storage.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/storage/backends` lists configured backends
- [ ] `POST /api/admin/storage/backends` creates a new backend
- [ ] `PUT /api/admin/storage/backends/:id` updates backend config
- [ ] `DELETE /api/admin/storage/backends/:id` decommissions a backend

### Task 5.2: Tiering Policy Endpoints
**File:** `src/routes/storage.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/storage/policies` lists tiering policies
- [ ] `POST /api/admin/storage/policies` creates a policy
- [ ] `POST /api/admin/storage/policies/simulate` shows what would be moved

### Task 5.3: Migration Endpoints
**File:** `src/routes/storage.rs`

**Acceptance Criteria:**
- [ ] `POST /api/admin/storage/migrate` starts a bulk migration
- [ ] `GET /api/admin/storage/migrations/:id` returns migration progress
- [ ] `POST /api/admin/storage/migrations/:id/rollback` rolls back a failed migration

### Task 5.4: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All storage management endpoints registered under `/api/admin/storage/`

---

## Phase 6: Frontend — Storage Management UI

### Task 6.1: Backend Configuration Panel
**File:** `frontend/src/components/storage/BackendConfig.tsx`

**Acceptance Criteria:**
- [ ] List configured backends with type, status, tier, capacity
- [ ] Add new backend with type-specific configuration form
- [ ] Edit backend settings
- [ ] Status indicators (active, read_only, offline)

### Task 6.2: Migration Progress View
**File:** `frontend/src/components/storage/MigrationProgress.tsx`

**Acceptance Criteria:**
- [ ] Progress bar showing transferred/total files and bytes
- [ ] Per-file status during active migration
- [ ] Error log for failed transfers
- [ ] Rollback button for failed migrations

### Task 6.3: Tier Indicator Component
**File:** `frontend/src/components/storage/TierIndicator.tsx`

```typescript
export const TierIndicator: React.FC<{ tier: 'hot' | 'cold'; retrieving?: boolean }> = ({ tier, retrieving }) => (
  <span className={`tier-indicator tier-${tier}`}>
    {retrieving ? 'Retrieving...' : tier === 'hot' ? 'Local' : 'Cold Storage'}
  </span>
);
```

**Acceptance Criteria:**
- [ ] Subtle icon showing storage tier (local vs. cloud vs. NAS)
- [ ] "Retrieving..." state with estimated time
- [ ] Visible in file browser and asset detail views

---

## Phase 7: Testing

### Task 7.1: Backend Tests
**File:** `tests/storage_backend_tests.rs`

**Acceptance Criteria:**
- [ ] Local backend read/write/delete/exists work correctly
- [ ] S3 backend integrates with MinIO (test container)
- [ ] Copy between backends preserves data
- [ ] Missing file returns appropriate error

### Task 7.2: Tiering Tests
**File:** `tests/storage_tiering_tests.rs`

**Acceptance Criteria:**
- [ ] Policy evaluation finds eligible assets
- [ ] Tier movement copies, verifies, updates, deletes correctly
- [ ] Checksum mismatch triggers rollback
- [ ] Assets already on target tier are skipped

### Task 7.3: Access & Cache Tests
**File:** `tests/storage_access_tests.rs`

**Acceptance Criteria:**
- [ ] Hot asset access returns immediately
- [ ] Cold asset access triggers retrieval
- [ ] Cache hit returns cached path
- [ ] Cache TTL expiration works
- [ ] Access count incremented on each access

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_storage_backends.sql` | Backend configuration |
| `migrations/{timestamp}_create_asset_locations.sql` | Asset-to-backend mapping |
| `migrations/{timestamp}_create_tiering_policies.sql` | Tiering rules |
| `migrations/{timestamp}_create_storage_migrations.sql` | Migration tracking |
| `src/storage/backend.rs` | StorageBackend trait |
| `src/storage/local_backend.rs` | Local filesystem implementation |
| `src/storage/s3_backend.rs` | S3 implementation |
| `src/storage/nfs_backend.rs` | NFS/SMB implementation |
| `src/storage/registry.rs` | Backend registry/factory |
| `src/storage/tiering.rs` | Tiering policy engine |
| `src/storage/access.rs` | Transparent asset access |
| `src/storage/cache.rs` | Retrieval cache |
| `src/routes/storage.rs` | API endpoints |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework
- PRD-001: Entity tables with file paths
- PRD-015: Reclamation policies (tiering extends the concept)

### New Infrastructure Needed
- `aws-sdk-s3` crate for S3 backend
- `sha2` crate for checksum verification
- Local cache directory (configurable)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.4)
2. Phase 2: Storage Abstraction Layer (Tasks 2.1-2.5)
3. Phase 3: Tiering Engine (Tasks 3.1-3.2)
4. Phase 4: Transparent Access (Tasks 4.1-4.2)
5. Phase 5: API Endpoints (Tasks 5.1-5.4)

**MVP Success Criteria:**
- Cold retrieval begins within 5 seconds
- 100% checksum match after migration
- Tiering policies identify eligible assets within 1 hour
- Zero search/browse performance impact from cold storage

### Post-MVP Enhancements
1. Phase 6: Frontend UI (Tasks 6.1-6.3)
2. Phase 7: Testing (Tasks 7.1-7.3)
3. Multi-backend redundancy (PRD Phase 2)

---

## Notes

1. **S3 credentials:** Store S3 credentials in environment variables or a secrets manager, not in the database config JSONB. The JSONB should contain bucket/endpoint/prefix only.
2. **Large file streaming:** For multi-GB model files, the S3 backend should use streaming reads/writes rather than loading the entire file into memory.
3. **NFS reliability:** NFS mounts can become stale. The NFS backend should implement health checks and retry logic.
4. **Cache sizing:** The retrieval cache should be sized based on available disk space. A good default is 10% of local storage or 50GB, whichever is smaller.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
