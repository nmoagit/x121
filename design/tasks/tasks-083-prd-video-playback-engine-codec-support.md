# Task List: Video Playback Engine & Codec Support

**PRD Reference:** `design/prds/083-prd-video-playback-engine-codec-support.md`
**Scope:** Build the foundational video player component with hardware-accelerated decoding, frame-accurate seeking, professional transport controls, A-B looping, adaptive bitrate preview, audio management, and thumbnail generation.

## Overview

Every review, preview, and comparison feature in the platform depends on a video player, yet none define it. Frame-accurate seeking is non-negotiable for professional QA. This PRD provides the foundational video player component: hardware-accelerated decoding via WebCodecs API, frame-accurate seeking by frame number or timecode, professional transport controls (speed 0.1x-4x, frame stepping), A-B loop playback, adaptive bitrate serving (proxy for browsing, full quality on demand), audio management with pitch correction, and thumbnail generation. This engine is reused by PRD-035, PRD-036, PRD-037, PRD-055, PRD-068, PRD-078, PRD-082, and PRD-084.

### What Already Exists
- PRD-029 design system components (for player chrome)
- PRD-000 database infrastructure

### What We're Building
1. Video player React component with professional controls
2. Hardware-accelerated decoding via WebCodecs API with software fallback
3. Frame-accurate seeking engine (no keyframe approximation)
4. Playback speed control (0.1x to 4x) with frame stepping
5. A-B loop system
6. Adaptive bitrate streaming (proxy/full quality)
7. Audio track management with waveform visualization
8. Server-side thumbnail generation and caching
9. Backend API for video streaming, thumbnails, and metadata

### Key Design Decisions
1. **WebCodecs first, HTMLVideoElement fallback** — WebCodecs provides hardware-accelerated GPU decoding; HTMLVideoElement as universal fallback.
2. **Frame-accurate = mandatory** — No nearest-keyframe approximation. The player decodes the exact requested frame.
3. **Proxy by default, full on demand** — Library browsing serves lower-resolution proxies; Review Interface serves full quality.
4. **Embeddable anywhere** — The player component can be dropped into any panel/view context.

---

## Phase 1: Database & API for Video Metadata & Thumbnails

### Task 1.1: Create Video Thumbnails Table
**File:** `migrations/YYYYMMDD_create_video_thumbnails.sql`

```sql
CREATE TABLE video_thumbnails (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    thumbnail_path TEXT NOT NULL,
    interval_seconds REAL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_thumbnails_segment_id ON video_thumbnails(segment_id);
CREATE UNIQUE INDEX uq_video_thumbnails_segment_frame ON video_thumbnails(segment_id, frame_number);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON video_thumbnails
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `video_thumbnails` stores extracted frame thumbnails per segment
- [ ] Unique constraint on (segment_id, frame_number)
- [ ] Indexes on FK columns, `updated_at` trigger

### Task 1.2: Video Metadata Model & Repository
**File:** `src/models/video.rs`, `src/repositories/video_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VideoThumbnail {
    pub id: DbId,
    pub segment_id: DbId,
    pub frame_number: i32,
    pub thumbnail_path: String,
    pub interval_seconds: Option<f32>,
    pub width: i32,
    pub height: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub duration_seconds: f64,
    pub codec: String,
    pub width: i32,
    pub height: i32,
    pub framerate: f64,
    pub total_frames: i64,
    pub audio_tracks: Vec<AudioTrackInfo>,
}
```

**Acceptance Criteria:**
- [ ] `VideoThumbnail` model with `DbId` fields
- [ ] `VideoMetadata` response struct for client
- [ ] Repository: CRUD for thumbnails, metadata extraction service
- [ ] Unit tests for repository operations

### Task 1.3: Video Streaming & Metadata API
**File:** `src/routes/video.rs`

```rust
pub fn video_routes() -> Router<AppState> {
    Router::new()
        .route("/videos/:id/stream", get(stream_video))
        .route("/videos/:id/thumbnail/:frame", get(get_thumbnail))
        .route("/videos/:id/metadata", get(get_metadata))
}

/// GET /videos/:id/stream?quality=proxy|full
/// Serves video with range request support for adaptive quality
async fn stream_video(Path(id): Path<DbId>, Query(params): Query<StreamParams>) -> impl IntoResponse;
```

**Acceptance Criteria:**
- [ ] `GET /videos/:id/stream?quality=proxy|full` streams video with HTTP range request support
- [ ] `GET /videos/:id/thumbnail/:frame` returns thumbnail image for specific frame
- [ ] `GET /videos/:id/metadata` returns duration, codec, resolution, framerate, audio info
- [ ] Proxy quality serves lower-resolution version
- [ ] Full quality serves original resolution

---

## Phase 2: Codec Detection & Hardware Acceleration

### Task 2.1: Codec Detector
**File:** `frontend/src/features/video-player/codecDetector.ts`

```typescript
interface CodecCapability {
  codec: string;
  hardwareAccelerated: boolean;
  supported: boolean;
}

export async function detectCodecCapabilities(): Promise<CodecCapability[]> {
  const codecs = ['avc1.42E01E', 'hvc1.1.6.L93.B0', 'vp09.00.10.08', 'av01.0.04M.08'];
  // Test each codec via VideoDecoder.isConfigSupported() or MediaSource.isTypeSupported()
}
```

**Acceptance Criteria:**
- [ ] Detect support for H.264, H.265/HEVC, VP9, AV1
- [ ] Identify hardware acceleration availability per codec
- [ ] Runtime capability detection selects optimal decode path
- [ ] Results cached for session duration

### Task 2.2: WebCodecs Decoder
**File:** `frontend/src/features/video-player/webCodecsDecoder.ts`

```typescript
export class WebCodecsDecoder {
  private decoder: VideoDecoder;

  constructor(codec: string, onFrame: (frame: VideoFrame) => void);
  seek(frameNumber: number): Promise<void>;
  decode(chunk: EncodedVideoChunk): void;
  flush(): Promise<void>;
  close(): void;
}
```

**Acceptance Criteria:**
- [ ] WebCodecs API used for GPU-accelerated decoding where available
- [ ] Fallback to software decoding for unsupported formats
- [ ] Clean error message (not silent failure) for unsupported codecs

### Task 2.3: HTMLVideoElement Fallback
**File:** `frontend/src/features/video-player/htmlVideoFallback.ts`

**Acceptance Criteria:**
- [ ] Fallback to standard HTMLVideoElement when WebCodecs unavailable
- [ ] Same public API as WebCodecs decoder
- [ ] Graceful degradation: frame-accurate seeking may use keyframe + decode in fallback

---

## Phase 3: Frame-Accurate Seeking

### Task 3.1: Frame-Accurate Seek Engine
**File:** `frontend/src/features/video-player/frameAccurateSeeker.ts`

```typescript
export class FrameAccurateSeeker {
  constructor(private decoder: WebCodecsDecoder | HTMLVideoFallback);

  /// Seek to exact frame by frame number
  async seekToFrame(frameNumber: number): Promise<VideoFrame>;

  /// Seek to exact frame by timecode (HH:MM:SS:FF)
  async seekToTimecode(timecode: string): Promise<VideoFrame>;

  /// Convert between frame number and timecode
  frameToTimecode(frame: number, fps: number): string;
  timecodeToFrame(timecode: string, fps: number): number;
}
```

**Acceptance Criteria:**
- [ ] Seek to any frame by frame number or timecode (HH:MM:SS:FF)
- [ ] No nearest-keyframe approximation — exact frame delivery
- [ ] First frame rendered within 200ms of seek
- [ ] Frame counter display showing current frame number and total frames

---

## Phase 4: Player Component & Transport Controls

### Task 4.1: Video Player Component
**File:** `frontend/src/features/video-player/VideoPlayer.tsx`

```typescript
interface VideoPlayerProps {
  segmentId: number;
  quality?: 'proxy' | 'full';
  autoPlay?: boolean;
  onFrameChange?: (frame: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  // Embeddable player with full transport controls
  // Frame counter and timecode always visible
};
```

**Acceptance Criteria:**
- [ ] Embeddable in any panel/view context
- [ ] Frame counter and timecode always visible during review
- [ ] Player chrome follows PRD-029 design system
- [ ] Controls follow video industry conventions

### Task 4.2: Playback Speed Control
**File:** `frontend/src/features/video-player/SpeedControl.tsx`

**Acceptance Criteria:**
- [ ] Continuous speed from 0.1x to 4x
- [ ] Frame-by-frame stepping forward and backward
- [ ] Keyboard shortcuts for common speeds: 1x, 0.5x, 0.25x, 2x
- [ ] Speed indicator displayed in player chrome

### Task 4.3: Timeline Scrubber
**File:** `frontend/src/features/video-player/TimelineScrubber.tsx`

**Acceptance Criteria:**
- [ ] Draggable scrub bar for timeline navigation
- [ ] Thumbnail preview on hover (from cached thumbnails)
- [ ] Frame-accurate scrub position
- [ ] Markers for A-B loop points (Phase 5)

---

## Phase 5: A-B Loop

### Task 5.1: A-B Loop System
**File:** `frontend/src/features/video-player/useABLoop.ts`

```typescript
export function useABLoop() {
  return {
    setInPoint: (frame: number) => void;
    setOutPoint: (frame: number) => void;
    clearLoop: () => void;
    isLooping: boolean;
    inPoint: number | null;
    outPoint: number | null;
  };
}
```

**Acceptance Criteria:**
- [ ] Set loop in-point and out-point
- [ ] Repeated playback within the defined range
- [ ] Clear visual markers on the timeline scrubber for in/out points
- [ ] Keyboard shortcuts for set in/out/clear

---

## Phase 6: Adaptive Bitrate & Audio

### Task 6.1: Adaptive Bitrate Controller
**File:** `frontend/src/features/video-player/useAdaptiveBitrate.ts`

**Acceptance Criteria:**
- [ ] Library browsing and dashboard serve lower-resolution proxy versions
- [ ] Review Interface serves full-quality on demand
- [ ] Seamless quality transition without playback interruption
- [ ] Quality selector in player chrome

### Task 6.2: Audio Track Manager
**File:** `frontend/src/features/video-player/AudioManager.tsx`

**Acceptance Criteria:**
- [ ] Play, mute, or select audio tracks when present
- [ ] Volume control with visual feedback
- [ ] Audio follows playback speed with pitch correction
- [ ] Support for audio scrubbing/vinyl mode (used by PRD-037)
- [ ] Waveform visualization for audio tracks

---

## Phase 7: Thumbnail Generation

### Task 7.1: Server-Side Thumbnail Extractor
**File:** `src/services/thumbnail_extractor.rs`

```rust
pub struct ThumbnailExtractor {
    // Uses FFmpeg to extract frames at configurable intervals
}

impl ThumbnailExtractor {
    pub async fn extract_thumbnails(
        &self,
        segment_id: DbId,
        video_path: &str,
        interval_seconds: f32,
    ) -> Result<Vec<VideoThumbnail>>;
}
```

**Acceptance Criteria:**
- [ ] Extract thumbnails at configurable intervals (default: every 1 second)
- [ ] Thumbnails stored as JPEG/WebP at a standard size
- [ ] Thumbnails cached in the database and filesystem
- [ ] Used by library views, dashboard, and comparison grids

---

## Phase 8: Integration & Testing

### Task 8.1: Player Integration Tests
**File:** `frontend/src/features/video-player/__tests__/`

**Acceptance Criteria:**
- [ ] Frame-accurate seeking delivers exact requested frame 100% of the time
- [ ] Smooth playback at 24/30/60fps without dropped frames
- [ ] A-B loop correctly repeats the defined range
- [ ] Speed control works across all supported speeds
- [ ] Codec fallback works when WebCodecs unavailable
- [ ] Adaptive bitrate switches without playback interruption
- [ ] Memory-efficient: no full-video buffering

### Task 8.2: Backend Integration Tests
**File:** `tests/video_api_test.rs`

**Acceptance Criteria:**
- [ ] Video streaming with range requests works correctly
- [ ] Thumbnail extraction produces valid images
- [ ] Metadata API returns correct codec, duration, resolution, framerate
- [ ] Proxy and full quality streams serve correct resolutions

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_video_thumbnails.sql` | Thumbnail storage table |
| `src/models/video.rs` | Rust model structs |
| `src/repositories/video_repo.rs` | Video/thumbnail repository |
| `src/routes/video.rs` | Streaming, thumbnail, metadata API |
| `src/services/thumbnail_extractor.rs` | FFmpeg-based thumbnail extraction |
| `frontend/src/features/video-player/VideoPlayer.tsx` | Main player component |
| `frontend/src/features/video-player/codecDetector.ts` | Codec capability detection |
| `frontend/src/features/video-player/webCodecsDecoder.ts` | WebCodecs decoder |
| `frontend/src/features/video-player/frameAccurateSeeker.ts` | Frame-accurate seeking |
| `frontend/src/features/video-player/useABLoop.ts` | A-B loop system |
| `frontend/src/features/video-player/AudioManager.tsx` | Audio management |

## Dependencies
- PRD-029: Design system (player chrome styling)
- PRD-052: Keyboard shortcuts (playback controls)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — thumbnails table, streaming, metadata API
2. Phase 2 (Codecs) — codec detection, WebCodecs decoder, HTMLVideoElement fallback
3. Phase 3 (Seeking) — frame-accurate seek engine
4. Phase 4 (Player) — main component, speed control, timeline scrubber
5. Phase 5 (A-B Loop) — loop system
6. Phase 6 (Adaptive & Audio) — bitrate switching, audio management
7. Phase 7 (Thumbnails) — server-side extraction

### Post-MVP Enhancements
- HDR support with tone-mapping fallback for SDR displays

## Notes
- This is a foundational component used by 8+ other PRDs. Stability and API completeness are critical.
- Frame-accurate seeking is the defining requirement — without it, this is not a professional QA tool.
- Performance targets: first frame in <200ms, smooth playback at target framerate.
- Memory-efficient: stream and decode on demand, no full-video buffering.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
