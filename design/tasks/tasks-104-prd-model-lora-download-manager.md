# Task List: Model & LoRA Download Manager

**PRD Reference:** `design/prds/104-prd-model-lora-download-manager.md`
**Scope:** In-platform download, verification, and registration of AI models and LoRAs from CivitAI, HuggingFace, and arbitrary URLs. Downloads are queued with progress tracking, SHA-256 verified, auto-registered in the PRD-017 asset registry with source metadata, placed in configurable directories by model type, and checked for duplicates before downloading.

## Overview

Getting models onto disk today is entirely manual: browse CivitAI, download locally, transfer to server, move to the correct directory, register in the platform. This PRD collapses that into "paste URL, confirm, done." The download manager handles source API integration (CivitAI, HuggingFace), queued background downloads with pause/resume, SHA-256 hash verification, automatic asset registry registration with metadata pulled from the source, configurable placement rules by model type and base model, and hash-based duplicate detection against existing registry entries.

### What Already Exists
- PRD-000: Database conventions, migration framework, `DbId` type
- PRD-017: Asset registry (`assets` table, `asset_types`, `asset_statuses`)
- PRD-046: Worker pool management (for post-MVP worker distribution)

### What We're Building
1. Download queue with status tracking, progress, pause/resume
2. CivitAI API integration (model metadata, download URLs, hashes)
3. HuggingFace API integration (repo metadata, file downloads)
4. Direct URL download support
5. SHA-256 hash verification after download
6. Placement rule engine (type-based and base-model-based directory routing)
7. Duplicate detection (hash-based check against existing asset registry)
8. Auto-registration in PRD-017 asset registry with source metadata
9. Secure API token storage per user
10. Download manager UI with progress bars, speed estimates, queue management

### Key Design Decisions
1. **Downloads are background jobs** — Downloads run as background tasks managed by a queue. The user can navigate away and return. Progress is tracked in the database and pushed to the frontend via SSE or polling.
2. **Hash verification is mandatory** — Every download is SHA-256 verified. If the source provides a hash (CivitAI and HuggingFace both do), it's compared. If no source hash is available (direct URL), the hash is computed and stored for future duplicate detection.
3. **Placement rules are admin-configurable** — Rules map model type (checkpoint, LoRA, embedding, VAE) and base model (SD 1.5, SDXL, Flux) to target directories. Defaults cover common ComfyUI directory structures.
4. **Duplicate detection is advisory, not blocking** — If a hash match is found, the user is warned but can still proceed. This handles legitimate cases like wanting multiple copies or replacing a corrupted file.
5. **API tokens stored encrypted** — User-specific CivitAI/HuggingFace API tokens are stored encrypted in the database. They are never exposed in API responses.

---

## Phase 1: Database Schema

### Task 1.1: Download Queue Table
**File:** `migrations/{timestamp}_create_model_downloads.sql`

Track model download operations.

```sql
CREATE TABLE download_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON download_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO download_statuses (name, description) VALUES
    ('queued', 'Waiting in download queue'),
    ('downloading', 'Download in progress'),
    ('paused', 'Download paused by user'),
    ('verifying', 'Hash verification in progress'),
    ('registering', 'Registering in asset registry'),
    ('completed', 'Download and registration complete'),
    ('failed', 'Download or verification failed'),
    ('cancelled', 'Download cancelled by user');

CREATE TABLE model_downloads (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES download_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_type TEXT NOT NULL,            -- 'civitai', 'huggingface', 'direct'
    source_url TEXT NOT NULL,
    source_model_id TEXT NULL,            -- CivitAI model ID or HF repo ID
    source_version_id TEXT NULL,          -- CivitAI model version ID
    model_name TEXT NOT NULL,
    model_type TEXT NOT NULL,             -- 'checkpoint', 'lora', 'embedding', 'vae', 'controlnet'
    base_model TEXT NULL,                 -- 'SD 1.5', 'SDXL', 'Flux', etc.
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NULL,          -- total file size (from source)
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    download_speed_bps BIGINT NULL,       -- bytes per second (for ETA)
    target_path TEXT NULL,                -- resolved by placement rules
    expected_hash TEXT NULL,              -- SHA-256 from source
    actual_hash TEXT NULL,                -- SHA-256 computed after download
    hash_verified BOOLEAN NOT NULL DEFAULT FALSE,
    hash_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
    source_metadata JSONB NOT NULL DEFAULT '{}',  -- metadata from source API
    asset_id BIGINT NULL,                 -- FK to assets table after registration
    error_message TEXT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    initiated_by BIGINT NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_downloads_status_id ON model_downloads(status_id);
CREATE INDEX idx_model_downloads_source_type ON model_downloads(source_type);
CREATE INDEX idx_model_downloads_asset_id ON model_downloads(asset_id);
CREATE INDEX idx_model_downloads_initiated_by ON model_downloads(initiated_by);
CREATE INDEX idx_model_downloads_created_at ON model_downloads(created_at);
CREATE INDEX idx_model_downloads_expected_hash ON model_downloads(expected_hash);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON model_downloads
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Status lookup covers full download lifecycle
- [ ] Progress tracked via `downloaded_bytes` / `file_size_bytes`
- [ ] Hash fields support pre-download check and post-download verification
- [ ] `source_metadata` stores full metadata from CivitAI/HuggingFace
- [ ] `asset_id` links to PRD-017 asset registry after registration
- [ ] FK indexes on all foreign keys
- [ ] Migration applies cleanly

### Task 1.2: API Tokens Table
**File:** `migrations/{timestamp}_create_api_tokens.sql`

Store user-specific API tokens for external services.

```sql
CREATE TABLE api_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    service_name TEXT NOT NULL,           -- 'civitai', 'huggingface'
    encrypted_token BYTEA NOT NULL,       -- AES-256-GCM encrypted
    token_hint TEXT NOT NULL DEFAULT '',  -- last 4 chars for display
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_api_tokens_user_service ON api_tokens(user_id, service_name);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_tokens
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One token per user per service (unique constraint)
- [ ] Token encrypted at rest (AES-256-GCM)
- [ ] `token_hint` shows last 4 characters for identification without exposing full token
- [ ] `is_valid` flag for marking revoked/expired tokens
- [ ] Migration applies cleanly

### Task 1.3: Placement Rules Table
**File:** `migrations/{timestamp}_create_placement_rules.sql`

Configurable rules for where downloaded models are stored.

```sql
CREATE TABLE placement_rules (
    id BIGSERIAL PRIMARY KEY,
    model_type TEXT NOT NULL,             -- 'checkpoint', 'lora', 'embedding', 'vae', 'controlnet'
    base_model TEXT NULL,                 -- NULL = any base model
    target_directory TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,  -- higher priority rules match first
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_placement_rules_model_type ON placement_rules(model_type);
CREATE INDEX idx_placement_rules_active ON placement_rules(is_active) WHERE is_active = TRUE;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON placement_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Default placement rules (ComfyUI directory structure)
INSERT INTO placement_rules (model_type, base_model, target_directory, priority) VALUES
    ('checkpoint', NULL,    '/models/checkpoints/', 0),
    ('checkpoint', 'SDXL',  '/models/checkpoints/sdxl/', 10),
    ('checkpoint', 'SD 1.5', '/models/checkpoints/sd15/', 10),
    ('checkpoint', 'Flux',  '/models/checkpoints/flux/', 10),
    ('lora', NULL,          '/models/loras/', 0),
    ('lora', 'SDXL',       '/models/loras/sdxl/', 10),
    ('lora', 'SD 1.5',     '/models/loras/sd15/', 10),
    ('lora', 'Flux',       '/models/loras/flux/', 10),
    ('embedding', NULL,     '/models/embeddings/', 0),
    ('vae', NULL,           '/models/vae/', 0),
    ('controlnet', NULL,    '/models/controlnet/', 0);
```

**Acceptance Criteria:**
- [ ] Rules route by model type and optionally base model
- [ ] Higher-priority rules override lower-priority (more specific wins)
- [ ] Default rules cover common ComfyUI directory layout
- [ ] Rules are admin-editable
- [ ] `is_active` allows disabling rules without deletion
- [ ] Migration applies cleanly

---

## Phase 2: Source API Integrations

### Task 2.1: CivitAI Client
**File:** `src/download_manager/sources/civitai.rs`

Integrate with the CivitAI API to fetch model metadata and download URLs.

```rust
use reqwest::Client;
use crate::types::DbId;

const CIVITAI_API_BASE: &str = "https://civitai.com/api/v1";

#[derive(Debug, Serialize, Deserialize)]
pub struct CivitaiModelInfo {
    pub model_id: String,
    pub model_name: String,
    pub model_type: String,       // 'Checkpoint', 'LORA', 'TextualInversion', etc.
    pub base_model: Option<String>,
    pub description: Option<String>,
    pub trigger_words: Vec<String>,
    pub version_id: String,
    pub version_name: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub expected_hash: Option<String>,  // SHA-256
    pub preview_images: Vec<String>,
}

pub struct CivitaiClient {
    http: Client,
}

impl CivitaiClient {
    pub fn new() -> Self {
        Self {
            http: Client::new(),
        }
    }

    /// Parse a CivitAI URL and extract model/version IDs.
    /// Supports: https://civitai.com/models/12345/model-name
    ///           https://civitai.com/models/12345?modelVersionId=67890
    pub fn parse_url(&self, url: &str) -> Result<(String, Option<String>), DownloadError> {
        let parsed = url::Url::parse(url)?;
        let path_segments: Vec<&str> = parsed.path_segments()
            .ok_or(DownloadError::InvalidUrl)?
            .collect();

        if path_segments.len() < 2 || path_segments[0] != "models" {
            return Err(DownloadError::InvalidUrl);
        }

        let model_id = path_segments[1].to_string();
        let version_id = parsed.query_pairs()
            .find(|(k, _)| k == "modelVersionId")
            .map(|(_, v)| v.to_string());

        Ok((model_id, version_id))
    }

    /// Fetch model metadata from CivitAI API.
    pub async fn fetch_model_info(
        &self,
        model_id: &str,
        version_id: Option<&str>,
        api_token: Option<&str>,
    ) -> Result<CivitaiModelInfo, DownloadError> {
        let url = format!("{}/models/{}", CIVITAI_API_BASE, model_id);
        let mut request = self.http.get(&url);

        if let Some(token) = api_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request.send().await?.error_for_status()?;
        let data: serde_json::Value = response.json().await?;

        // Select the requested version or latest
        let version = match version_id {
            Some(vid) => data["modelVersions"].as_array()
                .and_then(|versions| versions.iter().find(|v| v["id"].to_string() == vid))
                .ok_or(DownloadError::VersionNotFound)?,
            None => data["modelVersions"].as_array()
                .and_then(|versions| versions.first())
                .ok_or(DownloadError::NoVersions)?,
        };

        let file = version["files"].as_array()
            .and_then(|files| files.first())
            .ok_or(DownloadError::NoFiles)?;

        Ok(CivitaiModelInfo {
            model_id: model_id.to_string(),
            model_name: data["name"].as_str().unwrap_or("Unknown").to_string(),
            model_type: data["type"].as_str().unwrap_or("Unknown").to_string(),
            base_model: version["baseModel"].as_str().map(String::from),
            description: data["description"].as_str().map(String::from),
            trigger_words: version["trainedWords"].as_array()
                .map(|words| words.iter().filter_map(|w| w.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            version_id: version["id"].to_string(),
            version_name: version["name"].as_str().unwrap_or("").to_string(),
            download_url: file["downloadUrl"].as_str().unwrap_or("").to_string(),
            file_name: file["name"].as_str().unwrap_or("model.safetensors").to_string(),
            file_size_bytes: file["sizeKB"].as_f64().map(|kb| (kb * 1024.0) as i64).unwrap_or(0),
            expected_hash: file["hashes"]["SHA256"].as_str().map(String::from),
            preview_images: version["images"].as_array()
                .map(|imgs| imgs.iter().filter_map(|i| i["url"].as_str().map(String::from)).collect())
                .unwrap_or_default(),
        })
    }
}
```

**Acceptance Criteria:**
- [ ] Parses CivitAI model page URLs (with and without version ID)
- [ ] Fetches model metadata: name, type, base model, trigger words, description, preview images
- [ ] Extracts download URL and expected SHA-256 hash
- [ ] Supports authenticated access via API token
- [ ] Handles missing versions/files gracefully with clear errors

### Task 2.2: HuggingFace Client
**File:** `src/download_manager/sources/huggingface.rs`

Integrate with the HuggingFace API to fetch repo metadata and file downloads.

```rust
const HF_API_BASE: &str = "https://huggingface.co/api";

#[derive(Debug, Serialize, Deserialize)]
pub struct HuggingFaceModelInfo {
    pub repo_id: String,
    pub model_name: String,
    pub model_type: String,
    pub base_model: Option<String>,
    pub description: Option<String>,
    pub files: Vec<HfFileInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HfFileInfo {
    pub file_name: String,
    pub download_url: String,
    pub file_size_bytes: i64,
    pub expected_hash: Option<String>,   // SHA-256 from LFS pointer
}

pub struct HuggingFaceClient {
    http: Client,
}

impl HuggingFaceClient {
    pub fn new() -> Self {
        Self { http: Client::new() }
    }

    /// Parse a HuggingFace URL or model ID.
    /// Supports: https://huggingface.co/owner/model-name
    ///           owner/model-name
    pub fn parse_url(&self, url: &str) -> Result<String, DownloadError> {
        if url.contains("huggingface.co") {
            let parsed = url::Url::parse(url)?;
            let segments: Vec<&str> = parsed.path_segments()
                .ok_or(DownloadError::InvalidUrl)?
                .collect();
            if segments.len() >= 2 {
                return Ok(format!("{}/{}", segments[0], segments[1]));
            }
            Err(DownloadError::InvalidUrl)
        } else if url.contains('/') {
            // Assume owner/model format
            Ok(url.to_string())
        } else {
            Err(DownloadError::InvalidUrl)
        }
    }

    /// Fetch model info from HuggingFace API.
    pub async fn fetch_model_info(
        &self,
        repo_id: &str,
        api_token: Option<&str>,
    ) -> Result<HuggingFaceModelInfo, DownloadError> {
        let url = format!("{}/models/{}", HF_API_BASE, repo_id);
        let mut request = self.http.get(&url);

        if let Some(token) = api_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request.send().await?.error_for_status()?;
        let data: serde_json::Value = response.json().await?;

        // Fetch file listing
        let files_url = format!("{}/models/{}/tree/main", HF_API_BASE, repo_id);
        let files_response = self.http.get(&files_url).send().await?.error_for_status()?;
        let files_data: Vec<serde_json::Value> = files_response.json().await?;

        let model_files: Vec<HfFileInfo> = files_data.iter()
            .filter(|f| {
                let name = f["path"].as_str().unwrap_or("");
                name.ends_with(".safetensors") || name.ends_with(".ckpt")
                    || name.ends_with(".bin") || name.ends_with(".pt")
            })
            .map(|f| HfFileInfo {
                file_name: f["path"].as_str().unwrap_or("").to_string(),
                download_url: format!("https://huggingface.co/{}/resolve/main/{}",
                    repo_id, f["path"].as_str().unwrap_or("")),
                file_size_bytes: f["size"].as_i64().unwrap_or(0),
                expected_hash: f["lfs"]["sha256"].as_str().map(String::from),
            })
            .collect();

        Ok(HuggingFaceModelInfo {
            repo_id: repo_id.to_string(),
            model_name: data["modelId"].as_str().unwrap_or(repo_id).to_string(),
            model_type: infer_model_type_from_tags(&data),
            base_model: infer_base_model_from_tags(&data),
            description: data["description"].as_str().map(String::from),
            files: model_files,
        })
    }
}

fn infer_model_type_from_tags(data: &serde_json::Value) -> String {
    let tags: Vec<&str> = data["tags"].as_array()
        .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect())
        .unwrap_or_default();

    if tags.contains(&"lora") { "lora".to_string() }
    else if tags.contains(&"textual-inversion") { "embedding".to_string() }
    else if tags.contains(&"controlnet") { "controlnet".to_string() }
    else { "checkpoint".to_string() }
}
```

**Acceptance Criteria:**
- [ ] Parses HuggingFace repo URLs and `owner/model` format
- [ ] Fetches model metadata: name, type, base model, description
- [ ] Lists downloadable files (safetensors, ckpt, bin, pt)
- [ ] Extracts LFS SHA-256 hash when available
- [ ] Supports authenticated access via API token
- [ ] Infers model type and base model from HuggingFace tags

### Task 2.3: Source URL Detector
**File:** `src/download_manager/sources/detector.rs`

Auto-detect the source type from a pasted URL and route to the appropriate client.

```rust
pub enum SourceType {
    CivitAI,
    HuggingFace,
    DirectUrl,
}

pub fn detect_source(url: &str) -> SourceType {
    if url.contains("civitai.com") {
        SourceType::CivitAI
    } else if url.contains("huggingface.co") || url.contains("hf.co") {
        SourceType::HuggingFace
    } else {
        SourceType::DirectUrl
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResolvedDownload {
    pub source_type: String,
    pub model_name: String,
    pub model_type: String,
    pub base_model: Option<String>,
    pub file_name: String,
    pub file_size_bytes: Option<i64>,
    pub download_url: String,
    pub expected_hash: Option<String>,
    pub metadata: serde_json::Value,
}

/// Resolve a URL to a download-ready structure with metadata.
pub async fn resolve_url(
    url: &str,
    pool: &PgPool,
    user_id: DbId,
) -> Result<ResolvedDownload, DownloadError> {
    let api_token = fetch_user_token(pool, user_id, &detect_source(url).service_name()).await?;

    match detect_source(url) {
        SourceType::CivitAI => {
            let client = CivitaiClient::new();
            let (model_id, version_id) = client.parse_url(url)?;
            let info = client.fetch_model_info(&model_id, version_id.as_deref(), api_token.as_deref()).await?;
            Ok(ResolvedDownload::from_civitai(info))
        }
        SourceType::HuggingFace => {
            let client = HuggingFaceClient::new();
            let repo_id = client.parse_url(url)?;
            let info = client.fetch_model_info(&repo_id, api_token.as_deref()).await?;
            // If multiple files, return the largest safetensors file
            let file = info.files.iter()
                .filter(|f| f.file_name.ends_with(".safetensors"))
                .max_by_key(|f| f.file_size_bytes)
                .or(info.files.first())
                .ok_or(DownloadError::NoFiles)?;
            Ok(ResolvedDownload::from_huggingface(info.clone(), file.clone()))
        }
        SourceType::DirectUrl => {
            // HEAD request to get file name and size
            let head = reqwest::Client::new().head(url).send().await?;
            let file_name = extract_filename_from_response(&head, url);
            let file_size = head.headers().get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok());

            Ok(ResolvedDownload {
                source_type: "direct".to_string(),
                model_name: file_name.clone(),
                model_type: infer_type_from_filename(&file_name),
                base_model: None,
                file_name,
                file_size_bytes: file_size,
                download_url: url.to_string(),
                expected_hash: None,
                metadata: serde_json::json!({}),
            })
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Auto-detects CivitAI, HuggingFace, or direct URL
- [ ] Routes to appropriate client for metadata resolution
- [ ] Direct URL falls back to HEAD request for file info
- [ ] Returns unified `ResolvedDownload` structure
- [ ] User-specific API tokens loaded from database

---

## Phase 3: Download Engine

### Task 3.1: Download Queue Manager
**File:** `src/download_manager/queue.rs`

Background download queue with concurrent download limit, pause/resume, and progress tracking.

```rust
use tokio::sync::Semaphore;
use std::sync::Arc;

const MAX_CONCURRENT_DOWNLOADS: usize = 3;

pub struct DownloadQueueManager {
    pool: PgPool,
    semaphore: Arc<Semaphore>,
}

impl DownloadQueueManager {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_DOWNLOADS)),
        }
    }

    /// Enqueue a new download.
    pub async fn enqueue(
        &self,
        resolved: &ResolvedDownload,
        target_path: &str,
        initiated_by: Option<DbId>,
    ) -> Result<DbId, DownloadError> {
        let download_id = sqlx::query_scalar!(
            r#"
            INSERT INTO model_downloads
                (status_id, source_type, source_url, model_name, model_type,
                 base_model, file_name, file_size_bytes, target_path,
                 expected_hash, source_metadata, initiated_by)
            VALUES (
                (SELECT id FROM download_statuses WHERE name = 'queued'),
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
            RETURNING id
            "#,
            &resolved.source_type,
            &resolved.download_url,
            &resolved.model_name,
            &resolved.model_type,
            resolved.base_model.as_deref(),
            &resolved.file_name,
            resolved.file_size_bytes,
            target_path,
            resolved.expected_hash.as_deref(),
            &resolved.metadata,
            initiated_by
        )
        .fetch_one(&self.pool)
        .await?;

        // Spawn background download task
        let pool = self.pool.clone();
        let semaphore = self.semaphore.clone();
        let url = resolved.download_url.clone();
        let path = target_path.to_string();

        tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();
            if let Err(e) = execute_download(&pool, download_id, &url, &path).await {
                update_download_error(&pool, download_id, &e.to_string()).await.ok();
            }
        });

        Ok(download_id)
    }

    /// Pause a download.
    pub async fn pause(&self, download_id: DbId) -> Result<(), DownloadError> {
        sqlx::query!(
            r#"
            UPDATE model_downloads
            SET status_id = (SELECT id FROM download_statuses WHERE name = 'paused')
            WHERE id = $1
              AND status_id = (SELECT id FROM download_statuses WHERE name = 'downloading')
            "#,
            download_id
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Resume a paused download.
    pub async fn resume(&self, download_id: DbId) -> Result<(), DownloadError> {
        sqlx::query!(
            r#"
            UPDATE model_downloads
            SET status_id = (SELECT id FROM download_statuses WHERE name = 'queued')
            WHERE id = $1
              AND status_id = (SELECT id FROM download_statuses WHERE name = 'paused')
            "#,
            download_id
        )
        .execute(&self.pool)
        .await?;

        // Re-spawn download task with resume support
        let pool = self.pool.clone();
        let semaphore = self.semaphore.clone();
        tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();
            if let Err(e) = resume_download(&pool, download_id).await {
                update_download_error(&pool, download_id, &e.to_string()).await.ok();
            }
        });

        Ok(())
    }
}

/// Execute a download with progress tracking.
async fn execute_download(
    pool: &PgPool,
    download_id: DbId,
    url: &str,
    target_path: &str,
) -> Result<(), DownloadError> {
    // Update status to downloading
    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET status_id = (SELECT id FROM download_statuses WHERE name = 'downloading'),
            started_at = NOW()
        WHERE id = $1
        "#,
        download_id
    )
    .execute(pool)
    .await?;

    // Ensure target directory exists
    let parent = std::path::Path::new(target_path).parent()
        .ok_or(DownloadError::InvalidPath)?;
    tokio::fs::create_dir_all(parent).await?;

    // Stream download with progress updates
    let client = reqwest::Client::new();
    let response = client.get(url).send().await?.error_for_status()?;
    let mut file = tokio::fs::File::create(target_path).await?;
    let mut downloaded: i64 = 0;
    let mut last_update = std::time::Instant::now();
    let mut stream = response.bytes_stream();

    use tokio::io::AsyncWriteExt;
    use futures::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as i64;

        // Update progress every 500ms
        if last_update.elapsed() > std::time::Duration::from_millis(500) {
            let speed = downloaded as f64 / last_update.elapsed().as_secs_f64();
            sqlx::query!(
                r#"
                UPDATE model_downloads
                SET downloaded_bytes = $1, download_speed_bps = $2
                WHERE id = $3
                "#,
                downloaded,
                speed as i64,
                download_id
            )
            .execute(pool)
            .await?;
            last_update = std::time::Instant::now();
        }

        // Check for pause request
        let status = check_download_status(pool, download_id).await?;
        if status == "paused" || status == "cancelled" {
            return Ok(());
        }
    }

    file.flush().await?;

    // Final progress update
    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET downloaded_bytes = $1
        WHERE id = $2
        "#,
        downloaded,
        download_id
    )
    .execute(pool)
    .await?;

    // Proceed to verification
    verify_and_register(pool, download_id, target_path).await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Concurrent download limit (configurable, default 3)
- [ ] Progress tracked: downloaded bytes, speed in bytes/sec
- [ ] Progress updates every 500ms (not per-chunk)
- [ ] Pause sets status and stops streaming
- [ ] Resume continues from downloaded bytes using HTTP Range header
- [ ] Target directory created automatically
- [ ] Cancel sets status and cleans up partial file
- [ ] Failed downloads include clear error messages

### Task 3.2: Hash Verification Service
**File:** `src/download_manager/hash_verification.rs`

SHA-256 hash verification after download.

```rust
use sha2::{Sha256, Digest};
use tokio::io::AsyncReadExt;

/// Compute SHA-256 hash of a file.
pub async fn compute_sha256(file_path: &str) -> Result<String, DownloadError> {
    let mut file = tokio::fs::File::open(file_path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8 * 1024 * 1024]; // 8MB buffer

    loop {
        let bytes_read = file.read(&mut buffer).await?;
        if bytes_read == 0 { break; }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Verify download and register in asset registry.
pub async fn verify_and_register(
    pool: &PgPool,
    download_id: DbId,
    file_path: &str,
) -> Result<(), DownloadError> {
    // Update status to verifying
    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET status_id = (SELECT id FROM download_statuses WHERE name = 'verifying')
        WHERE id = $1
        "#,
        download_id
    )
    .execute(pool)
    .await?;

    let actual_hash = compute_sha256(file_path).await?;

    // Check against expected hash
    let download = sqlx::query!(
        r#"SELECT expected_hash FROM model_downloads WHERE id = $1"#,
        download_id
    )
    .fetch_one(pool)
    .await?;

    let hash_mismatch = download.expected_hash.as_ref()
        .map(|expected| expected.to_lowercase() != actual_hash.to_lowercase())
        .unwrap_or(false);

    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET actual_hash = $1,
            hash_verified = TRUE,
            hash_mismatch = $2
        WHERE id = $3
        "#,
        &actual_hash,
        hash_mismatch,
        download_id
    )
    .execute(pool)
    .await?;

    if hash_mismatch {
        // Flag but don't block — user can choose to keep or re-download
        sqlx::query!(
            r#"
            UPDATE model_downloads
            SET error_message = 'Hash mismatch: file may be corrupted or tampered'
            WHERE id = $1
            "#,
            download_id
        )
        .execute(pool)
        .await?;
    }

    // Proceed to registration
    register_in_asset_registry(pool, download_id).await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Computes SHA-256 using streaming (handles large files)
- [ ] Compares against expected hash from source (case-insensitive)
- [ ] Hash mismatch flagged but does not block registration
- [ ] Verification runs automatically after download completes
- [ ] 8MB buffer for efficient I/O on large model files

---

## Phase 4: Placement & Registration

### Task 4.1: Placement Rule Engine
**File:** `src/download_manager/placement.rs`

Resolve target directory from placement rules.

```rust
/// Resolve the target path for a download based on placement rules.
pub async fn resolve_target_path(
    pool: &PgPool,
    model_type: &str,
    base_model: Option<&str>,
    file_name: &str,
) -> Result<String, DownloadError> {
    // First try model_type + base_model match (higher priority)
    let rule = if let Some(bm) = base_model {
        sqlx::query!(
            r#"
            SELECT target_directory
            FROM placement_rules
            WHERE model_type = $1
              AND (base_model = $2 OR base_model IS NULL)
              AND is_active = TRUE
            ORDER BY priority DESC, base_model IS NULL ASC
            LIMIT 1
            "#,
            model_type,
            bm
        )
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query!(
            r#"
            SELECT target_directory
            FROM placement_rules
            WHERE model_type = $1
              AND base_model IS NULL
              AND is_active = TRUE
            ORDER BY priority DESC
            LIMIT 1
            "#,
            model_type
        )
        .fetch_optional(pool)
        .await?
    };

    let target_dir = rule
        .map(|r| r.target_directory)
        .unwrap_or_else(|| format!("/models/{}/", model_type));

    Ok(format!("{}{}", target_dir.trim_end_matches('/'), format!("/{}", file_name)))
}
```

**Acceptance Criteria:**
- [ ] More specific rules (model_type + base_model) take priority over generic (model_type only)
- [ ] Falls back to `/models/{type}/` if no matching rule
- [ ] Only active rules considered
- [ ] Correct path concatenation (no double slashes)

### Task 4.2: Asset Registry Integration
**File:** `src/download_manager/registration.rs`

Auto-register downloaded models in the PRD-017 asset registry.

```rust
/// Register a completed download in the asset registry.
pub async fn register_in_asset_registry(
    pool: &PgPool,
    download_id: DbId,
) -> Result<DbId, DownloadError> {
    // Update status to registering
    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET status_id = (SELECT id FROM download_statuses WHERE name = 'registering')
        WHERE id = $1
        "#,
        download_id
    )
    .execute(pool)
    .await?;

    let download = sqlx::query!(
        r#"
        SELECT model_name, model_type, target_path, actual_hash,
               file_size_bytes, source_metadata, source_url
        FROM model_downloads
        WHERE id = $1
        "#,
        download_id
    )
    .fetch_one(pool)
    .await?;

    let file_size = download.file_size_bytes.unwrap_or(0);

    // Register in PRD-017 asset registry
    let asset_id = sqlx::query_scalar!(
        r#"
        INSERT INTO assets
            (name, asset_type_id, file_path, file_size_bytes, checksum_sha256,
             status_id, metadata)
        VALUES (
            $1,
            (SELECT id FROM asset_types WHERE name = $2),
            $3,
            $4,
            $5,
            (SELECT id FROM asset_statuses WHERE name = 'active'),
            $6
        )
        RETURNING id
        "#,
        &download.model_name,
        &download.model_type,
        download.target_path.as_deref(),
        file_size,
        download.actual_hash.as_deref(),
        &serde_json::json!({
            "source_url": download.source_url,
            "source_metadata": download.source_metadata,
            "download_id": download_id,
        })
    )
    .fetch_one(pool)
    .await?;

    // Link download to asset and mark completed
    sqlx::query!(
        r#"
        UPDATE model_downloads
        SET asset_id = $1,
            status_id = (SELECT id FROM download_statuses WHERE name = 'completed'),
            completed_at = NOW()
        WHERE id = $2
        "#,
        asset_id,
        download_id
    )
    .execute(pool)
    .await?;

    Ok(asset_id)
}
```

**Acceptance Criteria:**
- [ ] Creates asset record in PRD-017 `assets` table
- [ ] Maps model type to `asset_types` lookup
- [ ] Stores SHA-256 checksum, file path, file size
- [ ] Source metadata preserved in JSONB for reference
- [ ] Download linked to asset via `asset_id` FK
- [ ] Status set to completed with timestamp

### Task 4.3: Duplicate Detection
**File:** `src/download_manager/duplicate_check.rs`

Check if a model already exists before downloading.

```rust
#[derive(Debug, Serialize)]
pub struct DuplicateCheckResult {
    pub is_duplicate: bool,
    pub existing_asset: Option<ExistingAsset>,
}

#[derive(Debug, Serialize)]
pub struct ExistingAsset {
    pub asset_id: DbId,
    pub asset_name: String,
    pub file_path: String,
}

/// Check for duplicates by SHA-256 hash.
pub async fn check_duplicate(
    pool: &PgPool,
    expected_hash: Option<&str>,
) -> Result<DuplicateCheckResult, DownloadError> {
    let hash = match expected_hash {
        Some(h) => h,
        None => return Ok(DuplicateCheckResult { is_duplicate: false, existing_asset: None }),
    };

    let existing = sqlx::query!(
        r#"
        SELECT id, name, file_path
        FROM assets
        WHERE checksum_sha256 = $1
        LIMIT 1
        "#,
        hash.to_lowercase()
    )
    .fetch_optional(pool)
    .await?;

    Ok(match existing {
        Some(asset) => DuplicateCheckResult {
            is_duplicate: true,
            existing_asset: Some(ExistingAsset {
                asset_id: asset.id,
                asset_name: asset.name,
                file_path: asset.file_path.unwrap_or_default(),
            }),
        },
        None => DuplicateCheckResult {
            is_duplicate: false,
            existing_asset: None,
        },
    })
}
```

**Acceptance Criteria:**
- [ ] Hash-based check against existing `assets` table
- [ ] Returns existing asset info if duplicate found
- [ ] Advisory only — does not block download
- [ ] Handles missing expected hash (direct URLs) gracefully
- [ ] Case-insensitive hash comparison

---

## Phase 5: API Token Management

### Task 5.1: Token Service
**File:** `src/download_manager/token_service.rs`

Encrypted storage and retrieval of user API tokens.

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};

pub struct TokenService {
    pool: PgPool,
    encryption_key: Key<Aes256Gcm>,
}

impl TokenService {
    pub fn new(pool: PgPool, key_bytes: &[u8; 32]) -> Self {
        Self {
            pool,
            encryption_key: *Key::<Aes256Gcm>::from_slice(key_bytes),
        }
    }

    /// Store or update an API token for a user.
    pub async fn store_token(
        &self,
        user_id: DbId,
        service_name: &str,
        plaintext_token: &str,
    ) -> Result<(), DownloadError> {
        let encrypted = self.encrypt(plaintext_token.as_bytes())?;
        let hint = if plaintext_token.len() >= 4 {
            format!("...{}", &plaintext_token[plaintext_token.len()-4..])
        } else {
            "****".to_string()
        };

        sqlx::query!(
            r#"
            INSERT INTO api_tokens (user_id, service_name, encrypted_token, token_hint)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, service_name) DO UPDATE
            SET encrypted_token = $3, token_hint = $4, is_valid = TRUE, updated_at = NOW()
            "#,
            user_id,
            service_name,
            &encrypted,
            &hint
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Retrieve and decrypt an API token.
    pub async fn get_token(
        &self,
        user_id: DbId,
        service_name: &str,
    ) -> Result<Option<String>, DownloadError> {
        let row = sqlx::query!(
            r#"
            SELECT encrypted_token
            FROM api_tokens
            WHERE user_id = $1 AND service_name = $2 AND is_valid = TRUE
            "#,
            user_id,
            service_name
        )
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => {
                let decrypted = self.decrypt(&r.encrypted_token)?;
                // Update last_used_at
                sqlx::query!(
                    r#"UPDATE api_tokens SET last_used_at = NOW() WHERE user_id = $1 AND service_name = $2"#,
                    user_id, service_name
                )
                .execute(&self.pool)
                .await?;
                Ok(Some(String::from_utf8(decrypted)?))
            }
            None => Ok(None),
        }
    }

    /// Delete a stored token.
    pub async fn delete_token(
        &self,
        user_id: DbId,
        service_name: &str,
    ) -> Result<(), DownloadError> {
        sqlx::query!(
            r#"DELETE FROM api_tokens WHERE user_id = $1 AND service_name = $2"#,
            user_id, service_name
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    fn encrypt(&self, data: &[u8]) -> Result<Vec<u8>, DownloadError> {
        let cipher = Aes256Gcm::new(&self.encryption_key);
        let nonce = Nonce::from(rand::random::<[u8; 12]>());
        let mut encrypted = cipher.encrypt(&nonce, data)?;
        // Prepend nonce to ciphertext
        let mut result = nonce.to_vec();
        result.append(&mut encrypted);
        Ok(result)
    }

    fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>, DownloadError> {
        if data.len() < 12 {
            return Err(DownloadError::DecryptionFailed);
        }
        let (nonce_bytes, ciphertext) = data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let cipher = Aes256Gcm::new(&self.encryption_key);
        Ok(cipher.decrypt(nonce, ciphertext)?)
    }
}
```

**Acceptance Criteria:**
- [ ] Tokens encrypted with AES-256-GCM before storage
- [ ] Nonce prepended to ciphertext for decryption
- [ ] Token hint shows last 4 characters for identification
- [ ] Upsert semantics (store or update existing token)
- [ ] `last_used_at` updated on retrieval
- [ ] Plaintext token never logged or stored unencrypted
- [ ] Token deletion supported

---

## Phase 6: API Endpoints

### Task 6.1: Download Manager Endpoints
**File:** `src/routes/downloads.rs`

```rust
use axum::{Router, routing::{post, get}, extract::{State, Json, Path, Query}, response::IntoResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        // URL resolution (metadata fetch)
        .route("/api/downloads/resolve", post(resolve_url_handler))
        // Download queue
        .route("/api/downloads", post(create_download))
        .route("/api/downloads", get(list_downloads))
        .route("/api/downloads/:id", get(get_download))
        .route("/api/downloads/:id/pause", post(pause_download))
        .route("/api/downloads/:id/resume", post(resume_download))
        .route("/api/downloads/:id/cancel", post(cancel_download))
        .route("/api/downloads/:id/retry", post(retry_download))
        .route("/api/downloads/:id/verify", post(reverify_download))
        // Duplicate check
        .route("/api/downloads/check-duplicate", post(check_duplicate_handler))
        // Placement rules
        .route("/api/admin/placement-rules", get(list_placement_rules))
        .route("/api/admin/placement-rules", post(create_placement_rule))
        .route("/api/admin/placement-rules/:id", post(update_placement_rule))
        .route("/api/admin/placement-rules/:id", post(delete_placement_rule))
        // API tokens
        .route("/api/user/api-tokens", get(list_tokens))
        .route("/api/user/api-tokens", post(store_token))
        .route("/api/user/api-tokens/:service", post(delete_token))
}

async fn resolve_url_handler(
    State(state): State<AppState>,
    Json(body): Json<ResolveUrlRequest>,
) -> impl IntoResponse {
    let resolved = resolve_url(&body.url, &state.pool, body.user_id).await?;

    // Also check for duplicates
    let duplicate = check_duplicate(&state.pool, resolved.expected_hash.as_deref()).await?;

    Ok(Json(serde_json::json!({
        "resolved": resolved,
        "duplicate": duplicate,
    })))
}

async fn create_download(
    State(state): State<AppState>,
    Json(body): Json<CreateDownloadRequest>,
) -> impl IntoResponse {
    let resolved = resolve_url(&body.url, &state.pool, body.user_id).await?;
    let target_path = resolve_target_path(
        &state.pool,
        &resolved.model_type,
        resolved.base_model.as_deref(),
        &resolved.file_name,
    ).await?;

    let download_id = state.download_queue
        .enqueue(&resolved, &target_path, Some(body.user_id))
        .await?;

    Ok(Json(serde_json::json!({ "download_id": download_id })))
}

async fn list_downloads(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let downloads = sqlx::query!(
        r#"
        SELECT d.id, d.source_type, d.model_name, d.model_type, d.file_name,
               d.file_size_bytes, d.downloaded_bytes, d.download_speed_bps,
               d.hash_verified, d.hash_mismatch, d.error_message,
               d.started_at, d.completed_at,
               s.name as "status_name!"
        FROM model_downloads d
        JOIN download_statuses s ON d.status_id = s.id
        ORDER BY d.created_at DESC
        LIMIT 100
        "#
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(downloads))
}

async fn list_tokens(
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Returns hint only, never the actual token
    let tokens = sqlx::query!(
        r#"
        SELECT service_name, token_hint, is_valid, last_used_at
        FROM api_tokens
        WHERE user_id = $1
        "#,
        current_user_id()
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(tokens))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/downloads/resolve` resolves URL and returns metadata + duplicate check
- [ ] `POST /api/downloads` creates a download and enqueues it
- [ ] `GET /api/downloads` lists recent downloads with progress
- [ ] `GET /api/downloads/:id` returns single download detail
- [ ] `POST /api/downloads/:id/pause` pauses an active download
- [ ] `POST /api/downloads/:id/resume` resumes a paused download
- [ ] `POST /api/downloads/:id/cancel` cancels a download
- [ ] `POST /api/downloads/:id/retry` retries a failed download
- [ ] `POST /api/downloads/:id/verify` re-runs hash verification
- [ ] `POST /api/downloads/check-duplicate` checks for existing asset by hash
- [ ] `GET /api/admin/placement-rules` lists placement rules (admin)
- [ ] `POST /api/admin/placement-rules` creates a placement rule (admin)
- [ ] `GET /api/user/api-tokens` lists stored tokens (hint only, never full token)
- [ ] `POST /api/user/api-tokens` stores/updates a token
- [ ] `DELETE /api/user/api-tokens/:service` deletes a token

### Task 6.2: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All download manager endpoints registered under the main router

---

## Phase 7: Frontend

### Task 7.1: Download Manager Page
**File:** `frontend/src/components/downloads/DownloadManagerPage.tsx`

Main download manager page with queue list and controls.

```tsx
import React, { useEffect, useState } from 'react';

interface Download {
  id: number;
  status_name: string;
  source_type: string;
  model_name: string;
  model_type: string;
  file_size_bytes: number | null;
  downloaded_bytes: number;
  download_speed_bps: number | null;
  hash_verified: boolean;
  hash_mismatch: boolean;
  error_message: string | null;
}

export const DownloadManagerPage: React.FC = () => {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [resolvedInfo, setResolvedInfo] = useState<any>(null);

  // Poll for progress updates
  useEffect(() => {
    const interval = setInterval(fetchDownloads, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleUrlPaste = async (url: string) => {
    setNewUrl(url);
    const info = await fetch('/api/downloads/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }).then(r => r.json());
    setResolvedInfo(info);
  };

  return (
    <div className="download-manager">
      <h1>Model & LoRA Downloads</h1>

      {/* URL input */}
      <div className="download-input">
        <input
          type="text"
          placeholder="Paste CivitAI, HuggingFace, or direct download URL..."
          value={newUrl}
          onChange={(e) => handleUrlPaste(e.target.value)}
        />
      </div>

      {/* Resolved info preview */}
      {resolvedInfo && (
        <DownloadPreview
          resolved={resolvedInfo.resolved}
          duplicate={resolvedInfo.duplicate}
          onConfirm={handleStartDownload}
          onCancel={() => setResolvedInfo(null)}
        />
      )}

      {/* Download queue */}
      <div className="download-queue">
        {downloads.map(dl => (
          <DownloadItem
            key={dl.id}
            download={dl}
            onPause={() => pauseDownload(dl.id)}
            onResume={() => resumeDownload(dl.id)}
            onCancel={() => cancelDownload(dl.id)}
            onRetry={() => retryDownload(dl.id)}
          />
        ))}
      </div>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] URL input with paste detection (auto-resolve on paste)
- [ ] Resolved preview shows: model name, type, base model, file size, source
- [ ] Duplicate warning if hash match found
- [ ] Download queue with progress bars
- [ ] Progress: downloaded/total, speed, ETA
- [ ] Pause/Resume/Cancel controls per download
- [ ] Retry button for failed downloads
- [ ] Navigate away and return without losing progress

### Task 7.2: Download Progress Item Component
**File:** `frontend/src/components/downloads/DownloadItem.tsx`

**Acceptance Criteria:**
- [ ] Progress bar with percentage
- [ ] Speed display (MB/s)
- [ ] ETA calculation from speed and remaining bytes
- [ ] Status badge (queued, downloading, paused, verifying, completed, failed)
- [ ] Hash mismatch warning indicator
- [ ] Source icon (CivitAI, HuggingFace, or generic)

### Task 7.3: Download Preview Dialog
**File:** `frontend/src/components/downloads/DownloadPreview.tsx`

**Acceptance Criteria:**
- [ ] Shows model metadata: name, type, base model, trigger words, description
- [ ] Preview images from source (if available)
- [ ] Target path (resolved from placement rules)
- [ ] Duplicate warning with link to existing asset
- [ ] Confirm / Cancel buttons
- [ ] Option to edit model name before registration

### Task 7.4: API Token Settings
**File:** `frontend/src/components/downloads/ApiTokenSettings.tsx`

**Acceptance Criteria:**
- [ ] Sections for CivitAI and HuggingFace tokens
- [ ] Token input with save button
- [ ] Shows token hint (last 4 chars) when stored
- [ ] Delete token button
- [ ] Status indicator (valid/invalid, last used)

### Task 7.5: Placement Rules Admin
**File:** `frontend/src/components/downloads/PlacementRulesAdmin.tsx`

**Acceptance Criteria:**
- [ ] Table of placement rules: model type, base model, target directory, priority, active
- [ ] Add new rule form
- [ ] Edit/delete existing rules
- [ ] Toggle active/inactive

---

## Phase 8: Testing

### Task 8.1: Source Integration Tests
**File:** `tests/download_source_tests.rs`

**Acceptance Criteria:**
- [ ] CivitAI URL parsing handles all URL formats
- [ ] HuggingFace URL parsing handles repo URLs and `owner/model` format
- [ ] Direct URL fallback extracts filename from Content-Disposition or URL path
- [ ] Invalid URLs return clear errors
- [ ] Source detection correctly routes CivitAI, HuggingFace, and direct URLs

### Task 8.2: Download Queue Tests
**File:** `tests/download_queue_tests.rs`

**Acceptance Criteria:**
- [ ] Enqueue creates download record with correct status
- [ ] Concurrent download limit enforced
- [ ] Pause sets status to paused
- [ ] Resume re-queues and continues download
- [ ] Cancel stops download and cleans up
- [ ] Progress updates are written to database

### Task 8.3: Hash Verification Tests
**File:** `tests/download_hash_tests.rs`

**Acceptance Criteria:**
- [ ] Correct SHA-256 computed for known test files
- [ ] Hash match returns `hash_verified: true, hash_mismatch: false`
- [ ] Hash mismatch returns `hash_verified: true, hash_mismatch: true`
- [ ] Missing expected hash skips comparison
- [ ] 100% of corrupted downloads caught (per success metric)

### Task 8.4: Placement & Registration Tests
**File:** `tests/download_placement_tests.rs`

**Acceptance Criteria:**
- [ ] Specific rule (type + base model) takes priority over generic (type only)
- [ ] Default rules resolve correctly for all model types
- [ ] Registration creates asset record with correct metadata
- [ ] Asset linked to download via `asset_id`
- [ ] Placement rules route files to correct directory 100% of the time (per success metric)

### Task 8.5: Duplicate Detection Tests
**File:** `tests/download_duplicate_tests.rs`

**Acceptance Criteria:**
- [ ] Matching hash returns existing asset info
- [ ] Non-matching hash returns no duplicate
- [ ] Missing hash returns no duplicate (no false positives)
- [ ] Case-insensitive hash comparison

### Task 8.6: Token Encryption Tests
**File:** `tests/download_token_tests.rs`

**Acceptance Criteria:**
- [ ] Store and retrieve returns original token
- [ ] Encrypted data differs from plaintext
- [ ] Token hint shows last 4 characters
- [ ] Invalid key fails decryption gracefully
- [ ] Upsert updates existing token

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_model_downloads.sql` | Download queue table |
| `migrations/{timestamp}_create_api_tokens.sql` | Encrypted API token storage |
| `migrations/{timestamp}_create_placement_rules.sql` | Model placement rules with defaults |
| `src/download_manager/mod.rs` | Module root |
| `src/download_manager/sources/civitai.rs` | CivitAI API client |
| `src/download_manager/sources/huggingface.rs` | HuggingFace API client |
| `src/download_manager/sources/detector.rs` | URL source auto-detection |
| `src/download_manager/queue.rs` | Background download queue with semaphore |
| `src/download_manager/hash_verification.rs` | SHA-256 verification |
| `src/download_manager/placement.rs` | Placement rule resolution |
| `src/download_manager/registration.rs` | PRD-017 asset registry integration |
| `src/download_manager/duplicate_check.rs` | Hash-based duplicate detection |
| `src/download_manager/token_service.rs` | Encrypted API token management |
| `src/routes/downloads.rs` | API endpoints |
| `frontend/src/components/downloads/DownloadManagerPage.tsx` | Main download page |
| `frontend/src/components/downloads/DownloadItem.tsx` | Progress item component |
| `frontend/src/components/downloads/DownloadPreview.tsx` | Pre-download preview dialog |
| `frontend/src/components/downloads/ApiTokenSettings.tsx` | Token management UI |
| `frontend/src/components/downloads/PlacementRulesAdmin.tsx` | Placement rules admin |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-017: `assets` table, `asset_types`, `asset_statuses` for registration
- PRD-046: Worker pool (post-MVP: model distribution to workers)

### New Infrastructure Needed
- `reqwest` crate for HTTP downloads and API calls
- `sha2` crate for SHA-256 hashing
- `aes-gcm` crate for AES-256-GCM token encryption
- `url` crate for URL parsing
- `regex` crate for URL pattern matching
- `csv` crate (already used by other PRDs)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Source API Integrations (Tasks 2.1-2.3)
3. Phase 3: Download Engine (Tasks 3.1-3.2)
4. Phase 4: Placement & Registration (Tasks 4.1-4.3)
5. Phase 5: API Token Management (Task 5.1)
6. Phase 6: API Endpoints (Tasks 6.1-6.2)

**MVP Success Criteria:**
- Downloads from CivitAI/HuggingFace complete at line-speed
- Hash verification catches 100% of corrupted downloads
- Auto-registration correctly populates >90% of metadata fields from source
- Placement rules correctly route files to the right directory 100% of the time

### Post-MVP Enhancements
1. Phase 7: Frontend (Tasks 7.1-7.5)
2. Phase 8: Testing (Tasks 8.1-8.6)
3. Worker distribution (PRD-046 integration for syncing to all GPUs)

---

## Notes

1. **CivitAI API rate limits:** CivitAI has rate limits on their API. The client should respect `429 Too Many Requests` responses with exponential backoff. Consider caching model metadata responses to avoid redundant API calls.
2. **Large file downloads:** Model files can be 2-10GB. The streaming download with chunked writes avoids loading the entire file into memory. The 8MB hash buffer provides good throughput on SSDs.
3. **Resume support:** HTTP Range headers enable resuming paused downloads. The `downloaded_bytes` field tracks how much was already written. Not all servers support Range requests — fall back to full re-download if the server responds with 200 instead of 206.
4. **Encryption key management:** The AES-256-GCM key for token encryption should be loaded from an environment variable (`ENCRYPTION_KEY`), not hardcoded. Key rotation is out of scope for MVP.
5. **Open questions from PRD:** Rate limiting downloads is handled by the concurrent download semaphore (default 3). Token expiry/revocation is handled by marking `is_valid = FALSE` and letting the next API call fail gracefully with a user-visible error. Torrent/multi-source downloads are deferred to post-MVP.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
