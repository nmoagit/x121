# PRD-169: Asynchronous Post-Import Video Transcoding Pipeline

**Document ID:** 169-prd-async-video-transcoding
**Status:** Draft
**Version:** v1.2
**Author:** AI Product Manager
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

---

## 1. Introduction/Overview

PRD-165 (Server-Side Directory & S3 Import) shipped a server-side import engine that uploads original video bytes without running H.264 transcoding. Inline transcoding would block the SSE progress stream for minutes per file and break bulk imports of 50+ videos — so the transcode step was deliberately deferred to a follow-up. The consequence today is that any imported video in a non-browser-compatible codec (HEVC/h.265, AV1, some MPEG variants) plays back as a broken tile in the UI: no thumbnail, no scrub bar, nothing happens when the user clicks play.

The existing multipart upload and server-path upload handlers in `scene_video_version.rs` (`import_video`, `import_from_path`, `import_directory`) still run `ensure_h264` inline — blocking the HTTP response for minutes on non-H.264 files and producing two divergent code paths for "get a video into the system." This PRD introduces an **asynchronous transcoding pipeline** and routes **every** video-entry point through it: on import, each video is ffprobe'd; if it's already H.264 the record is marked `completed` immediately; otherwise a job is enqueued and a polling background worker transcodes the file to H.264 using the existing `ffmpeg::transcode_web_playback` helper, updating state on success or failure. The inline `ensure_h264` call is removed from all handlers. The frontend surfaces a "Processing" state on clip/media cards and in the player so users always know whether a given video is playable.

The goal is a single, consistent code path regardless of how a video entered the system (HTTP multipart drop, JSON server-path, or PRD-165 batch scan): every managed video ends up as browser-playable H.264, HTTP responses return quickly (under ~10s even for large non-H.264 files), and users see clear feedback while they wait.

## 2. Related PRDs & Dependencies

### Depends On (Hard)

- **PRD-165** (Server Directory & S3 Import) — `done` (2026-04-17). Provides the server-side import engine (`directory_scan_import.rs`) this PRD extends. The enqueue hook lives immediately after video upload in the `videos` phase.
- **PRD-008** (Queue Management & Job Scheduling) — `done`. Provides the job state machine and status conventions reused by the new `transcode_jobs` table.

### Depends On (Soft)

- **PRD-107** (Character Readiness & State View) — `done`. Establishes the readiness-indicator visual pattern we reuse for the "Processing" badge.
- **PRD-030 / Part 4** (Design System) — readiness patterns, Badge component, tooltip patterns.
- **PRD-109** (Scene Video Versioning) — `done`. Defines `scene_video_versions` records affected by transcode state. In v1 this is the **only** entity type the transcode pipeline touches (see §7 and §9 Assumptions).
- **PRD-021** (Source Image / Media Variants) — `done`. Defines `media_variants`. v1 explicitly does **not** transcode `media_variants` rows — current usage is image-only (confirmed during v1.1 scope review). Retained here for context only.

### Extends

- **PRD-165** — this PRD closes the "transcode deferred" follow-up flagged in that PRD's final report.
- **PRD-163** (Backend Async Runtime Optimization) — `done`. Standardized `ensure_h264` to a file-path API, which this PRD's worker calls.

### Conflicts With

- None. The inline `ensure_h264` in `scene_video_version.rs` (three callsites: `import_video`, `import_from_path`, `import_directory`) is **removed** by this PRD — all three handlers are migrated to the async pipeline in v1 (see Requirement 1.3 and 1.12). The helper function itself is deleted once no callsites remain.

## 3. Goals

### Primary Goals

1. Every imported video is eventually playable in the browser, regardless of source codec and import path.
2. **All** import paths are async and return quickly: PRD-165 SSE streams complete as soon as files are uploaded and enqueued, and HTTP multipart / server-path uploads return in well under 10s for a non-H.264 file (upload + ffprobe + DB insert only).
3. Users always know a video's playability state: ready, processing, or failed.
4. Already-H.264 files skip the queue entirely and are marked `completed` at import time.
5. **One code path for all video imports.** Inline `ensure_h264` is removed from the codebase. Future entry points plug into the same pipeline instead of growing a third variant.

### Secondary Goals

5. Retries recover from transient ffmpeg failures without operator intervention.
6. Concurrency is bounded and configurable so transcoding cannot starve the rest of the backend of CPU.
7. Transcode history is queryable for debugging ("why is this video still processing?").

## 4. User Stories

- **As a content operator**, when I import 80 HEVC videos from an S3 bucket, the import finishes in under a minute and the app shows "Processing 80 videos" so I can go do something else instead of watching a progress bar for an hour.
- **As a content operator**, when I click a clip card that's still transcoding, I want the player to tell me it's being processed rather than silently failing, so I don't think the file is broken.
- **As a content operator**, when a transcode fails, I want to see the error and be able to retry or delete the video, rather than have it stuck "processing" forever.
- **As a content operator**, when I upload an already-H.264 video through the scene import, I don't want it to wait in a queue for no reason.
- **As an admin**, I want a worker that doesn't use all CPU cores, so concurrent generation jobs and API traffic remain responsive.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: `transcode_jobs` Table (Polymorphic Queue)

**Description:** Introduce a dedicated `transcode_jobs` table that tracks one job per video that needs transcoding. The schema is **polymorphic** via an `entity_type` column so future entity types can register without a migration, but in v1 the only registered entity type is `scene_video_version`. This is **Option B** from the exploration — recommended over per-table status columns because it avoids schema churn, enables retry/attempt tracking in one place, and gives us a single source of truth for analytics and admin views.

**Acceptance Criteria:**
- [ ] Migration creates `transcode_jobs` with columns:
  - `id BIGSERIAL PRIMARY KEY`
  - `uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()`
  - `entity_type TEXT NOT NULL CHECK (entity_type IN ('scene_video_version'))` — v1 only. Future entity types are added by extending the CHECK constraint (single-line migration), not restructuring the table.
  - `entity_id BIGINT NOT NULL`
  - `status_id INT NOT NULL REFERENCES transcode_job_statuses(id)` (seed: `pending`, `in_progress`, `completed`, `failed`, `cancelled`)
  - `attempts INT NOT NULL DEFAULT 0`
  - `max_attempts INT NOT NULL DEFAULT 3`
  - `next_attempt_at TIMESTAMPTZ` (null for immediate pickup, set to a future time when scheduling a retry)
  - `source_codec TEXT` (from ffprobe at enqueue, for diagnostics)
  - `source_storage_key TEXT NOT NULL`
  - `target_storage_key TEXT` (populated on success)
  - `error_message TEXT` (populated on final failure)
  - `started_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `deleted_at TIMESTAMPTZ` (soft delete — follows platform convention, never `revoked_at`)
- [ ] Unique partial index: `(entity_type, entity_id) WHERE deleted_at IS NULL AND status_id IN ('pending','in_progress')` — one active job per entity at a time.
- [ ] Index: `(status_id, next_attempt_at)` for the worker claim query.
- [ ] Index: `(entity_type, entity_id)` for frontend lookups.
- [ ] New lookup table `transcode_job_statuses` follows PRD-00's lookup-table convention (id + code + label).

#### Requirement 1.2: `transcode_state` Surface Column on `scene_video_versions`

**Description:** Although the job queue is the source of truth, consumers (API endpoints, cards, player) need a fast, denormalized read of "is this video playable?" without joining `transcode_jobs`. Add a narrow status column to the v1 target table, kept in sync by the worker. v1 scope is **`scene_video_versions` only** — `media_variants` is not touched (see §7 non-goals).

**Acceptance Criteria:**
- [ ] Migration adds `transcode_state TEXT NOT NULL DEFAULT 'completed' CHECK (transcode_state IN ('pending','in_progress','completed','failed'))` to `scene_video_versions`.
- [ ] Default `'completed'` so all existing rows (the backfill case) continue to be treated as playable, preserving current behavior. See §14 open question on whether to backfill accurate codec-derived values for pre-existing rows.
- [ ] Index: `WHERE transcode_state <> 'completed'` partial index on `scene_video_versions` — cheap "what's pending?" queries for the frontend badges.
- [ ] The worker updates this column atomically with the job-table state transition (single transaction).
- [ ] No change to `media_variants` — if/when video variants are supported there in a future PRD, that PRD adds the column and registers `'media_variant'` in the `transcode_jobs.entity_type` CHECK.

#### Requirement 1.3: Unified Enqueue Hook at Every Video-Entry Point

**Description:** Every code path that creates a `scene_video_versions` row for a video must ffprobe the uploaded file once and then follow the same two-branch logic: if the video codec is already browser-compatible (h264/vp9/vp8/av1 per `is_browser_compatible`), mark `transcode_state = 'completed'` and skip the queue; otherwise set `transcode_state = 'pending'` and enqueue a `transcode_jobs` row. No handler performs an inline transcode. The codebase exploration for this PRD enumerated the following entry points that must be wired through this hook:

| # | Handler / function | File | Trigger |
|---|---|---|---|
| 1 | `import_video_from_source` | `apps/backend/crates/api/src/handlers/directory_scan_import.rs` (line 806) | PRD-165 server-side directory / S3 scan, `videos` phase |
| 2 | `import_video` | `apps/backend/crates/api/src/handlers/scene_video_version.rs` (line 434) | `POST /api/v1/scenes/{scene_id}/versions` — HTTP multipart browser drop |
| 3 | `import_from_path` | `apps/backend/crates/api/src/handlers/scene_video_version.rs` (line 1146) | JSON server-path import for a single clip |
| 4 | `import_directory` | `apps/backend/crates/api/src/handlers/scene_video_version.rs` (line 1311) | Pre-PRD-165 batch directory scanner for derived clips — per-file loop at line 1576 |

**Acceptance Criteria:**
- [ ] A single shared helper (e.g. `background::video_transcode::enqueue_if_needed(pool, svv_id, storage_key) -> Result<TranscodeState, Error>`) encapsulates the ffprobe + branch + insert-job logic. All four handlers call it; none duplicate the decision.
- [ ] H.264 / browser-compatible videos: `scene_video_versions.transcode_state = 'completed'`, no `transcode_jobs` row created, helper returns `TranscodeState::Completed`.
- [ ] Non-H.264 videos: `scene_video_versions.transcode_state = 'pending'`, a `transcode_jobs` row is inserted with `status='pending'`, `source_codec` populated, and `source_storage_key` set. Helper returns `TranscodeState::Pending`.
- [ ] Works identically for derived clips (still writes to `scene_video_versions`).
- [ ] Inline `ensure_h264` is deleted from `scene_video_version.rs` (all three callsites at lines 519, 1207, 1576 pre-migration) and the helper itself is removed once no callsites remain. A grep for `ensure_h264` in `apps/backend` returns zero results after this PRD ships.
- [ ] Video media variants in `media_variants` are **out of scope** — current platform usage confirms `media_variants` holds image rows only.

#### Requirement 1.4: Background Worker (`background::video_transcode`)

**Description:** New background module `apps/backend/crates/api/src/background/video_transcode.rs` polls for pending jobs and processes them. Structure mirrors `background/delivery_assembly.rs` (tokio interval + cancellation token + `process_next` claim-and-run pattern) so the codebase has one consistent async worker shape.

**Acceptance Criteria:**
- [ ] Module exports `pub async fn run(state: AppState, cancel: CancellationToken)` matching `delivery_assembly::run` signature.
- [ ] Poll interval: 5 seconds (faster than delivery assembly because transcodes are expected to be frequent during imports).
- [ ] Each tick:
  1. Claims up to N jobs where N = `transcode.concurrency` setting (default 2).
  2. Claiming sets `status='in_progress'`, `started_at=NOW()`, `attempts=attempts+1` in one `UPDATE ... RETURNING` to prevent double-claim across workers.
  3. Filters claim: `status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())`.
- [ ] Claimed jobs run concurrently via `tokio::spawn`, each awaiting the existing `ffmpeg::transcode_web_playback` helper.
- [ ] Cancellation: on `cancel.cancelled()`, in-flight transcodes are allowed to finish their current job (no mid-ffmpeg kill); the worker stops claiming new ones. This matches `delivery_assembly`'s shutdown behavior.
- [ ] Worker registered in `background/mod.rs` and spawned from the main entry point alongside other background tasks.

#### Requirement 1.4a: Worker-Startup Stalled-Job Recovery

**Description:** If the backend crashes (or is force-killed) mid-transcode, the claimed job remains with `status='in_progress'` and will never progress again without intervention. Resolved in v1: on every worker startup, run a single cleanup pass that resets stalled in-progress jobs back to `pending` and increments their `attempts` counter. This is cheap (a single UPDATE) and eliminates the "stuck processing" failure mode without requiring admin intervention. (Resolves v1.0 open question Q2.)

**Acceptance Criteria:**
- [ ] Before entering its polling loop, `video_transcode::run` executes one `UPDATE transcode_jobs SET status='pending', attempts=attempts+1, started_at=NULL, updated_at=NOW() WHERE status='in_progress' AND started_at < NOW() - INTERVAL '10 minutes' AND deleted_at IS NULL` — where **10 minutes** = 2× the expected transcode timeout.
- [ ] The `'10 minutes'` literal is a named constant in the module (e.g. `const STALLED_JOB_THRESHOLD: Duration = Duration::from_secs(600);`) so it can be tuned later without hunting through SQL strings.
- [ ] The matching `scene_video_versions.transcode_state` is reset from `'in_progress'` back to `'pending'` in the same transaction.
- [ ] Count of reset rows is logged at `info` level with the `transcode` target so the operator sees "recovered N stalled jobs on boot".
- [ ] If `attempts` reaches `max_attempts` as a result of the increment, the job is marked `failed` instead (reuses the normal retry-exhaustion path from Requirement 1.6). An unattended crash loop cannot silently churn through all retry attempts.
- [ ] Unit test covers: (a) fresh `in_progress` row within the threshold is left alone, (b) stale `in_progress` row older than the threshold is reset, (c) stale row whose incremented `attempts` would exceed `max_attempts` is marked `failed`.

#### Requirement 1.5: Transcode Execution and Storage Key Strategy

**Description:** The worker reads the source file from managed storage via `StorageProvider`, transcodes it to a local temp file using `ffmpeg::transcode_web_playback`, uploads the result, and swaps the entity's `file_path` to point at the new file.

**Acceptance Criteria:**
- [ ] Target storage key = same directory as source, with suffix `-h264.mp4` before the extension (e.g. `x121/scenes/scene_42_v1_20260417.mov` → `x121/scenes/scene_42_v1_20260417-h264.mp4`). Flagged decision — see §10.
- [ ] Upload uses the platform's active `StorageProvider` (works for both Local and S3 backends — PRD-122).
- [ ] The entity row (`scene_video_versions.file_path`) is updated in the same transaction as `transcode_state='completed'` and `transcode_jobs.status='completed'`.
- [ ] `target_storage_key` is stored on the job row for traceability.
- [ ] Temp files are cleaned up in both success and failure paths.

#### Requirement 1.6: Retry Policy with Exponential Backoff

**Description:** ffmpeg failures are often transient (disk space, transient S3 errors, container restart). The worker retries up to `max_attempts` (default 3) with exponential backoff before marking a job `failed`.

**Acceptance Criteria:**
- [ ] On failure, if `attempts < max_attempts`:
  - `status` returns to `pending`
  - `next_attempt_at = NOW() + INTERVAL '{2^attempts * 30 seconds}'` (30s, 60s, 120s)
  - `error_message` is updated with the latest error
- [ ] On failure when `attempts >= max_attempts`:
  - `status = 'failed'`
  - `transcode_state = 'failed'` on the owning row
  - `error_message` populated with the final error
  - `completed_at = NOW()`
- [ ] Admin API exposes `POST /admin/transcode-jobs/{id}/retry` to reset `attempts=0`, `status='pending'`, `next_attempt_at=NULL`. Also exposed via Requirement 1.8 at the editor-role-gated `POST /transcode-jobs/{id}/retry` endpoint.

#### Requirement 1.7: Original File Disposition

**Description:** After a successful transcode, the original non-H.264 file is **deleted** from managed storage to save space. This is the recommended resolution. Flagged as a decision — see §10.

**Acceptance Criteria:**
- [ ] On success, after the entity's `file_path` has been pointed at the new transcoded file, the original `source_storage_key` file is deleted via `StorageProvider::delete()`.
- [ ] Deletion happens **after** the DB transaction commits, so a DB failure can't orphan the transcoded file and leave the user with no video.
- [ ] On failure (final `failed` status), the original is **kept** so an admin can diagnose and re-run. The entity row still points at the original path, and `transcode_state='failed'` tells the UI not to try playing it.
- [ ] Deletion errors are logged but do not fail the job — transcode success is already committed.

#### Requirement 1.8: API — Expose Transcode State

**Description:** Existing endpoints that return videos must surface `transcode_state`. A small set of new endpoints support admin visibility and user-initiated retry.

**Acceptance Criteria:**
- [ ] `GET /scene-video-versions/{id}` and all list endpoints include `transcode_state`, `transcode_error` (when failed), and when processing, `transcode_started_at` and `transcode_attempts` (useful for the "being processed for 2 minutes" UX).
- [ ] `GET /media-variants/*` endpoints are **unchanged** in v1 — media variants have no `transcode_state` column (see §7 non-goals).
- [ ] `GET /admin/transcode-jobs?status=&entity_type=` (admin only): paginated list of jobs for debugging. Filters: `status`, `entity_type` (v1: only `scene_video_version`), `created_since`.
- [ ] `GET /admin/transcode-jobs/{id}`: single-job detail including full error.
- [ ] `POST /transcode-jobs/{id}/retry`: reset a failed job for re-processing (admin + project editor roles).

#### Requirement 1.9: Frontend — "Processing" State on Cards

**Description:** Clip cards, scene cards, and media cards must show a clear "Processing" badge when `transcode_state !== 'completed'`. Failed transcodes show a distinct error badge.

**Acceptance Criteria:**
- [ ] Pending/in-progress state: neutral "Processing" badge with spinning icon on the card thumbnail overlay (extends the readiness-indicator pattern from PRD-107/128).
- [ ] Failed state: red "Transcode failed" badge with tooltip showing `transcode_error`.
- [ ] Card click on a non-completed video opens the player but the player shows the overlay from Requirement 1.10 — the video element is not mounted.
- [ ] Badge component is shared (single `<TranscodeStatusBadge />`), not per-card-type.
- [ ] Visual design matches existing status-badge tokens (no new colors — reuse design-system tokens).

#### Requirement 1.10: Frontend — Player Overlay for Processing / Failed

**Description:** When the user opens a clip modal or media preview whose video isn't ready, the player shows a dedicated overlay instead of attempting to load a broken video element.

**Acceptance Criteria:**
- [ ] `transcode_state === 'pending' | 'in_progress'`: overlay reads "This video is being processed for browser playback" with a spinner and — when `transcode_started_at` is set — a rough "Started 2 min ago" line. No video element is mounted.
- [ ] `transcode_state === 'failed'`: overlay reads "Transcoding failed" with the error message and a "Retry" button that calls `POST /transcode-jobs/{id}/retry` (visible only to users with the required role).
- [ ] `transcode_state === 'completed'`: normal player behavior, unchanged.
- [ ] Works in `ClipPlaybackModal` and any other surface that plays a `scene_video_versions` file. `ImagePreviewModal` is unaffected in v1 because media variants are image-only (see §7 non-goals). Overlay component is still shared to stay ready for future reuse.

#### Requirement 1.11: Frontend — Real-time Completion Refresh

**Description:** When a transcode completes, the affected card should update without requiring a page reload. We reuse the existing `ActivityLogBroadcaster` — confirmed generic during v1.1 scope review (see §9 "Activity broadcaster integration") — so no new real-time mechanism is introduced.

**Acceptance Criteria:**
- [ ] Worker publishes an `ActivityLogEntry` on every state transition (`pending→in_progress`, `in_progress→completed`, `in_progress→failed`). Entry shape:
  - `source = ActivityLogSource::Api` (the background task runs in the api process)
  - `level = Info` on progress, `Error` on failure
  - `message = "Transcode {state}"` (human-readable, shown in the activity console)
  - `entity_type = "scene_video_version"`, `entity_id = <svv.id>`
  - `fields = { "kind": "transcode.updated", "state": "<state>", "job_uuid": "<uuid>", "progress": <0..1 or null>, "error": <null|string> }`
  - `project_id` populated when derivable from the owning scene.
- [ ] The `fields.kind = "transcode.updated"` tag is the subscription filter on the frontend — this is our convention for distinguishing transcode events from other curated activity entries flowing through the same broadcaster.
- [ ] Frontend subscribes through the existing activity WebSocket channel, filters on `fields.kind === "transcode.updated"`, and invalidates the affected queries (clip-detail, version-list, scene-detail) using the `(entity_type, entity_id)` pair.
- [ ] No more than one update per entity per second even if the backend emits duplicates (debounce).
- [ ] **Fallback (connectivity loss):** if the activity WebSocket is not connected, visibility-based polling every 5 seconds on any page that has a card with `transcode_state !== 'completed'` keeps cards moving. Polling is paused when the tab is hidden (matches PRD-159 pattern).
- [ ] Unit test: broadcaster publish from the worker happens inside the DB transaction's commit callback, not before — so a failed commit does not leak a phantom "completed" event.

#### Requirement 1.12: HTTP Upload Response Semantics — Non-Blocking Returns

**Description:** Today, `POST /api/v1/scenes/{scene_id}/versions` (multipart), the JSON `import_from_path` endpoint, and the batch `import_directory` endpoint all block their HTTP response until `ensure_h264` finishes — which can be minutes for a single HEVC clip and tens of minutes for a batch. Under this PRD, all three return as soon as the upload + ffprobe + DB insert are done; transcoding happens asynchronously in the background worker. This changes what the caller observes but **not** the response body shape.

**Acceptance Criteria:**
- [ ] `POST /api/v1/scenes/{scene_id}/versions` returns `201 Created` with the same JSON body shape as today (`DataResponse<SceneVideoVersion>`). The only semantic change is that `transcode_state` on the returned row may be `pending` (non-H.264 source) or `completed` (H.264 source). Callers must not assume the file at `file_path` is playable until `transcode_state === 'completed'`.
- [ ] `import_from_path` and `import_directory` return on the same timing: no inline transcode work blocks the response. `import_directory` summary rows may include a mix of `pending` and `completed` states.
- [ ] P50 HTTP latency for a 100 MB non-H.264 multipart upload drops from ~2 min (with inline transcode) to **< 10s** on reference 4-core hardware: bytes in + ffprobe + two DB inserts only.
- [ ] P50 HTTP latency for an already-H.264 multipart upload of the same size drops by the amount previously spent on the ffprobe-then-no-op path (~200–400 ms improvement — we still ffprobe, but we no longer spawn ffmpeg).
- [ ] **No frontend callsite attempts to play the video if `transcode_state !== 'completed'`.** Every UI surface that mounts a `<video>` element for a `scene_video_versions` row must gate on the state — either by the shared overlay in Requirement 1.10, or by not rendering the player at all. Concretely, verified during implementation: `ClipPlaybackModal`, scene-version pickers, derived-clip browser, clip comparison view, and any thumbnail autoplay hover. An integration test grep on the frontend should find **no** direct `<video src={version.file_path}>` constructions that bypass the state check.
- [ ] Frontend upload flows (ImportClipDialog and the batch-import UI) update their success toast/dialog copy: instead of "Video uploaded and ready," the copy reads "Video uploaded — processing for playback" when the returned `transcode_state === 'pending'`. Wording is centralized in a single shared string so future languages have one anchor.
- [ ] OpenAPI schema for the upload endpoints is updated to mark `transcode_state` as a documented field on `SceneVideoVersion`, with the four-value enum from Requirement 1.2.

### Phase 2: Enhancements (Post-MVP)

- **2.1** Progress percentage during transcode (parse ffmpeg's `-progress pipe:1` stderr stream → broadcast via activity bus → show in the player overlay as "45% — ~2 min remaining").
- **2.2** Scheduled transcode windows (off-peak, tied to PRD-87 power-management policies).
- **2.3** Admin "Transcode Queue" page showing pending / in-progress / failed jobs with per-row retry and cancel.
- **2.4** Resolution-aware transcode (produce a lower-res derivative for card preview in addition to full-res H.264, reusing `transcode_preview`).
- **2.5** Parallel segment transcoding for videos > 5 minutes.

## 6. Non-Functional Requirements

### Performance

- Claim query for the worker tick must be O(1) via the `(status_id, next_attempt_at)` index — no table scans even with 10k historical jobs.
- Concurrency default of 2 keeps CPU below 50% on a 4-core server during bulk imports. Configurable via platform setting `transcode.concurrency` (1–8).
- A single 1-minute HEVC clip should transcode in ≤ 2× its duration on a 4-core server (this is an ffmpeg property; we just document it).
- **HTTP upload handler latency budget**: upload receipt + ffprobe + DB insert(s) must complete in under 10s P50 for a 100 MB file on a 4-core server. No ffmpeg transcode runs on the request thread.

### Reliability

- Double-claim impossible: the claim `UPDATE ... WHERE status='pending' ... RETURNING` is atomic on a single row.
- Worker crash mid-job does not orphan the job permanently — see Requirement 1.4a. The worker-startup cleanup pass resets stalled `in_progress` jobs older than 10 minutes back to `pending` (incrementing `attempts`) automatically on every boot. No manual admin intervention required.
- Temp files cleaned up on all exit paths via RAII (`scopeguard` or explicit `Drop` impl).

### Security

- `POST /transcode-jobs/{id}/retry` requires editor role on the owning project (same authorization as re-upload).
- Admin endpoints gated by admin role.
- No new storage-key injection surfaces — target keys derived server-side from the entity record.

## 7. Non-Goals (Out of Scope)

### v1 Non-Goals

- **Audio-only transcoding.** Audio files are not affected by this system.
- **Alternative codec targets.** Output is always H.264 main-profile MP4. No AV1, VP9, HEVC output, no user-selectable profile (that's what PRD-137 output format profiles are for on the delivery side, not the import side).
- **Real-time / HLS streaming.** We produce a static `.mp4` file. No manifest generation, no segmented playback.
- **GPU-accelerated transcode.** CPU `libx264` only for v1. NVENC and cloud transcoders (AWS MediaConvert, Elemental) are explicit non-goals.
- **Cross-version migration / retroactive transcode.** Existing rows are grandfathered as `transcode_state='completed'` regardless of their actual codec. We don't retroactively transcode the existing library. See §14 open question on whether to at least backfill accurate `transcode_state` values by running ffprobe over the existing library.
- **`media_variants` video rows.** Confirmed during v1.1 scope review: all video imports (HTTP multipart, server-path, and PRD-165 server-scan) write exclusively to `scene_video_versions`. `media_variants` is used for images only in current practice. If video variants land in `media_variants` in a future PRD, the polymorphic `transcode_jobs` table supports adding them without schema changes — just extend the `entity_type` CHECK constraint and register the new type in the worker dispatcher. (Resolves v1.0 open question Q5.)

### Deferred to v2

- **Multi-instance worker coordination.** v1 assumes a single backend process. Moving to multi-instance requires the claim query to become `SELECT ... FROM transcode_jobs WHERE ... FOR UPDATE SKIP LOCKED` (or equivalent `UPDATE ... RETURNING` with row locks). This is a query-only change — no schema migration — and is cheap to add when the operational need arises. See §9 "Assumptions" for the specific change. (Resolves v1.0 open question Q3.)
- **Per-project concurrency isolation.** v1 uses a single global FIFO queue (see §9 "Queueing discipline"). Per-project fairness (a "max concurrent transcodes per project" limit, or weighted round-robin) is deferred — it can be added later by adding a `project_id` column to `transcode_jobs` and a `GROUP BY project_id LIMIT` in the claim query. (Resolves v1.0 open question Q4.)
- **Progress-percent broadcasting during transcode.** Phase 2.1. v1 broadcasts state transitions only (`pending → in_progress → completed/failed`), not percentage progress.

## 8. Design Considerations

### Frontend Components to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| Readiness indicator pattern | PRD-107/128 | Model the processing badge on the same circle-dot + tooltip pattern |
| `StatusBadge` | design system | Badge chrome for "Processing" / "Failed" |
| Query invalidation hook patterns | `features/queue` | Mirror delivery-assembly invalidation |
| ClipPlaybackModal overlay slot | existing | Overlay mounts in the same slot as "empty version" warnings today |
| Activity console subscriber plumbing | `features/activity-log` | Existing WebSocket client already parses `ActivityLogEntry`; we add a `fields.kind === "transcode.updated"` filter, not a new transport |

### UX Flow

**Server-scan bulk import (PRD-165):**
1. User kicks off a server-side import of 80 HEVC clips via PRD-165.
2. Import engine uploads each file, ffprobes, enqueues 80 transcode jobs. SSE stream completes in ~90 seconds.
3. Clip cards render with "Processing" badges; clicking one opens the player overlay.
4. Worker (concurrency 2) processes ~2 clips/min; cards flip to ready state as each completes.
5. Any failures show a red badge; admin clicks Retry or ignores.

**HTTP multipart upload (`POST /scenes/{id}/versions`):**
1. User drops a single HEVC clip into ImportClipDialog.
2. Browser uploads multipart; handler ffprobes, writes the `scene_video_versions` row with `transcode_state='pending'`, and enqueues one `transcode_jobs` row.
3. HTTP response returns in under 10s with the new version row.
4. Frontend success toast reads "Video uploaded — processing for playback." Card renders with the Processing badge.
5. Worker picks up the job on its next tick; activity broadcaster publishes `transcode.updated` events; card flips to ready.

**HTTP server-path / batch directory (`import_from_path`, `import_directory`):** identical flow to the multipart case — the handler no longer blocks on transcode. `import_directory` may return a result set with a mix of `pending` and `completed` rows.

## 9. Technical Considerations

### Existing Code to Reuse

| Code | Location | Use |
|------|----------|-----|
| `ffmpeg::transcode_web_playback` | `core/src/ffmpeg.rs:313` | The transcode call itself — already produces browser-compatible H.264 main-profile at original resolution. |
| `ffmpeg::is_browser_compatible` | `core/src/ffmpeg.rs:373` | The H.264 shortcut at import time. |
| `ffmpeg::probe_video` | `core/src/ffmpeg.rs:103` | To populate `source_codec` on enqueue. |
| `background::delivery_assembly` pattern | `api/src/background/delivery_assembly.rs` | Blueprint for worker loop, cancellation, log_step, error enum. |
| `StorageProvider` trait | `core` crate (PRD-122) | Read source, write target, delete original. |
| `activity_broadcaster` | existing | Real-time completion events. |
| PRD-008 job state conventions | existing | Naming of statuses and the lookup-table seed pattern. |

### Database Changes

- **New lookup table:** `transcode_job_statuses` (id, code, label). Seed: `pending`, `in_progress`, `completed`, `failed`, `cancelled`.
- **New table:** `transcode_jobs` (full shape in Requirement 1.1). Follows platform ID strategy: `id BIGSERIAL` + `uuid UUID`. Soft delete via `deleted_at`. `entity_type` CHECK seeded with only `'scene_video_version'` in v1; future entity types extend the CHECK.
- **Alter:** `scene_video_versions` adds `transcode_state TEXT NOT NULL DEFAULT 'completed' CHECK (...)`.
- **No change to `media_variants`.** v1 does not touch that table — see §7.
- **Indexes:** per Requirements 1.1 and 1.2.

### API Changes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/admin/transcode-jobs` | Admin list with filters |
| `GET` | `/api/v1/admin/transcode-jobs/{id}` | Admin detail |
| `POST` | `/api/v1/transcode-jobs/{id}/retry` | Retry a failed job (editor+) |
| existing | `/api/v1/scene-video-versions/*` | Extended response to include `transcode_state` + related fields |
| existing | `/api/v1/media-variants/*` | **Unchanged in v1.** No `transcode_state` field on these responses — media variants are image-only. |

### Worker Registration

Add `pub mod video_transcode;` to `background/mod.rs`. Spawn in the main entry alongside `delivery_assembly::run`, `activity_persistence::run`, etc. — no new infrastructure needed.

### Activity Broadcaster Integration

Confirmed during v1.1 scope review (resolves v1.0 open question Q1):

- The platform's `ActivityLogBroadcaster` (at `crates/events/src/activity.rs`) is **fully generic**. It carries `ActivityLogEntry` values where `entity_type` is an arbitrary `Option<String>` and `fields` is an arbitrary `serde_json::Value`. There is **no hardcoded event enum** to extend.
- The backend already publishes arbitrary curated/verbose entries from many subsystems (delivery assembly, infrastructure, pipeline, comfyui). The worker adding `transcode.updated` events requires **no backend plumbing change** — just `state.activity_broadcaster.publish(entry)` calls from the worker, the same one-liner pattern used in `background/delivery_assembly.rs:710`.
- Frontend already receives these entries through its existing activity WebSocket connection; the only frontend change is a subscription filter on `fields.kind === "transcode.updated"` and the TanStack Query invalidations listed in Requirement 1.11.
- Because the broadcaster is tokio `broadcast::Sender`-backed (no durable queue), we must not rely on it for critical correctness: state is derived from the DB, the broadcast event just tells the frontend to refetch. Requirement 1.11's visibility-based polling fallback covers the "frontend missed an event" case (e.g. WebSocket dropped during a transient network blip).

### Queueing Discipline (v1: Global FIFO)

v1 uses a single global FIFO queue — claim query orders by `created_at ASC`. Rationale (resolves v1.0 open question Q4):

- Matches the existing `background/delivery_assembly.rs` worker shape, so there is one queueing idiom in the codebase instead of two.
- Simpler to implement and reason about than per-project fairness.
- Per-project isolation can be added later as a "max N concurrent transcodes per project" limit without any schema migration — just a `project_id` column (nullable) on `transcode_jobs` and a `HAVING count(*) < N` subclause in the claim query. The `project_id` lookup would flow from `scene_video_versions → scenes → project_id`.
- In practice, v1 bulk imports are single-project affairs (an operator is ingesting content for one project at a time), so global FIFO is acceptable for the realistic workload.

### Assumptions

v1 makes these assumptions explicitly so post-v1 work has a clear list of what must change if an assumption breaks:

- **Single-instance backend.** The claim `UPDATE ... WHERE status='pending' ... RETURNING` is atomic per-row in PostgreSQL, so it's race-free for a single worker loop. Running two backend processes would double-claim jobs because the CTE above doesn't lock rows against concurrent updaters. Multi-instance support requires rewriting the claim as `SELECT id FROM transcode_jobs WHERE status='pending' ... FOR UPDATE SKIP LOCKED LIMIT N` wrapped in a transaction, followed by the `UPDATE ... RETURNING`. This is a query-only change, scoped to the `claim_pending` function — no schema migration. (Resolves v1.0 open question Q3.)
- **`media_variants` holds images only.** Confirmed against the codebase during v1.1 scope review. If a future PRD ever writes video rows to `media_variants`, that PRD must extend `transcode_jobs.entity_type`'s CHECK constraint, add a `transcode_state` column to `media_variants`, and register the new dispatch branch in the worker. The polymorphic table supports this without disrupting v1 data. (Resolves v1.0 open question Q5.)
- **The existing activity WebSocket channel is the real-time path.** If that channel is ever retired or replaced, Requirement 1.11's subscription filter and the worker's `publish` call both need to move to the replacement — the DB state machine is unaffected.

## 10. Decisions to Resolve Before Implementation

These are recommendations with explicit flags for the owner to confirm:

1. **State tracking model**: Recommend **Option B** (dedicated `transcode_jobs` table) over Option A (per-table columns only). Option B is chosen here; §5.1 and §5.2 together implement B with a narrow denormalized `transcode_state` column for fast reads. The table is polymorphic (`entity_type` column) but v1 only registers `scene_video_version` — see §7 and §9 Assumptions.
2. **Original file**: Recommend **delete on success, keep on failure**. See Requirement 1.7.
3. **Storage key convention**: Recommend `<original-basename>-h264.mp4` in the same directory as the source. Alternatives considered: (a) same key, new extension — reversible but loses the original, (b) separate `/transcoded/` prefix — adds a key-layout variant we don't otherwise have.
4. **HTTP upload handlers migrated to async in v1**: Decision confirmed 2026-04-17 — `import_video`, `import_from_path`, and `import_directory` all drop inline `ensure_h264` and return immediately with `transcode_state='pending'` on non-H.264 sources. See Requirements 1.3 and 1.12. Rationale: eliminates code-path divergence, removes the minutes-long HTTP block on single-file drops, and avoids a second migration later.
5. **Worker concurrency default**: **2**. Configurable via platform setting `transcode.concurrency` in the admin settings panel (PRD-110).
6. **Retry policy**: **3 attempts, exponential backoff 30s/60s/120s**. No jitter needed — volume is low.

## 11. Edge Cases & Error Handling

- **ffprobe returns non-H.264 but transcode_web_playback produces an H.264 identical to the source**: fine, the resulting file is still correct; we just did unnecessary work. Not worth optimizing.
- **Corrupt video file**: ffprobe fails → enqueue with `source_codec='unknown'` → transcode fails → retries exhausted → `status='failed'` with the ffmpeg stderr → operator sees the error on the card.
- **Disk full on temp dir**: ffmpeg fails → retry after backoff → likely still full → eventually `failed`. Admin must free space and click Retry.
- **Source file missing at worker time** (e.g. someone deleted it): ffmpeg fails with "No such file". Same as above — mark `failed`, surface error.
- **Entity soft-deleted while queued**: worker checks `deleted_at IS NULL` on the owning row before claiming; if deleted, job is marked `cancelled`.
- **Two concurrent transcode runs for the same entity**: prevented by the unique partial index from Requirement 1.1.
- **Storage backend swapped (Local ↔ S3) while a job is pending**: `source_storage_key` was recorded at enqueue, but the backend resolves keys via the *current* provider. If an admin swaps backends with pending jobs, those jobs will fail on next run. Acceptable — admin-only scenario, they can Retry after the new backend has the data.
- **Worker runs out of time during shutdown**: the in-flight transcode completes (or ffmpeg exits cleanly within a few seconds). Worst case, a single job is orphaned in `in_progress`. The next worker boot's cleanup pass (Requirement 1.4a) recovers it within 10 minutes — no admin action required.

## 12. Success Metrics

- **Bulk import latency (PRD-165 server-scan)**: bulk server-side import of 50 HEVC clips completes the SSE stream in < 2 minutes (vs. 20+ minutes today with inline transcode in the multipart path).
- **Single-file HTTP upload latency (P50, non-H.264 source, 100 MB)**: drops from ~2 min (with inline `ensure_h264`) to **< 10s** on reference 4-core hardware. Applies to all three migrated HTTP handlers (`import_video`, `import_from_path`, `import_directory`).
- **Single-file HTTP upload latency (P50, already-H.264 source)**: improves by ~200–400 ms (saves the transcode-spawn path on the happy case; ffprobe still runs).
- **Background worker throughput**: ≥ 30 jobs/hour at `transcode.concurrency = 2` for typical 1-minute HEVC clips on reference 4-core hardware.
- **Playback broken-tile rate**: drops to 0 for non-H.264 imports once their transcode completes.
- **Transcode success rate**: ≥ 98% on first attempt for well-formed videos.
- **Worker p50 job latency**: ≤ 2× source duration on reference 4-core hardware.
- **No duplicate transcodes**: zero observed in a 1-week production window.
- **Code-path count**: exactly **one** code path from "a video enters the system" to "transcode_state reaches completed." A grep for `ensure_h264` in `apps/backend` returns zero results.

## 13. Testing Requirements

- **Unit**: retry-policy math (backoff intervals), claim-query SQL (mocked), is-browser-compatible integration with fixture videos (h264/hevc/av1 samples already in the test corpus from PRD-109).
- **Integration** (backend):
  - Enqueue an HEVC clip, run worker tick, assert row state transitions.
  - Enqueue an H.264 clip — assert no row is created, state is `completed` immediately.
  - Force ffmpeg failure via a corrupt fixture — assert retries and final `failed`.
  - Concurrent double-enqueue — assert unique-index violation surfaces cleanly.
- **Integration** (frontend):
  - Card renders Processing badge when `transcode_state='in_progress'`.
  - Player overlay renders correctly for each state.
  - Retry button calls the right endpoint and invalidates the right query.
- **E2E**: import a directory with mixed codecs, wait for worker completion, assert all clips play.

## 14. Open Questions

1. **Retroactive `transcode_state` backfill for the existing library.** v1 grandfathers all existing `scene_video_versions` rows as `transcode_state='completed'` via the column's DEFAULT — regardless of actual codec. That matches current behaviour (today's library is playable to the extent it is) but means any HEVC file that was previously imported via the PRD-165 path before this PRD lands will still silently fail to play. Options: (a) accept it — operators can delete and re-import those specific clips; (b) run a one-time ffprobe sweep migration that sets `transcode_state='pending'` on non-H.264 rows and enqueues `transcode_jobs` for them, letting the worker catch up over minutes/hours; (c) add an admin CLI command to do the sweep on demand. Leaning (c) for v1 — least disruptive but still gives operators a recovery path without a data migration that could surprise a deployment.
2. **Should we record ffprobe output at enqueue time?** Today we only capture `source_codec`. Capturing the full probe JSON would cost ~1-4 KB per job but give us resolution, bitrate, and duration for the admin view "transcode jobs" list without another ffprobe at display time. Decide at implementation time.
3. **Worker concurrency upper bound.** Configurable 1–8 per §6 Performance; is 8 too low for 16+ core production hardware? Defer until we have real-world telemetry on worker utilization.

### Resolved in v1.1

1. **Q1 — Activity broadcaster accepts arbitrary event payloads**: Confirmed generic. The worker publishes `ActivityLogEntry` with `fields.kind = "transcode.updated"` through the existing `ActivityLogBroadcaster` — no backend plumbing change needed. Frontend subscribes through the existing activity WebSocket and filters on `fields.kind`. See Requirement 1.11 and §9 "Activity Broadcaster Integration".
2. **Q2 — Stalled-job recovery**: **Included in v1** via worker-startup cleanup pass. See Requirement 1.4a.
3. **Q3 — Multi-worker coordination**: **Deferred to v2**. Documented in §7 "Deferred to v2" and §9 "Assumptions" — change is a query-only migration to `SELECT ... FOR UPDATE SKIP LOCKED` when the operational need arises.
4. **Q4 — Per-project concurrency isolation**: **Deferred to v2**. v1 uses a single global FIFO. See §9 "Queueing Discipline" for rationale and the incremental path to per-project limits.
5. **Q5 — `media_variants` video rows**: **Out of scope in v1**. Confirmed against the codebase that `media_variants` holds images only in current practice; video imports all flow to `scene_video_versions`. The polymorphic `transcode_jobs` table still supports adding `media_variants` later without schema restructuring. See §7 non-goals and §9 "Assumptions".

## 15. Version History

- **v1.2** (2026-04-17): Unified the HTTP multipart / server-path / batch-directory upload handlers into the async transcode pipeline. Previously deferred to Phase 2. Reason: reduces code-path divergence (one pipeline instead of two) and eliminates the multi-minute user-facing wait on single-file HTTP drops. Rewrote Requirement 1.3 to enumerate every video-entry point (four handlers across `directory_scan_import.rs` and `scene_video_version.rs`) and added the shared `enqueue_if_needed` helper. Added Requirement 1.12 (HTTP upload response semantics) covering non-blocking returns, P50 < 10s latency target, the "no frontend callsite plays the video if `transcode_state !== 'completed'`" acceptance criterion, and copy changes in upload UIs. Removed "switching legacy multipart to async" from v1 Non-Goals and from §10 Decisions. Updated §3 Primary Goals (added goal 5: one code path), §6 Performance (added HTTP handler latency budget), §8 UX Flow (added HTTP multipart and server-path flows), §12 Success Metrics (added HTTP P50 latency, worker throughput, and the `ensure_h264` grep-zero target). Cleared "Deferred to v2" of the multipart-migration entry; the section now lists multi-instance coordination, per-project isolation, and progress-percent broadcasting.
- **v1.1** (2026-04-17): Resolved all five v1.0 open questions. Narrowed MVP scope to `scene_video_versions` only — removed `media_variants` from the migration, Req 1.2, Req 1.3, Req 1.5, Req 1.8, and Req 1.10 (kept as a documented "register later" extension point on the polymorphic `transcode_jobs` table). Confirmed `ActivityLogBroadcaster` is generic — Requirement 1.11 now specifies the exact event shape (`fields.kind = "transcode.updated"`) and a visibility-based polling fallback. Added Requirement 1.4a (worker-startup stalled-job cleanup pass — 10-minute threshold, incrementing `attempts`, transitions to `failed` if retries exhausted). Added §9 subsections "Activity Broadcaster Integration", "Queueing Discipline (v1: Global FIFO)", and "Assumptions". Split §7 into "v1 Non-Goals" and "Deferred to v2". Open-questions list refreshed with three new scope-narrowing questions (retroactive backfill, ffprobe JSON capture, concurrency upper bound).
- **v1.0** (2026-04-17): Initial PRD creation. Resolves the "transcode deferred" follow-up from PRD-165.
