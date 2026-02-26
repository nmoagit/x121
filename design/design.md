# Image-to-Video Platform: Master Specification (v2)

This document is the architectural blueprint, divided into granular, PRD-ready modules. It supersedes `design_v1.md`, incorporating new modules for project organization, real-time infrastructure, search, scheduling, and operational tooling.

---

## Part 0: Architecture & Data Standards

### [PRD-00] Database Normalization & Strict Integrity
- **Standard:** 3rd Normal Form (3NF) minimum.
- **Lookup Tables:** All statuses (Job, Approval, Worker, Role) must reside in dedicated tables. No text-column state storage.
- **Relational Integrity:** Cascading rules and strict foreign keys to prevent metadata or file-to-DB mismatches.
- **Decision:** Essential for a professional studio tool to prevent "Data Drift" and ensure 100% reliable technical hand-offs.

### [PRD-01] Project, Character & Scene Data Model
- **Features:** Hierarchical entity model defining the relationships between Projects, Characters, Scene Types, Scenes, and Video Segments. Reflects the actual production workflow where characters have image variants, and each variant is used as the seed for multiple scene types.

- **Key Entities:**
  - **Project** — Top-level container. Has a name, status, and retention policy. A project contains one or more Characters.
  - **Character** — Belongs to a project. Represents a single model/avatar identity.
    - **Source Image** — The original model image (e.g., `topless.png`). This is the ground-truth reference for the character's likeness.
    - **Derived Images** — Generated variants of the source (e.g., `clothed.png` generated from the topless source). Each variant becomes a seed image for scene generation.
    - **Image Variants** — The set of available seed images for this character: `topless`, `clothed`, and potentially others. Each variant has a status (pending generation / approved / rejected).
    - **Metadata** — Character biographical and configuration data (`metadata.json`). Managed in parallel to the video pipeline — used for downstream delivery, not for driving generation.
  - **Scene Type** — A reusable definition for a kind of scene (e.g., `dance`, `idle`, `bj`, `feet`). Defined at the project or studio level.
    - **Workflow** — The ComfyUI workflow JSON used for this scene type.
    - **LoRA / Model Configuration** — Which models and weights apply to this scene type.
    - **Prompt Template** — The base prompt structure, with slots for character-specific substitution.
    - **Target Duration** — The total video duration this scene type should produce (e.g., 30s, 60s).
    - **Segment Duration** — How long each individual generated segment should be (e.g., 5s), determining how many segments are needed.
  - **Scene** — A concrete instance: one Character + one Scene Type + one Image Variant. For example, "Jane Dough / dance / clothed" is one scene, "Jane Dough / dance / topless" is another.
    - **Image Variant** — Which seed image this scene uses (`clothed` or `topless`).
    - **Transition Mode** — Normal (single variant throughout) or `clothes_off` (starts clothed, transitions to topless at a configured segment boundary).
    - **Status** — Pending, Generating, Review, Approved, Rejected.
    - Contains an ordered sequence of **Segments**.
  - **Segment** — An individual generated video clip within a scene.
    - **Sequence Index** — Position in the scene (001, 002, 003...).
    - **Seed Frame** — The input image/frame used to generate this segment (source image for segment 001, last frame of previous segment for 002+).
    - **Output Video** — The generated video file.
    - **Last Frame** — Extracted final frame, used as the seed for the next segment.
    - **Quality Scores** — Auto-QA results from PRD-49 (face confidence, motion score, boundary SSIM).
    - **Status** — Pending, Generating, QA Pass, QA Fail, Approved, Rejected.

- **Naming Convention:**
  Scene video names follow the pattern: `{prefix_}{content}{_clothes_off}{_index}.mp4`
  - `prefix_` — `topless_` if the scene uses the topless variant; omitted if clothed.
  - `content` — Lowercase snake_case scene type name (e.g., `dance`, `bj`, `feet`).
  - `_clothes_off` — Appended when the scene transitions from clothed to topless.
  - `_index` — `_1`, `_2`, etc. when multiple videos exist for the same content.
  - Examples: `bj.mp4`, `topless_bj.mp4`, `boobs_clothes_off.mp4`, `topless_feet_2.mp4`

- **Delivery Structure:**
  Final output is a ZIP archive per project:
  ```
  output.zip
  ├── CharacterName/
  │   ├── metadata.json
  │   ├── clothed.png
  │   ├── topless.png
  │   ├── dance.mp4
  │   ├── topless_dance.mp4
  │   ├── idle.mp4
  │   ├── topless_idle.mp4
  │   └── ...
  ├── AnotherCharacter/
  │   └── ...
  ```

- **Decision:** Every other PRD implicitly depends on this taxonomy. The Scene Type entity is critical — it captures the reusable workflow/LoRA/prompt/duration configuration that gets instantiated per character per variant. Without it, scene configuration would be duplicated across every character. The naming convention and delivery structure are contractual — they define the interface with the downstream consumer (external to this platform for now, integrated later).

---

## Part 1: Infrastructure & System Core

### [PRD-02] Backend Foundation (Rust/Axum)
- **Stack:** Axum, SQLx (PostgreSQL), Tokio.
- **Role:** High-performance async orchestration and WebSocket management.

### [PRD-03] User Identity & RBAC
- **Features:** JWT Auth, Admin/Creator/Reviewer roles.
- **Decision:** Creators have "Final Approval" rights to maintain production speed while allowing Reviewers to focus on QA.

### [PRD-04] Session & Workspace Persistence
- **Features:** DB-backed storage of UI state including open files, panel layouts, scroll positions, zoom level, and undo tree position.
- **Sub-features:**
  - **Layout Persistence** — Panel sizes, positions, and visibility per user.
  - **Navigation State** — Which project/scene/segment the user had open, including playback position.
  - **Undo Tree Snapshot** — Serialized undo/redo history so users can resume mid-edit.
  - **Per-Device Profiles** — Separate workspace states for desktop vs. tablet (Director's View).
- **Decision:** Professional users must be able to log out and return to the exact same visual state. The sub-feature breakdown reflects the distinct storage and restoration challenges of each state category.

### [PRD-05] ComfyUI WebSocket Bridge
- **Features:** Real-time state syncing between Rust and ComfyUI.
- **Decision:** Enables the "Interactive Debugger" and real-time progress bars.

### [PRD-06] Hardware Monitoring & Direct Control
- **Features:** GPU Vitals (VRAM/Temp) + "One-Click Restart" for hanging services.
- **Decision:** Reduces downtime by allowing Admins to fix GPU issues without terminal access.

### [PRD-07] Parallel Task Execution Engine
- **Features:** Background job queue allowing UI multitasking.
- **Decision:** Users shouldn't be "locked" by a 30-second render; they can set up the next job in parallel.

### [PRD-08] Queue Management & Job Scheduling
- **Features:** Priority-based job ordering, cancellation/pause of queued jobs, GPU resource allocation policies, time-based scheduling, and queue visibility dashboard.
- **Key Capabilities:**
  - **Priority Levels** — Urgent (review re-renders), Normal (standard generation), Background (batch/speculative).
  - **Fair Scheduling** — Configurable per-user or per-project GPU time quotas to prevent starvation.
  - **Job Lifecycle** — Queued, Dispatched, Running, Paused, Cancelled, Failed, Complete — with transitions enforced by the state machine.
  - **Cancellation** — Clean mid-run cancellation with partial output preservation (keep completed segments).
  - **Scheduled Submission** — Submit jobs with a future start time: "Run this batch starting at 10pm." Jobs sit in a "Scheduled" state until the trigger time, then enter the queue. Useful for running large batches overnight or during off-peak hours.
  - **Off-Peak Policy** — Mark jobs as "off-peak only" so they only dispatch when no interactive/urgent jobs are queued. Automatically yields to higher-priority work during business hours without manual pause/resume.
  - **Recurring Schedules** — For regression testing (PRD-65) or regular batch runs, schedule repeating jobs (daily, weekly) that auto-submit at the configured time.
- **Decision:** PRD-07 handles execution mechanics but not the policy layer. When multiple creators submit simultaneously, scheduling policy determines who gets the GPU. Time-based scheduling prevents the "submitted 160 scenes at 2pm, GPUs busy all afternoon" problem — heavy batch work can be deferred to overnight without requiring someone to manually submit at 10pm.

### [PRD-09] Multi-Runtime Script Orchestrator
- **Features:** Managed execution of Shell, Python (venv), and C++ binaries.
- **Decision:** Allows the studio to use custom optimized code alongside AI workflows.

### [PRD-10] Event Bus & Notification System
- **Features:** Centralized publish/subscribe event backbone with user-facing notifications, in-app alerts, optional external delivery, and per-user notification preferences.
- **Key Events:**
  - **Job Events** — Started, Progress (%), Completed, Failed.
  - **Review Events** — Submitted for Review, Approved, Rejected, Comment Added.
  - **System Events** — Disk threshold warnings, GPU temperature alerts, service restarts.
  - **Collaboration Events** — `@mention` notifications, segment lock conflicts.
- **Delivery Channels:** In-app toast, Activity Feed (PRD-42), and configurable external webhooks.
- **Per-User Notification Preferences:**
  - **Channel Control** — Per event type, choose delivery channel: in-app only, in-app + email, in-app + Slack, or muted. Example: "Job failures → in-app + Slack. Job completions → in-app only. Other users' jobs → muted."
  - **Scope Filtering** — "Only my jobs," "My projects," or "Everything." Reviewers might want all review events; creators only want their own job events.
  - **Do Not Disturb** — Temporarily mute all non-critical notifications. Queued notifications are delivered when DND ends. Critical alerts (disk full, GPU overheating) bypass DND.
  - **Digest Mode** — Instead of real-time notifications, receive a periodic summary: "5 jobs completed, 2 failed, 3 awaiting review" at a configured interval (hourly/daily).
- **Decision:** Long-running GPU jobs make push notifications essential. Without a unified event bus, every feature builds its own ad-hoc notification path. Without user preferences, high-activity studios flood every user with every event, leading to notification fatigue and eventually users ignoring all alerts — including critical ones.

### [PRD-11] Real-time Collaboration Layer
- **Features:** WebSocket multiplexing for user-to-user presence, segment locking, and live cursor/selection sharing.
- **Key Capabilities:**
  - **Presence Indicators** — See who is viewing/editing each scene in real time.
  - **Segment Locking** — Exclusive edit locks on video segments to prevent conflicting approvals or regenerations.
  - **Conflict Resolution** — Graceful handling when two users attempt the same action (lock contention, simultaneous approval).
  - **Heartbeat & Stale Lock Cleanup** — Automatic release of locks from disconnected sessions.
- **Decision:** Distinct from the ComfyUI WebSocket bridge (PRD-05), which handles machine-to-machine communication. This PRD covers user-to-user real-time state. Studio environments with 3+ simultaneous users need this to prevent "Who overwrote my approval?" scenarios.

### [PRD-12] External API & Webhooks
- **Features:** RESTful API for programmatic access to project data, job submission, and status queries. Outbound webhooks for integration with external pipeline tools. Hardened with security controls.
- **Key Capabilities:**
  - **Read API** — Query projects, characters, scenes, segments, metadata, and job status.
  - **Write API** — Submit jobs, update metadata, trigger approvals (scoped by RBAC).
  - **Webhooks** — Configurable outbound HTTP callbacks on key events (job complete, asset approved). Webhook replay for missed deliveries.
  - **API Keys** — Service account authentication for non-interactive integrations. Per-key scope restrictions (read-only, project-specific, full access).
- **Security Controls:**
  - **Rate Limiting** — Per API key request limits (e.g., 100 req/min read, 20 req/min write). Configurable per key. Returns `429 Too Many Requests` with retry-after header.
  - **IP Allowlisting** — Optionally restrict API access to specific IP ranges per key. Default: unrestricted.
  - **Request Size Limits** — Maximum payload size for write operations. Prevents abuse via oversized uploads.
  - **Audit Trail** — All API calls logged with key ID, endpoint, parameters, and response code. Integrated with PRD-45 audit logging.
  - **Key Rotation** — API keys can be rotated without downtime. Old key remains valid for a configurable grace period (e.g., 24h) after rotation.
- **Decision:** Studio pipelines rarely exist in isolation. Render farms, asset management systems (ShotGrid/ftrack), and custom automation scripts need programmatic access. API security is not optional for a platform handling sensitive content — rate limiting prevents runaway scripts from overwhelming the system, IP restrictions limit the attack surface, and audit trails provide accountability for programmatic actions.

### [PRD-99] Webhook & Integration Testing Console
- **Features:** Interactive debugging environment for testing, inspecting, and troubleshooting outbound webhooks (PRD-12) and HTTP hook calls (PRD-77) before deploying them to production.
- **Key Capabilities:**
  - **Test Payload Sender** — Select a webhook or hook endpoint and send a test payload. Choose from sample events (job completed, segment approved, QA failed) or craft a custom JSON payload. View the full request (headers, body) and response (status code, headers, body, response time).
  - **Delivery Log** — Chronological history of all outbound webhook/hook deliveries: timestamp, endpoint, event type, HTTP status, response time, and payload size. Filter by endpoint, status (success/failure), or event type.
  - **Failed Delivery Inspector** — For failed deliveries: view the full request that was sent, the error response (or timeout), and retry history. One-click manual retry. Bulk retry all failures for a given endpoint.
  - **Endpoint Health** — Per-endpoint success rate, average response time, and recent failures. "Endpoint X has been failing for 2 hours — last successful delivery was at 3:41 PM." Integrated with PRD-10 alerting.
  - **Request Replay** — Replay any historical delivery to re-send the exact same payload. Useful for debugging: fix the receiving end, then replay the failed request.
  - **Mock Endpoint** — Built-in mock receiver for testing webhooks before configuring the real external endpoint. The mock captures all received payloads and displays them in the console.
- **Decision:** PRD-12 and PRD-77 both define outbound HTTP integrations, but neither addresses the "how do I know it's working?" problem. Setting up a webhook integration is a trial-and-error process — wrong URL, wrong auth header, unexpected payload format. Without a testing console, debugging requires checking external service logs, which may not be accessible to the platform admin. The mock endpoint is particularly valuable during initial setup when the external service isn't ready yet.

### [PRD-106] API Usage & Observability Dashboard
- **Features:** Real-time monitoring of API activity and health metrics, providing operational visibility into how external integrations consume the platform's API (PRD-12).
- **Key Capabilities:**
  - **Request Volume** — Real-time and historical request counts per endpoint, per API key, and per time window. "Key 'shotgrid-sync' made 1,240 requests in the last hour — 95% reads, 5% writes."
  - **Response Times** — P50/P95/P99 response time per endpoint. Trend over time. Alert when response times exceed thresholds.
  - **Error Rates** — 4xx and 5xx response rates per endpoint and per key. Spike detection: "Error rate for /api/segments jumped from 1% to 15% in the last 10 minutes."
  - **Rate Limit Utilization** — Per-key dashboard showing current usage vs. configured limit. "Key 'render-farm' is at 82/100 req/min." Warning when keys consistently approach their limits.
  - **Top Consumers** — Ranked list of API keys by request volume, error rate, or bandwidth. Identify which integration is putting the most load on the system.
  - **Endpoint Heatmap** — Visual heatmap showing which endpoints are called most frequently and when. Reveals usage patterns: "The bulk metadata endpoint is hammered every Monday morning at 9 AM."
  - **Export** — Export usage data as CSV or JSON for capacity planning. Feed into PRD-73 (Production Reporting).
- **Decision:** PRD-12 defines the API and its security controls (rate limiting, IP allowlisting, audit trail). But security controls without observability are flying blind. When an integration breaks, the first question is "Is it our API or their client?" — answer requires request/response data. When planning capacity, you need to know actual usage patterns, not guesses. The rate limit utilization view prevents the scenario where a key hits its limit and an integration silently fails because nobody noticed it was approaching the threshold.

### [PRD-46] Worker Pool Management
- **Features:** Registration, monitoring, and orchestration of multiple GPU worker nodes as a managed fleet.
- **Key Capabilities:**
  - **Worker Registration** — Add/remove worker nodes via UI or API. Each worker declares its capabilities (GPU model, VRAM, supported workflow types).
  - **Capability Tags** — Workers tagged with attributes (e.g., `high-vram`, `fast-inference`, `high-res-capable`) that the scheduler (PRD-08) uses for job-to-worker matching.
  - **Health Checks & Heartbeat** — Periodic liveness probes. Workers that miss heartbeats are marked degraded; jobs are automatically re-queued to healthy workers.
  - **Auto-Failover** — If a worker dies mid-job, the job resumes from the last checkpoint (PRD-28) on another available worker.
  - **Load Balancing** — Distribute jobs across workers based on current utilization, capability fit, and queue depth. Avoid piling all work onto one GPU while others idle.
  - **Worker Dashboard** — Real-time view of all workers: status, current job, GPU utilization, uptime, and job history. Integrated into PRD-42 (Studio Pulse).
- **Decision:** Even a small studio with 2-4 GPUs benefits from managed orchestration. PRD-06 monitors individual hardware and PRD-08 schedules jobs, but neither manages the fleet itself. Without this, adding a second GPU means manual coordination of which machine runs what. This PRD also provides the foundation that M-08 (Remote Auto-Scaling) would build on.

### [PRD-75] ComfyUI Workflow Import & Validation
- **Features:** Structured import, validation, and versioning of ComfyUI workflow JSON files before they can be used in scene type configurations.
- **Key Capabilities:**
  - **Workflow Import** — Upload ComfyUI workflow JSON files or pull directly from a connected ComfyUI instance. Parse and register the workflow with a name, description, and version.
  - **Node Validation** — On import, check that every custom node referenced in the workflow is installed on all active workers (PRD-46). Flag missing nodes with install instructions or trigger auto-installation (PRD-43).
  - **Model/LoRA Validation** — Verify that all models and LoRAs referenced by the workflow exist in the asset registry (PRD-17). Flag missing assets before the workflow can be assigned to a scene type.
  - **Parameter Discovery** — Automatically detect configurable parameters in the workflow (seed, CFG, denoise, prompt text, image inputs) and expose them as named slots for scene type configuration (PRD-23) and template systems (PRD-27).
  - **Dry-Run Test** — Submit a test execution with a sample image to verify the workflow runs end-to-end on at least one worker before marking it as "Production Ready."
  - **Version Management** — Track workflow versions with diff highlighting (which nodes changed, which parameters were added/removed). Scene types reference a specific workflow version; upgrading to a new version is an explicit action.
  - **Workflow Library** — Browse all imported workflows with status (Draft, Tested, Production), usage count (how many scene types reference it), and last-used date.
- **Decision:** Scene types (PRD-23) reference workflows, but the spec assumed workflows just exist. In practice, importing a ComfyUI workflow that references a missing custom node or model results in silent failure during generation — wasting GPU time and creating confusing errors. Validation at import time catches these issues in seconds instead of during a production batch run. Parameter discovery eliminates the manual work of figuring out which values in a JSON blob are the configurable ones.

### [PRD-77] Pipeline Stage Hooks (Custom Scripts)
- **Features:** User-defined pre/post scripts that execute at configurable pipeline stages, enabling custom processing without modifying core workflows.
- **Key Capabilities:**
  - **Hook Points** — Register scripts to run at specific pipeline events:
    - **Post-Variant Generation** — After a clothed variant is generated (e.g., custom color correction).
    - **Pre-Segment Generation** — Before each segment starts (e.g., seed image preprocessing).
    - **Post-Segment Generation** — After each segment completes (e.g., custom quality check, frame extraction, watermarking).
    - **Pre-Concatenation** — Before segments are assembled (e.g., audio sync, color grading).
    - **Post-Delivery** — After ZIP packaging (e.g., upload to CDN, notify external system).
  - **Script Types** — Shell, Python (via PRD-09 runtime), or HTTP webhook call. Scripts receive structured JSON input (segment path, metadata, scene context) and can return pass/fail status.
  - **Failure Handling** — If a hook script fails: block (stop pipeline and flag for review), warn (log warning and continue), or ignore (silent continue). Configurable per hook.
  - **Hook Registry** — Manage hooks at studio, project, or scene type level. Hooks inherit downward (studio hooks apply to all projects unless overridden).
  - **Execution Logging** — Every hook execution logged with input, output, duration, and exit code. Visible in the job detail view.
- **Decision:** Every studio has custom requirements that don't fit into a generic pipeline: proprietary color grading, custom watermarking, metadata enrichment scripts, integration with internal tools. Without hooks, these customizations require modifying ComfyUI workflows (fragile) or manual post-processing (defeats automation). Hooks provide clean extensibility points where studio-specific logic plugs in without touching the core platform.

### [PRD-85] UI Plugin / Extension Architecture
- **Features:** A defined API for studio-built or third-party UI extensions, allowing custom panels, actions, and metadata renderers to be added to the platform without modifying core code.
- **Key Capabilities:**
  - **Extension Manifest** — Each extension is described by a `plugin.json` manifest declaring: name, version, author, required API version, permissions (which data it can read/write), and registered components.
  - **Panel Registration** — Extensions can register custom panels that appear alongside native panels. Example: a "Color Grading Preview" panel that runs a studio's proprietary LUT preview on selected segments.
  - **Menu Item Injection** — Extensions can add context menu items to entities (characters, scenes, segments). Example: right-click a character → "Export to ShotGrid" added by a studio integration extension.
  - **Custom Metadata Renderers** — Override the default display of specific metadata fields. Example: render a `color_palette` metadata field as a visual swatch grid instead of raw hex values.
  - **Extension API** — Sandboxed JavaScript API providing read/write access to platform data (projects, characters, scenes, segments, metadata) scoped by the extension's declared permissions. Includes event subscription for reacting to platform events (PRD-10).
  - **Extension Manager** — Admin UI for installing, enabling/disabling, and configuring extensions. Per-extension settings, version management, and permission review before activation.
  - **Hot Reload** — During development, extensions reload without a full platform restart. Production extensions are loaded at startup.
- **Decision:** PRD-77 provides pipeline-level extensibility (backend hooks at generation stages). This PRD provides UI-level extensibility. Studios have unique visualization needs, custom integrations with their asset management tools (ShotGrid, ftrack), and proprietary QA displays that a generic platform cannot anticipate. Without a plugin system, every studio-specific need becomes a feature request on the core platform. With it, studios can self-serve their unique UI requirements while the core platform stays focused on the universal workflow.

### [PRD-87] GPU Power Management & Idle Scheduling
- **Features:** Automated spin-down and wake-on-demand for idle GPU workers, with scheduled power windows and consumption tracking.
- **Key Capabilities:**
  - **Idle Timeout** — Configurable per-worker idle timeout (e.g., 15 minutes). After no jobs are dispatched for the timeout period, the worker is sent a shutdown signal. Default: disabled (always on).
  - **Wake-on-Demand** — When a new job enters the queue and no workers are online, automatically wake sleeping workers via Wake-on-LAN, SSH command, or cloud API (for remote workers). Job sits in "Waiting for Worker" state until at least one worker comes online.
  - **Scheduled Power Windows** — Define daily/weekly power schedules per worker or fleet-wide. Example: "GPUs on Monday–Friday 8am–10pm; off overnight and weekends unless off-peak jobs are queued (PRD-08)." Override: if scheduled/off-peak jobs exist, keep workers alive past the power-down window until the queue drains.
  - **Power Consumption Tracking** — Track per-worker and fleet-wide power consumption estimates based on GPU TDP and active time. Daily/weekly/monthly summaries. Integrated into PRD-73 (Production Reporting) as a cost line item.
  - **Graceful Shutdown** — Never kill a worker mid-job. Wait for the current segment to complete, then shut down. If a new job arrives during the cooldown period, cancel the shutdown.
  - **Minimum Fleet Size** — Configure a minimum number of workers that must stay online at all times (e.g., "always keep at least 1 GPU warm for interactive jobs"). Idle timeout only applies to workers above the minimum.
- **Decision:** GPU hardware consumes significant power even when idle. Studios running 4+ GPUs 24/7 for a workload that's active 8 hours/day waste 67% of their energy budget. PRD-46 manages the worker fleet and PRD-08 schedules jobs, but neither addresses the "GPUs are on but nobody's using them" problem. Power management is the missing link between job scheduling and physical resource consumption. The wake-on-demand feature ensures that power savings don't come at the cost of responsiveness — the first job of the day triggers automatic spin-up.

### [PRD-90] Render Queue Timeline / Gantt View
- **Features:** Visual timeline representation of the job queue, showing what's running on each GPU worker, what's queued, and estimated completion times.
- **Key Capabilities:**
  - **Gantt Layout** — Horizontal timeline with GPU workers as lanes on the Y-axis and time on the X-axis. Each job is a colored block showing: job name, scene/character, elapsed time, and estimated remaining time. Color-coded by project or priority level.
  - **Queue Depth** — Queued jobs appear as stacked blocks to the right of the "now" line, with estimated start times based on current worker throughput. "Your job is 4th in queue — estimated start in ~12 minutes."
  - **Interactive Controls** — Drag jobs to reorder queue priority (Admin only). Click a job block to see full details (segment, workflow, parameters). Right-click to pause, cancel, or re-prioritize.
  - **Time Estimates** — Per-job estimated completion based on historical averages for the same workflow and resolution tier (PRD-61). Aggregate: "Queue will drain in ~2h 15m at current throughput."
  - **Historical View** — Scrub backward in time to see completed jobs. Identify patterns: "GPUs were idle between 2am–8am," "Worker 3 has been running hot all week." Feeds into PRD-73 (Production Reporting).
  - **Live Updates** — Real-time progress updates via WebSocket. Job blocks grow as segments complete. New submissions appear instantly. Completed jobs slide off the left edge.
  - **Compact Mode** — Minimized single-row view showing just the "now" state: which workers are busy, how many jobs are queued, and estimated drain time. Embeddable as a PRD-89 dashboard widget.
- **Decision:** PRD-08 defines queue policy (priority, scheduling, cancellation) and PRD-54 shows a badge count. But neither answers the question every creator asks: "When will my job run, and when will it finish?" The Gantt view makes the invisible queue visible. For Admins, it reveals utilization patterns that inform capacity decisions ("We consistently have idle GPUs overnight — should we schedule batch work there?"). The interactive controls let Admins adjust priorities visually rather than through abstract numerical priority values.

### [PRD-93] Generation Budget & Quota Management
- **Features:** Per-project and per-user GPU hour budgets with configurable warning thresholds and hard limits, preventing runaway consumption.
- **Key Capabilities:**
  - **Project Budgets** — Assign a GPU hour budget to each project: "Project Alpha has 200 GPU hours." The system tracks cumulative consumption across all jobs in the project. Visible in the PRD-57 batch orchestrator and PRD-42 dashboard.
  - **User Quotas** — Optional per-user daily or weekly GPU hour quotas: "Each creator can use up to 8 GPU hours per day." Prevents a single user from monopolizing the fleet during busy periods.
  - **Warning Thresholds** — Configurable warning at percentage of budget (e.g., 75%, 90%). Triggers a notification via PRD-10: "Project Alpha has used 180 of 200 GPU hours (90%)." Warning appears on the job submission screen before new jobs are queued.
  - **Hard Limits** — At 100% budget consumption, new job submissions for the project are blocked. Admin override required to increase budget or allow additional jobs. In-progress jobs are not killed — they complete, but no new ones start.
  - **Budget Exemptions** — Mark specific job types as exempt from budget tracking. Example: regression test jobs (PRD-65) or draft-resolution jobs (PRD-59) don't count against the production budget.
  - **Budget Dashboard** — Per-project and per-user budget consumption visualized as progress bars with trend lines. "At current rate, Project Alpha will exhaust its budget in 3 days." Integrated into PRD-42 and PRD-73 (reporting).
  - **Rollover & Reset** — Budgets can reset on a schedule (weekly, monthly) or be manually adjusted. Unused budget does not roll over by default (configurable).
- **Decision:** PRD-61 estimates cost before submission, but estimates are informational — they don't enforce limits. Without budgets, a batch submission of 160 scenes can consume all available GPU time for days, blocking other projects. Budget management turns cost awareness from "FYI" into policy: the studio decides how much each project gets, and the system enforces it. The exemption for draft-resolution work ensures that cost controls don't discourage experimentation at lower tiers.

---

## Part 2: Data & Storage Management

### [PRD-13] Dual-Metadata System (JSON)
- **Features:** Automated generation of `character_metadata` and `video_metadata` JSON files.
- **Decision:** Required for registration and downstream consumption by future VFX/3D pipelines.

### [PRD-14] Data Validation & Import Integrity
- **Features:** Schema validation layer between data entry/import and database persistence. Covers both manual edits and bulk imports.
- **Key Capabilities:**
  - **Schema Rules** — Required fields, type constraints, and value ranges per entity type (character, scene, segment).
  - **Import Preview** — Dry-run mode showing what will be created/updated/skipped before committing.
  - **Conflict Detection** — Flag mismatches between imported JSON files and existing DB records, with UI for resolution (keep DB / keep file / merge).
  - **Validation Reports** — Per-import summary of errors, warnings, and auto-corrections applied.
- **Decision:** PRD-00 mandates strict integrity at the DB level, but data enters the system through multiple paths (bulk import, manual edit, API, script output). A dedicated validation layer at the ingestion boundary catches problems before they reach the database, rather than relying on DB constraint errors which provide poor user feedback.

### [PRD-15] Intelligent & Deferred Disk Reclamation
- **Features:** Manual and policy-driven "Deferred Cleanup" of supporting files.
- **Decision:** Protects Seed A/B permanently but prevents the server from filling with "failed" re-rolls.

### [PRD-16] Folder-to-Entity Bulk Importer
- **Features:** Drag-and-drop import using folder paths for naming (Jane/Bio -> Jane).
- **Decision:** Logic handles path-uniqueness (Jane/Bio vs Bob/Bio) to prevent accidental merging. Import feeds through PRD-14 validation before persistence.

### [PRD-17] Asset Registry & Dependency Mapping
- **Features:** Versioned Model/LoRA tracking, "Where is this used?" dependency graph, and compatibility notes for model/LoRA combinations.
- **Key Capabilities:**
  - **Asset Inventory** — Registered models, LoRAs, and custom nodes with version, file path, and file size.
  - **Dependency Graph** — "Where is this used?" reverse lookup showing which scene types, templates, and active jobs reference a given asset. Prevents accidental deletion.
  - **Compatibility Notes** — Per model/LoRA pair, creators can record observations: "This LoRA causes face-melt with model X after segment 5," "Needs CFG below 7 to be stable," "Works best at 0.6 weight." Notes are searchable and surfaced as warnings when configuring scene types that use flagged combinations.
  - **Quality Ratings** — Optional star rating per asset based on production experience. Helps new creators identify proven vs. experimental assets.
  - **Dependency-Aware Updates** — When a model or LoRA is updated (new version uploaded), the system automatically identifies all downstream impacts: which scene types reference it, which active scenes used the old version, and how many segments are now "stale" (PRD-69). Prompts the user with actionable options: "LoRA v2 uploaded. Used by 3 scene types affecting 45 scenes. [Run regression tests] [View affected scenes] [Dismiss]." Connects PRD-17 (what's affected) → PRD-65 (regression testing) → PRD-69 (staleness detection) into an automated chain.
- **Decision:** Prevents accidental deletion and captures accumulated knowledge about what works. Model/LoRA compatibility is currently tribal knowledge — one creator discovers a bad combination, but nothing prevents the next creator from hitting the same issue. Structured notes turn individual pain into shared wisdom. Dependency-aware updates close the loop between asset management and quality assurance — without this, updating a LoRA is a "hope nothing breaks" operation.

### [PRD-104] Model & LoRA Download Manager
- **Features:** In-platform download, verification, and registration of AI models and LoRAs from external sources, eliminating the manual download-move-register workflow.
- **Key Capabilities:**
  - **Source Integrations** — Download directly from CivitAI (model page URL or API), HuggingFace (repo URL or model ID), or arbitrary direct-download URLs. Authenticate with personal API tokens stored securely per user.
  - **Download Queue** — Queue multiple downloads with progress bars, speed estimates, and pause/resume. Downloads run in the background — navigate away and come back.
  - **Hash Verification** — After download, verify file integrity against the published SHA-256 hash (CivitAI/HuggingFace). Flag hash mismatches as potentially corrupted or tampered files.
  - **Auto-Registration** — Successfully downloaded and verified files are automatically registered in the asset registry (PRD-17) with metadata pulled from the source: model name, base model compatibility, trigger words, description, and preview images.
  - **Placement Rules** — Configurable rules for where downloaded files are stored on disk: by model type (checkpoints → `/models/checkpoints/`, LoRAs → `/models/loras/`), by base model, or custom paths. Ensures new downloads land in the right directory without manual file management.
  - **Duplicate Detection** — Before downloading, check if a file with the same hash already exists in the registry. "This model is already registered as 'Realistic Vision v5.1' — download anyway?"
  - **Worker Distribution** — After download to the primary storage, optionally sync the model file to all workers (PRD-46) or specific tagged workers. Track sync status per worker.
- **Decision:** PRD-17 manages the asset registry after models exist on disk, but the actual process of getting models onto disk is entirely manual: browse CivitAI, download to local machine, transfer to server, move to correct directory, register in the platform. This multi-step process is error-prone (wrong directory, forgotten registration, hash mismatch) and slow. An in-platform download manager collapses this into: paste URL → confirm → done. Worker distribution is critical for multi-GPU setups where every worker needs access to the same model files.

### [PRD-18] Bulk Data Maintenance (Search/Replace/Re-path)
- **Features:** Global find/replace for metadata and "Bulk Re-Pathing" for moved asset libraries.
- **Decision:** Minimizes manual admin work during library reorganizations or drive migrations.

### [PRD-19] Disk Space Visualizer (Treemap)
- **Features:** Sunburst/Treemap chart of storage usage by project/scene.
- **Decision:** Provides instant visibility into which scenes are hogging space.

### [PRD-20] Search & Discovery Engine
- **Features:** Unified search infrastructure supporting text, metadata facets, and visual similarity queries across all platform entities.
- **Key Capabilities:**
  - **Full-text Search** — Across character names, metadata fields, project descriptions, review notes, and tags (PRD-47).
  - **Faceted Filtering** — By project, character, status, date range, approval state, creator, tags, and custom metadata fields.
  - **Visual Similarity** — pgvector-powered search to find portraits/frames similar to a reference image.
  - **Saved Searches** — Persist and share filtered views as bookmarks (e.g., "All unapproved segments from last week").
  - **Search-as-you-type** — Integrated into the Command Palette (PRD-31) for instant results.
- **Decision:** A studio with hundreds of characters and thousands of segments becomes unusable without robust search. The Library Viewer's effectiveness depends entirely on the quality of the search backend. pgvector is already in the stack (PRD-00), so visual search is a natural extension.

### [PRD-47] Tagging & Custom Labels
- **Features:** User-defined tagging system that works across all entity types (projects, characters, scenes, segments, workflows) for cross-cutting organization beyond the hierarchy.
- **Key Capabilities:**
  - **Freeform Tags** — Any user can create and apply tags (e.g., `night-scene`, `needs-color-correction`, `reference-material`, `hero-shot`).
  - **Tag Namespaces** — Optional prefixes for structured tagging (`status:blocked`, `style:cinematic`, `priority:urgent`). Namespaces are user-defined, not enforced.
  - **Bulk Tagging** — Select multiple entities and apply/remove tags in one action. Integrates with bulk selection patterns across all list views.
  - **Tag-Based Views** — Filter any list by tag combination (AND/OR). Tags appear as facets in PRD-20 search and as filter chips in the Library Viewer.
  - **Color-Coded Tags** — Optional color assignment per tag for visual distinction in list views and timelines.
  - **Tag Suggestions** — Autocomplete from existing tags to prevent duplicates (`nightscene` vs. `night-scene`).
- **Decision:** The Project > Character > Scene > Segment hierarchy (PRD-01) provides structural organization, but creative workflows also need cross-cutting labels. "All segments needing color correction across all characters" or "all reference material for the art director" don't fit neatly into the hierarchy. Tags are the lightest-weight solution that provides this flexibility without requiring schema changes.

### [PRD-48] External & Tiered Storage
- **Features:** Support for external storage backends (S3, NAS/SMB, Google Cloud Storage) alongside local filesystem, with policy-driven tiering between hot and cold storage.
- **Key Capabilities:**
  - **Storage Backends** — Pluggable adapters for local disk (default), S3-compatible object storage, and network-attached storage (NFS/SMB). Configured per-project or globally.
  - **Tiered Storage Policies** — Rules that automatically move assets between tiers based on age, approval status, or access frequency (e.g., "Move supporting files to cold storage 30 days after approval").
  - **Transparent Access** — Users interact with assets the same way regardless of storage tier. Cold assets show a "Retrieving..." indicator with estimated time.
  - **Metadata Always Hot** — Database records and JSON metadata remain on fast local storage regardless of where the binary assets live. Search and browsing are never slowed by cold storage.
  - **Migration Tools** — Bulk move existing assets between storage backends with integrity verification (checksum comparison).
- **Decision:** Extends PRD-15 (Disk Reclamation) from "delete or keep" to "delete, keep hot, or move cold." Studios generating terabytes of video segments need a middle ground between permanent local storage and deletion. Cold storage preserves the option to revisit old work without consuming expensive local SSD space.

### [PRD-66] Character Metadata Editor
- **Features:** Dedicated UI for viewing and editing character metadata with form, spreadsheet, and bulk editing modes.
- **Key Capabilities:**
  - **Form View** — Per-character detail form with fields grouped by category (biographical, physical, preferences). Field types enforce schema (text, number, date, single-select, multi-select). Validated against PRD-14 schema rules in real time.
  - **Spreadsheet View** — All characters in a project displayed as rows, metadata fields as columns. Inline editing, sorting, filtering, and bulk operations. Ideal for filling in the same field across many characters quickly (e.g., setting hair color for 10 characters in one pass).
  - **Bulk Edit** — Select multiple characters, edit a field, apply to all selected. "Set 'scene_count' to 8 for all selected characters."
  - **Import/Export** — Import metadata from CSV/JSON, export to CSV/JSON. Enables external editing in Excel/Google Sheets for teams that prefer spreadsheet workflows. Import goes through PRD-14 validation.
  - **Completeness Indicator** — Per-character progress bar showing how many required fields are filled vs. empty. Visual flags for missing required fields. Project-level summary: "7 of 10 characters have complete metadata."
  - **Diff View** — When importing updated metadata, show a side-by-side diff of current vs. incoming values before committing.
- **Decision:** Metadata is a parallel data track to video generation, but it's part of the delivery package (metadata.json in the ZIP). Without a dedicated editor, metadata entry happens through raw JSON editing or external scripts — which is the current workflow this platform replaces. The spreadsheet view is critical for bulk entry efficiency; the form view provides guardrails for individual character detail work.

### [PRD-69] Generation Provenance & Asset Versioning
- **Features:** Immutable record of exactly which assets, parameters, and workflow versions were used to generate each segment, enabling traceability and targeted re-generation when assets are updated.
- **Key Capabilities:**
  - **Generation Receipt** — Every segment records a snapshot of its generation inputs: source image hash, variant image hash, workflow version, model version, LoRA version and weight, prompt text (resolved, not template), CFG, seed value, and resolution tier.
  - **Asset Version Tracking** — When a source image, variant, workflow, model, or LoRA is updated, the system assigns a new version number. Previous versions are retained (not overwritten).
  - **Staleness Detection** — After an asset update, flag all segments that were generated with the old version: "12 segments across 3 scenes were generated with clothed_v1.png — you are now on clothed_v2.png. Re-generate?"
  - **Targeted Re-generation** — From the staleness report, select which scenes/segments to re-generate with the updated asset. Only affected scenes need re-running; unaffected ones are untouched.
  - **Provenance Query** — "What was used to generate this segment?" and "Which segments used this specific LoRA version?" Both directions of the lookup are supported.
  - **Reproducibility** — Given a generation receipt, the system can re-run the exact same generation (same inputs, same parameters) to reproduce a result or verify consistency.
- **Decision:** Without provenance, updating a LoRA or re-generating a clothed variant creates an invisible inconsistency: some scenes use the old version, some use the new, and nobody knows which is which. Provenance turns asset updates from "re-generate everything to be safe" into "re-generate exactly the 12 affected segments." This saves massive GPU time and prevents the drift where different scenes for the same character silently use different asset versions.

### [PRD-79] Character Duplicate Detection
- **Features:** Automated visual similarity check when uploading new source images, to prevent accidentally creating duplicate characters in the library.
- **Key Capabilities:**
  - **Upload-Time Check** — When a source image is uploaded (PRD-21) or a character is added to the library (PRD-60), automatically compare the face embedding against all existing characters.
  - **Similarity Alert** — If a match exceeds the configurable threshold (e.g., 90% face similarity): "This image is 94% similar to existing character 'Jane Dough.' Is this the same person?" Options: link to existing character, create as new (with confirmation), or cancel.
  - **Batch Detection** — During bulk onboarding (PRD-67), run duplicate detection across all uploaded images before proceeding. Flag pairs that are too similar to each other or to existing library characters.
  - **Merge Suggestion** — If a duplicate is confirmed, offer to merge: adopt the existing character's variants and metadata rather than starting from scratch.
  - **Threshold Configuration** — Adjustable similarity threshold per project or studio. Tighter for studios with many similar-looking characters, looser for diverse catalogs.
- **Decision:** Duplicate characters waste variant generation time, create metadata inconsistencies, and confuse search results. In a library with 100+ characters, visual similarity between source images is the only reliable way to catch duplicates — name matching isn't sufficient when different photographers use different naming conventions. Detection at upload time prevents the problem before GPU resources are spent.

### [PRD-86] Legacy Data Import & Migration Toolkit
- **Features:** Tools for studios transitioning from manual workflows or other tools, enabling import of existing completed work (videos, images, metadata) into the platform's data model.
- **Key Capabilities:**
  - **Folder-Structure Import** — Point at an existing output folder tree and let the system infer characters, scene types, and variants from the path structure. Configurable path-to-entity mapping rules (e.g., `{character_name}/{scene_type}.mp4`). Preview the inferred structure before committing.
  - **Metadata CSV Import** — Upload a CSV/spreadsheet mapping character names to metadata fields. Matches against existing characters by name or creates new records. Handles column mapping (user's CSV headers → platform metadata fields).
  - **Video Registration** — Import existing final videos as pre-approved scenes. The platform creates character, scene, and segment records pointing to the imported files. No re-generation needed — these are treated as already-completed work.
  - **Image Registration** — Import existing source and variant images. Face embedding extraction (PRD-76) runs automatically on imported source images. Duplicate detection (PRD-79) runs against both existing and other imported characters.
  - **Validation Report** — After import, generate a gap analysis: which characters are missing metadata, which scenes lack source images, which expected scene types have no video. Provides a checklist for completing the migration.
  - **Incremental Import** — Support repeated imports as more legacy data is discovered. Previously imported entities are matched and updated rather than duplicated.
  - **Dry-Run Mode** — Preview everything that would be created/modified without committing changes. Allows review of the mapping before any data is written.
- **Decision:** Any new platform faces the cold-start problem: studios have months or years of existing work in folder structures. If the only path is "re-do everything through the platform," adoption is blocked. Legacy import lets studios bring their existing catalog into the system immediately, then use the platform for new work going forward. The folder-structure inference eliminates manual data entry for studios that followed any consistent naming convention.

### [PRD-88] Batch Metadata Operations
- **Features:** Bulk metadata editing, search-and-replace, and CSV import/export across characters and projects, extending PRD-66 (Character Metadata Editor) from single-character to multi-character operations.
- **Key Capabilities:**
  - **Multi-Select Edit** — Select multiple characters in the library (PRD-60) and edit a metadata field across all of them simultaneously. "Set `agency = 'XYZ Studios'` for 50 selected characters."
  - **Search & Replace** — Find a value across all metadata fields in a project and replace it. "Replace all instances of `blonde` with `light_blonde` in the `hair_color` field." Preview matches before applying. Supports regex for pattern-based replacements.
  - **CSV Export** — Export all character metadata for a project (or selection) as a CSV spreadsheet. One row per character, one column per metadata field. Includes character ID for re-import matching.
  - **CSV Re-Import** — Edit the exported CSV in Excel/Sheets and re-import. The system matches rows to characters by ID, diffs changes, and presents a preview: "42 characters updated, 3 new fields added, 0 conflicts." Apply or cancel.
  - **Field Operations** — Bulk operations on a single field: clear, set default value, copy from another field, or concatenate. "Set `status = 'active'` for all characters where `status` is empty."
  - **Undo** — Batch operations are atomic and reversible. A single undo reverts the entire batch, not one character at a time. Integrated with PRD-51 (Undo/Redo Architecture).
  - **Audit Trail** — Every batch operation logged with: who, when, which characters, what changed (old → new values). Queryable via PRD-45.
- **Decision:** PRD-66 handles the "edit one character's metadata" workflow. But studios with 100+ characters routinely need to update a field across dozens of records — fixing a typo in an agency name, updating a field after a policy change, or enriching metadata from an external spreadsheet. Without batch operations, this is N repetitions of single-character editing. The CSV round-trip is particularly valuable because metadata often originates in spreadsheets and studios already have tooling around that format.

---

## Part 3: Generation & Pipeline Core

### [PRD-76] Character Identity Embedding
- **Features:** Automatic extraction and storage of a face identity embedding from each character's source image, serving as the biometric reference for quality checks, likeness anchoring, and duplicate detection.
- **Key Capabilities:**
  - **Automatic Extraction** — When a source image is uploaded (PRD-21), automatically run face detection and extract an identity embedding (e.g., via InsightFace/ArcFace). Store the embedding vector alongside the character record.
  - **Multi-Face Handling** — If the source image contains multiple faces, prompt the user to select the primary face. Store the selected face's bounding box and embedding.
  - **Embedding Update** — If the source image is replaced, re-extract the embedding and flag any existing quality scores (PRD-49) that used the old embedding as potentially stale.
  - **Shared Reference** — The identity embedding is consumed by:
    - **PRD-22** (Source Image QA) — Likeness comparison between source and variants.
    - **PRD-26** (Temporal Continuity) — Likeness anchoring during generation.
    - **PRD-49** (Quality Gates) — Face confidence scoring and likeness drift detection.
    - **PRD-79** (Duplicate Detection) — Cross-character similarity comparison.
  - **Embedding Storage** — Stored as a pgvector column for efficient similarity queries (PRD-20 visual search).
  - **Quality Threshold** — If face detection confidence on the source image itself is below threshold, warn the user: "Face detection confidence is low (0.65) — this may cause unreliable quality checks downstream. Consider using a clearer source image."
- **Decision:** Multiple PRDs depend on "comparing a generated frame to the character's face" but none defined where that reference comes from. The identity embedding is the shared foundation — without it, PRD-49 can't measure likeness drift, PRD-26 can't anchor likeness, and PRD-79 can't detect duplicates. Making extraction automatic on upload ensures the embedding is always available when downstream features need it, rather than failing silently when it's missing.

### [PRD-21] Source Image Management & Variant Generation
- **Features:** Management of the character's source image and automated generation of image variants (e.g., clothed from topless) that serve as seeds for scene generation. Supports an iterative refinement loop including external editing.
- **Key Capabilities:**
  - **Source Image Upload** — Upload the character's original image (typically topless). This is the ground-truth reference for likeness throughout all generated content.
  - **Variant Generation** — Run a ComfyUI workflow to produce derived image variants (e.g., generate `clothed.png` from `topless.png`). Multiple variations can be generated for selection.
  - **Variant Selection** — Review generated variants and pick the approved version ("Hero") for each variant type. Only approved variants are used as scene seeds.
  - **External Edit Loop** — When a generated variant is close but not quite right (e.g., clothing artifacts, hand issues, lighting mismatch):
    - **Export for Editing** — Download the variant at full resolution for editing in an external tool (Photoshop, GIMP, etc.).
    - **Re-import Edited Version** — Upload the externally edited image back as a replacement for the generated variant. The system tracks that this variant was manually retouched (provenance metadata).
    - **Re-run QA** — The re-imported image goes through PRD-22 quality checks (resolution, face detection, likeness comparison against source) to ensure the edit didn't introduce problems.
    - **Version History** — Keep the original generated variant alongside the edited version. The user can revert to the generated original or re-export for further editing.
  - **Manual Variant Upload** — Upload a fully manually prepared variant instead of generating one, for cases where automated generation isn't viable at all.
  - **Variant Registry** — Track all variants per character with status (pending / generated / editing / approved / rejected), the workflow used to create them, and whether they were externally edited.
- **Decision:** The source image is the single point of truth for a character's likeness. Derived variants must be approved before scene generation begins, because a bad clothed variant would propagate errors across every clothed scene. The external edit loop is essential because AI image generation is rarely perfect on the first pass — small artifacts in clothing, hands, or accessories are common and faster to fix in Photoshop than to regenerate repeatedly. Tracking provenance (generated vs. edited) ensures the team knows which variants might need re-editing if the source image changes.

### [PRD-22] Source Image Quality Assurance
- **Features:** Automated and manual quality checks on source and variant images before they enter the generation pipeline.
- **Key Capabilities:**
  - **Resolution & Format Validation** — Verify minimum resolution, aspect ratio, and format requirements for the generation workflow.
  - **Face Detection & Centering** — Confirm face is detectable, properly centered, and meets minimum size requirements. Auto-crop if needed.
  - **Quality Scoring** — Automated assessment of sharpness, lighting consistency, and artifact presence. Flag images below threshold for manual review.
  - **Likeness Comparison** — When approving a derived variant, overlay/compare against the source image to verify likeness consistency before the variant is used for scene generation.
  - **Batch Validation** — Run quality checks across all characters in a project at once, producing a report of pass/warn/fail per image.
- **Decision:** High-quality seed images lead to more stable video generation. A blurry or off-center source image will produce consistently bad results across dozens of scene videos. Catching quality issues at the image stage (seconds of GPU time) prevents wasting hours of video generation time.

### [PRD-23] Scene Type Configuration
- **Features:** Definition and management of reusable scene types that specify the workflow, model, prompt, and duration requirements for a category of scenes.
- **Key Capabilities:**
  - **Scene Type Registry** — Create and manage scene types (e.g., `dance`, `idle`, `bj`, `feet`) at the studio or project level.
  - **Workflow Assignment** — Each scene type links to a specific ComfyUI workflow JSON. Different scene types can use entirely different workflows, models, and LoRAs.
  - **Prompt Template** — Configurable base prompt per scene type with placeholder slots (e.g., `{character_name}`, `{hair_color}`) that are populated from character metadata at generation time.
  - **Duration Configuration** — Target total duration and per-segment duration. The generation loop (PRD-24) uses these to determine how many segments to produce.
  - **Variant Applicability** — Configure which image variants this scene type applies to (clothed only, topless only, both, or clothes_off transition).
  - **Transition Configuration** — For `clothes_off` scenes: specify at which segment boundary the seed image switches from clothed to topless variant, and optionally a different workflow for the transition segment.
  - **Batch Scene Matrix** — Given a set of characters and a set of scene types, generate the full matrix of scenes to be produced (N characters x M scene types x K applicable variants).
- **Decision:** Scene types are the reusable "recipe" that gets stamped across characters. Without this entity, every scene for every character would need manual workflow/LoRA/prompt/duration configuration — which is the current manual bottleneck this platform exists to solve. The batch matrix generation is what enables "create all scenes for 10 characters in parallel" as a single action.

### [PRD-100] Scene Type Inheritance & Composition
- **Features:** Hierarchical scene type definitions where child scene types inherit configuration from a parent, overriding only the properties that differ, reducing duplication and enabling cascading updates.
- **Key Capabilities:**
  - **Parent-Child Hierarchy** — Define a parent scene type (e.g., "Dance") with base workflow, LoRA, prompt, and duration. Create children (e.g., "Dance Slow," "Dance Fast," "Dance Close-Up") that inherit everything from the parent and override specific fields.
  - **Selective Override** — Children only need to specify what's different: "Dance Slow" overrides duration (60s → 90s) and adds a prompt modifier ("slow graceful movement"). All other settings (workflow, LoRA, variant applicability) are inherited from "Dance."
  - **Cascade Updates** — When the parent's workflow or LoRA is updated, all children that haven't explicitly overridden those fields automatically inherit the change. Children with explicit overrides are unaffected. The system shows which children will be affected before applying a parent change.
  - **Override Indicators** — In the scene type editor, visually distinguish inherited values (greyed, with "inherited from Dance" label) from overridden values (bold, with "overridden" label). One-click action to revert an override back to inherited.
  - **Multi-Level** — Supports more than two levels: "Movement" → "Dance" → "Dance Slow." Inheritance follows the chain. Maximum depth configurable (default: 3 levels) to prevent overly complex hierarchies.
  - **Composition** — A scene type can inherit from one parent but also include "mixin" configurations: reusable parameter bundles (e.g., "High Quality Settings" mixin that sets higher step count and lower denoise). Mixins override parent values but are overridden by the child's direct settings.
- **Decision:** Studios typically have 3-5 base scene types with 2-4 variations each: "Dance" has slow/fast/close-up variants, "Idle" has standing/sitting variants. Without inheritance, each variant is a fully independent scene type — updating the shared LoRA means editing 15 scene types instead of 5 parents. Inheritance makes configuration changes O(parents) instead of O(total scene types). The cascade update is the key value: when a better LoRA is found for dance scenes, updating the parent automatically propagates to all dance variants.

### [PRD-24] Recursive Video Generation Loop
- **Features:** Automated segment-by-segment video generation that chains outputs to inputs until a scene's target duration is met.
- **Key Capabilities:**
  - **Seed-to-Segment Pipeline** — Segment 001 uses the scene's seed image (approved variant from PRD-21). Each subsequent segment uses the extracted last frame of the previous segment as its input.
  - **Seed Frame Extraction** — Automated extraction of the final frame from each completed segment, stored as a reference image and passed as the seed for the next segment.
  - **Boundary Frame Selection** — When the actual last frame is suboptimal (mid-blink, motion blur, awkward pose), the user or an automated picker can select a different frame from the final ~0.5s of the segment as the seed instead. Options: automatic (pick the lowest-motion frame in the last N frames), manual (frame scrubber showing the final second with click-to-select), or default (literal last frame). The selected frame becomes the seed for the next segment and the trim point for concatenation.
  - **Duration Accumulation** — Track cumulative duration across segments. Stop generating when total meets or exceeds the scene type's target duration (from PRD-23).
  - **Elastic Duration** — Rather than hard-cutting at exactly the target duration, allow the final segment to seek a "stable" stopping point within a tolerance window (e.g., target 30s ± 2s). Prefer ending on a low-motion frame to avoid abrupt cuts.
  - **Clothes-Off Transition** — For `clothes_off` scenes, at the configured segment boundary (from PRD-23), switch the seed image from the clothed variant to the topless variant. Optionally use a different workflow for the transition segment to smooth the visual change.
  - **Parallel Scene Generation** — Multiple scenes (same character, different scene types; or different characters, same scene type) can generate simultaneously across available workers (PRD-46). Scenes are independent — no cross-scene dependencies.
  - **Progress Tracking** — Real-time progress per scene: segments completed / segments estimated, cumulative duration / target duration. Reported via PRD-10 event bus and visible in PRD-54 job tray.
- **Decision:** This is the core generation engine. The recursive last-frame chaining is what produces temporally coherent long-form video from a model that generates short clips. Elastic duration prevents the jarring "hard cut" that occurs when a segment is truncated mid-motion to hit an exact timestamp. Parallel scene generation is the key throughput multiplier — a 10-character × 6-scene-type project produces 60+ scenes that can all run concurrently given enough GPU capacity.

### [PRD-25] Incremental Re-stitching & Smoothing
- **Features:** Targeted regeneration of 1 segment with boundary "auto-healing."
- **Decision:** Saves massive GPU time by not re-rendering the whole video for one mistake.

### [PRD-26] Temporal Continuity (Normalization & Sync)
- **Features:** Subject re-centering, Latent Texture Sync, and Likeness Anchoring (Seed A).
- **Decision:** Eliminates "subject drift" and grain flickering over long video durations.

### [PRD-27] Template & Preset System
- **Features:** Save, version, and share reusable generation configurations across users and projects.
- **Key Capabilities:**
  - **Workflow Templates** — Saved ComfyUI workflow configurations with named parameter slots.
  - **Parameter Presets** — LoRA weight combinations, CFG scales, prompt structures, and duration settings packaged as reusable "recipes."
  - **Scope Levels** — Personal presets (per user), Project presets (shared within a project), and Studio presets (global defaults).
  - **Template Marketplace** — Browse and apply presets created by other studio members, with usage statistics and quality ratings.
  - **Override Transparency** — When applying a template, clearly show which parameters differ from the template defaults.
- **Decision:** Distinct from M-01 (Hero Propagation), which retroactively pushes settings. Templates are forward-looking starting points. Once creators discover "Known Good" recipes, they need a structured way to reuse and share them rather than relying on tribal knowledge or copy-pasting JSON.

### [PRD-28] Pipeline Error Recovery & Checkpointing
- **Features:** Systematic recovery from multi-step pipeline failures with automatic checkpointing and resumable execution.
- **Key Capabilities:**
  - **Automatic Checkpoints** — After each successful pipeline stage, persist intermediate state (completed segments, latents, metadata) to enable resumption.
  - **Partial Failure Handling** — If step 3 of a 7-step pipeline fails, steps 1-2 outputs are preserved and the pipeline can resume from step 3 after the issue is resolved.
  - **Failure Diagnostics** — Structured error context (which node failed, input state, GPU memory at failure) attached to the failed job for debugging.
  - **Retry with Modifications** — Resume a failed pipeline from the last checkpoint with adjusted parameters (e.g., lower resolution, different seed) without re-running completed stages.
- **Decision:** The existing "no silent retries" policy (PRD-07) is correct for user trust, but the recovery path after a failure needs definition. Long pipelines (10+ segments) failing at segment 8 and requiring a full restart waste significant GPU time. Checkpointing makes recovery proportional to the failure, not the pipeline length.

### [PRD-49] Automated Quality Gates
- **Features:** Machine-driven quality assessment that runs automatically after each segment generation, flagging likely failures before they reach a human reviewer's queue.
- **Key Checks:**
  - **Face Detection Confidence** — Verify the subject's face survived generation. Flag segments where face detection score drops below a configurable threshold compared to Seed A.
  - **Boundary Stability (SSIM/pHash)** — Measure visual similarity between the last frame of segment N and the first frame of segment N+1. Flag discontinuities that exceed the smoothing tolerance.
  - **Motion Score** — Detect frozen frames (zero motion), excessive jitter, or unnatural acceleration. Flag segments outside the expected motion envelope.
  - **Resolution & Artifact Detection** — Check for unexpected resolution changes, black frames, encoding artifacts, or NaN pixel values.
  - **Likeness Drift Score** — Compare a representative frame from the segment against Seed A using an embedding similarity metric. Flag gradual face-drift over long sequences.
- **Integration:**
  - Auto-QA runs as a post-generation pipeline step (integrated with PRD-28 checkpointing).
  - Results attached to each segment as structured metadata: pass/warn/fail per check, with numeric scores.
  - Failed segments are flagged in the review queue (PRD-35) with specific failure reasons.
  - Configurable thresholds per project — strict for final delivery, relaxed for early exploration.
  - Summary statistics feed the Performance Dashboard (PRD-41) and Event Bus (PRD-10) — "3 of 12 segments auto-flagged."
- **Decision:** Human review is the final authority, but reviewers shouldn't waste time on obviously broken segments. A 30-second auto-QA pass that catches black frames, face-melt, and boundary pops before a reviewer ever sees the segment saves significant studio time. The scoring data also provides objective metrics for comparing workflow quality over time.

### [PRD-91] Custom QA Rulesets per Scene Type
- **Features:** Configurable quality gate thresholds per scene type, allowing different QA expectations for different kinds of content rather than a single global threshold.
- **Key Capabilities:**
  - **Per-Scene-Type Thresholds** — Each scene type (PRD-23) can define its own QA threshold overrides for every metric in PRD-49: face confidence minimum, motion score range, boundary SSIM minimum, and likeness drift tolerance.
  - **Preset Profiles** — Reusable QA profiles: "High Motion" (relaxed face consistency, strict motion continuity), "Portrait" (strict face consistency, relaxed motion), "Transition" (relaxed overall, strict boundary SSIM). Assign a profile to a scene type or create custom per-type overrides.
  - **Studio Defaults** — A studio-wide default QA profile applies to any scene type that doesn't define custom thresholds. Ensures every scene has quality checks even if nobody configured specific rules.
  - **Threshold Editor** — Visual slider-based editor showing each metric with its current threshold, a histogram of actual scores from past generations, and the pass/fail ratio that would result from the threshold change. "If you raise face confidence from 0.7 to 0.8, 15% more segments would have been flagged."
  - **A/B Threshold Testing** — Run QA scoring against historical segments with proposed new thresholds before applying them. "Apply these thresholds to last week's batch — how many would pass vs. the current thresholds?"
  - **Scene-Type-Specific Metrics** — Define custom QA metrics per scene type. Example: a "dance" scene type might add a "motion energy" metric that detects stiff/frozen frames, while a "portrait" scene type adds a "symmetry" metric. Custom metrics are implemented as hook scripts (PRD-77) that return a score.
- **Decision:** A single global QA threshold produces false positives for high-motion scenes (flagging acceptable face drift during rapid movement) and false negatives for static scenes (passing subtle artifacts that are obvious at slow pace). Dance scenes need different QA expectations than idle scenes — the physics of motion dictates what "good" looks like. Without per-scene-type customization, studios either set thresholds too tight (wasting time re-reviewing acceptable segments) or too loose (missing defects in static content).

### [PRD-94] Character Consistency Report
- **Features:** Post-generation cross-scene consistency analysis for a character, producing a scorecard that identifies quality outliers across all the character's scenes.
- **Key Capabilities:**
  - **Face Consistency Matrix** — For every pair of scenes for a character, compute face similarity between representative frames. Visualize as a heatmap: bright green for highly consistent pairs, red for outliers. "Jane Dough's `topless_dance` has 12% lower face similarity to other scenes."
  - **Color & Lighting Analysis** — Compare average color temperature, brightness, and saturation across scenes. Flag scenes that are visually inconsistent: "The `idle` scene is noticeably warmer than all other scenes."
  - **Motion Quality Distribution** — Box plot showing motion scores per scene type. Identify scenes with unusually low or high motion energy relative to expectations for that scene type (using PRD-91 QA profiles as reference).
  - **Outlier Flagging** — Automatically flag scenes that deviate from the character's average by more than a configurable threshold. One-click action: "Re-queue flagged scenes for regeneration."
  - **Trend Tracking** — If a character's scenes are regenerated over multiple iterations, track consistency improvement: "After re-doing 3 flagged scenes, consistency score improved from 82% to 96%."
  - **Report Export** — Export the consistency report as a PDF or JSON for stakeholder review. Include representative keyframes from each scene alongside scores.
  - **Batch Report** — Generate consistency reports for all characters in a project at once. Overview: "8 of 12 characters are fully consistent. 4 have flagged outliers." Integrated into PRD-72 (Project Lifecycle) as a pre-delivery check.
- **Decision:** PRD-49 evaluates individual segments in isolation, and PRD-68 compares the same scene type across characters. But neither answers: "Does this character look like the same person across all their scenes?" This is the most common creative director question during final review. Without a consistency report, the director must manually watch every scene for every character and mentally compare — a process that scales poorly beyond a few characters. The report automates this comparison and surfaces only the outliers that need attention.

### [PRD-103] Character Face Contact Sheet
- **Features:** Automated extraction and tiled display of face crops from representative frames across all of a character's scenes, providing an instant visual consistency check.
- **Key Capabilities:**
  - **Face Extraction** — For each scene belonging to a character, extract a face crop from the poster frame (PRD-96) or a QA-selected best frame (highest face confidence from PRD-49). Crop is tight to the face with consistent padding ratio.
  - **Tiled Grid Display** — Display all face crops in a grid: one column per scene type, rows for variants (clothed/topless). Scene type labels above, variant labels on the left. Instant visual scan: "Do all these faces look like the same person?"
  - **Comparison Overlay** — Toggle an overlay that shows the source image face (from PRD-76 identity embedding) as a semi-transparent reference on each cell. Makes deviations immediately visible.
  - **Highlight Outliers** — Cells with face similarity below the threshold (from PRD-94 consistency report) are highlighted with a colored border. Clicking a highlighted cell navigates to the scene review.
  - **Export** — Export the contact sheet as a single PNG or PDF image. Printable for offline review or stakeholder meetings. Includes character name, project, and generation date.
  - **Batch Contact Sheets** — Generate contact sheets for all characters in a project. View as a scrollable gallery or export as a multi-page PDF: one page per character.
  - **Historical Comparison** — Compare contact sheets from different points in time: "Before re-generation" vs. "After re-generation" to verify that consistency improvements are visible.
- **Decision:** PRD-94 provides numerical consistency scores, but humans assess face consistency visually, not numerically. A creative director glancing at a tiled grid of 14 face crops immediately spots the one that looks different — this takes 2 seconds versus reading a report. The contact sheet is the "one-page summary" of whether a character is ready for delivery. It's also the most effective artifact for communicating consistency issues to non-technical stakeholders who don't understand similarity percentages.

### [PRD-50] Content Branching & Exploration
- **Features:** Git-like branching for creative exploration, allowing parallel versions of a scene or character configuration without affecting the main line.
- **Key Capabilities:**
  - **Branch Creation** — Fork a scene (or character configuration) into a named branch at any point. The branch gets an independent copy of parameters and can diverge freely.
  - **Branch Comparison** — Side-by-side review of segments from different branches using the Sync-Play Grid (PRD-36). Compare "cinematic style" vs. "documentary style" for the same scene.
  - **Merge / Promote** — Promote a branch to become the new main line, or cherry-pick specific segments from a branch back into main.
  - **Branch Cleanup** — Discard experimental branches and reclaim their disk space through PRD-15 reclamation policies.
  - **Branch Visibility** — Branches appear in the scene timeline as parallel tracks. Users can switch between branches without losing context.
- **Decision:** Different from undo (which is linear reversal) and different from re-rolling (which replaces in-place). Branching enables concurrent creative exploration: "What if we tried a completely different LoRA for this character?" without risking the approved main line. Especially valuable during early-stage creative development where multiple directions are being evaluated simultaneously.

### [PRD-57] Batch Production Orchestrator
- **Features:** High-level orchestration for producing scenes at scale — coordinating the full pipeline from image preparation through delivery packaging across multiple characters and scene types in parallel.
- **Key Capabilities:**
  - **Job Matrix Generation** — Select a set of characters and a set of scene types. The system generates the full matrix (N characters × M scene types × K variants) and presents it for review before submitting.
  - **Matrix Visualization** — Grid view showing Characters (rows) × Scene Types (columns) with status per cell: not started, generating, review, approved, failed. Gives a single-screen overview of an entire production run.
  - **Selective Submission** — Submit the entire matrix, a subset of characters, a subset of scene types, or individual cells. Re-submit only the failed/rejected cells after fixes.
  - **Dependency Awareness** — The orchestrator understands that variant images (PRD-21) must be approved before scenes using those variants can generate. It sequences: source image QA → variant generation → variant approval → scene generation.
  - **Progress Dashboard** — Aggregate progress across the entire batch: total scenes, segments generated, segments passed QA, scenes approved, estimated time remaining. Feeds into PRD-42 (Studio Pulse) and PRD-54 (Job Tray).
  - **Batch Review Queue** — Present completed scenes for review grouped by character or by scene type, rather than as a flat list. Enables efficient review patterns ("review all dance scenes across characters" or "review all scenes for Jane").
  - **One-Click Delivery** — When all cells in the matrix are approved, trigger PRD-39 (Scene Assembler) to package the entire project for delivery in a single action.
- **Decision:** This is the "mission control" for production runs. Individual PRDs handle each pipeline stage (image QA, variant generation, scene generation, quality gates, review, assembly), but nothing coordinates the full end-to-end flow across many characters. Without this, a producer managing 10 characters × 8 scene types × 2 variants = 160 scenes has no single view of what's done, what's stuck, and what's next. The matrix view is the key UI innovation — it turns a complex parallel pipeline into a scannable grid.

### [PRD-97] Job Dependency Chains & Triggered Workflows
- **Features:** Configurable "when X completes, automatically start Y" job-to-job dependency definitions, enabling automated pipeline progression beyond the fixed batch orchestrator flow.
- **Key Capabilities:**
  - **Trigger Rules** — Define rules: "When [event] on [entity scope], automatically [action]." Examples:
    - "When clothed variant is approved for any character → generate all clothed scenes for that character."
    - "When all scenes for a character are approved → trigger delivery packaging (PRD-39) for that character."
    - "When a segment fails QA → automatically re-queue with smart retry (PRD-71)."
    - "When a workflow is updated to a new version → re-run regression tests (PRD-65)."
  - **Condition Builder** — Visual builder for trigger conditions: event type (completed, approved, failed), entity scope (specific character, all characters in project, studio-wide), and optional filters (resolution tier, scene type, variant).
  - **Action Types** — Submit generation job, trigger QA re-scan, start concatenation, package delivery, send notification (PRD-10), or call webhook (PRD-12). Multiple actions per trigger supported (executed in sequence or parallel).
  - **Chain Visualization** — View the dependency chain as a directed graph: "variant approval → scene generation → QA → review → delivery." Shows which steps are automated and which require human action (approval checkpoints).
  - **Safety Controls** — Maximum chain depth to prevent infinite loops. Dry-run mode: "If this trigger fires, here's what would happen" without actually executing. Admin approval required to enable triggers that submit generation jobs (cost implications).
  - **Trigger Log** — Every trigger firing logged with: what event caused it, what action was taken, result (success/failure), and downstream effects. Visible in the job detail view and PRD-45 audit trail.
- **Decision:** PRD-57 orchestrates the standard batch flow (a fixed N×M×K matrix), but real production workflows have conditional progressions that vary by studio. "Auto-generate scenes when variants are approved" is the most common pattern, but studios also want "auto-package when everything's done" or "auto-retry on QA failure." Without configurable triggers, these progressions require manual intervention — someone watching the dashboard and clicking "submit" at each transition point. Triggers turn a supervised pipeline into a self-advancing one where humans only intervene at explicit approval gates.

### [PRD-58] Scene Preview & Quick Test
- **Features:** Rapid single-segment preview generation to validate a workflow/LoRA/prompt combination for a character before committing to a full scene.
- **Key Capabilities:**
  - **Test Shot Button** — Available on scene type configuration and individual scene views. Generates a single short segment (2-3 seconds) using the scene's seed image and workflow.
  - **Quick Turnaround** — Preview uses the same pipeline as full generation but stops after one segment. Result available in ~30 seconds depending on GPU, vs. 10-20 minutes for a full scene.
  - **Side-by-Side Preview** — Compare test shots from different workflow/LoRA configurations for the same character using the Sync-Play Grid (PRD-36). Answer "Which LoRA looks best with this face?" cheaply.
  - **Batch Test Shots** — Generate test shots for a scene type across multiple characters in one action. Quickly identify which characters have issues with a specific workflow before committing to full runs.
  - **Preview Gallery** — Persist test shots with their parameters so creators can review and compare past experiments. Linked to the scene type and character for context.
  - **Promote to Scene** — If a test shot looks good, use it as the first segment of the actual scene generation rather than re-generating from scratch.
- **Decision:** Full scene generation is expensive — 10+ segments, potentially 20+ minutes of GPU time. Discovering that a LoRA doesn't work with a particular face after 8 segments is wasteful. A 30-second test shot catches obvious mismatches (face-melt, style clash, prompt misinterpretation) at ~5% of the cost. The "promote to scene" capability means good test shots aren't wasted.

### [PRD-59] Multi-Resolution Pipeline
- **Features:** Generate at a lower resolution during exploration and iteration, then re-generate approved creative directions at full delivery resolution.
- **Key Capabilities:**
  - **Resolution Tiers** — Define named resolution presets: "Draft" (512px, fast), "Preview" (768px, moderate), "Production" (1080p, full quality). Custom tiers supported.
  - **Tier Selection per Job** — When submitting scenes (individually or via PRD-57 batch), choose the resolution tier. Defaults to "Draft" for new/experimental work.
  - **Upscale Trigger** — After a scene passes review at Draft/Preview, trigger a full-resolution re-generation with one click. The system re-runs the same workflow with identical seeds and parameters at the higher resolution.
  - **Quality Comparison** — Side-by-side playback of Draft vs. Production versions using PRD-36 to verify the upscale didn't introduce issues (some workflows behave differently at different resolutions).
  - **Cost Display** — Show estimated GPU time and disk space per resolution tier before submission. Draft tier shows the savings vs. Production (e.g., "Draft: ~3 min, Production: ~18 min").
  - **Tier Tracking** — Every scene and segment records its resolution tier. The delivery pipeline (PRD-39) enforces that only Production-tier scenes are included in final exports.
- **Decision:** This changes the economics of experimentation. A 10-character × 8-scene-type batch at Draft resolution might take 1 hour; the same batch at Production takes 6+ hours. Iterating on creative direction at Draft, then upscaling only approved work to Production, can reduce total GPU time by 60-80% across a project lifecycle. The key insight is that most creative decisions (does the motion look right, is the face stable, does the style match) are visible even at 512px.

### [PRD-60] Character Library (Cross-Project)
- **Features:** Studio-level shared character registry that spans projects, allowing approved characters (source images, variants, metadata) to be reused without re-generation.
- **Key Capabilities:**
  - **Studio Character Registry** — Characters can be registered at the studio level, independent of any single project. The registry stores the source image, all approved variants, and metadata.
  - **Project Import** — When creating a new project, import characters from the studio library. The project receives references to the approved images and a copy of the metadata (which can then be customized per-project if needed).
  - **Variant Sharing** — If Jane Dough's clothed variant was approved in Project A, Project B doesn't need to re-generate it. The approved variant is available from the library immediately.
  - **Character Updates** — If a character's source image or variants are updated in the library, projects that imported the character are notified. They can choose to adopt the update or keep their current version.
  - **Library Search** — Search and browse the character library by name, metadata attributes, tags (PRD-47), or visual similarity (PRD-20).
  - **Access Control** — Library-level permissions (who can add/edit characters in the library) separate from project-level permissions.
  - **Cross-Project Scene Visibility** — From a character's library profile, see all projects that use this character and their scene status across projects. "Jane Dough is in 3 projects: Project Alpha (all scenes approved), Project Beta (4 scenes pending review), Project Gamma (setup)." Helps identify re-usable approved scenes across projects.
  - **Linked Metadata Model** — Character metadata can be linked to the library master or copied per-project. Linked fields update automatically when the library record changes. Copied fields diverge independently. Per-field choice: "Link `hair_color` to library (always in sync), copy `bio` per-project (different narratives)."
- **Decision:** Characters are the most expensive asset to prepare — source image QA, variant generation, external editing, and metadata population. Re-doing this work for every project that features the same character is pure waste. A shared library amortizes the preparation cost across all projects and ensures consistency (the same Jane Dough everywhere, not subtly different variants in each project).

### [PRD-61] Cost & Resource Estimation
- **Features:** Pre-submission estimation of GPU time, wall-clock time, and disk space for generation jobs, based on historical performance data.
- **Key Capabilities:**
  - **Per-Scene Estimate** — Before submitting a scene, show: estimated segments needed (based on target duration / segment duration), estimated GPU time per segment (based on historical average for this workflow), estimated total GPU time, and estimated disk space.
  - **Batch Estimate** — For PRD-57 batch submissions, aggregate the per-scene estimates into a total: "160 scenes, ~48 GPU-hours, ~12 hours wall-clock with 4 workers, ~85 GB disk space."
  - **Worker-Aware Wall Clock** — Factor in current worker pool size and queue depth. "With 4 idle workers: ~12 hours. With 2 workers busy: ~20 hours."
  - **Historical Calibration** — Estimates improve over time as the system records actual generation times per workflow per resolution tier. New workflows without history show "No estimate available" rather than guessing.
  - **Budget Alerts** — Optional per-project GPU budget. Warn when a submission would exceed the remaining budget. Useful for cost tracking even on local hardware (GPU-hours as a planning metric).
  - **Estimation Breakdown** — Drill down into the estimate: which scene types are most expensive, which characters have historically slow generation, where the bottleneck is (GPU compute vs. disk I/O).
- **Decision:** Submitting 160 scenes without knowing the time/cost impact leads to "the GPUs are busy for 3 days and nobody knew" situations. Estimation turns job submission from a blind action into an informed decision. Historical calibration means the estimates get more accurate as the studio accumulates production data — the system learns your specific hardware and workflows.

### [PRD-62] Storyboard View & Scene Thumbnails
- **Features:** Visual keyframe-based overview of scenes, providing a filmstrip/storyboard representation without requiring full video playback.
- **Key Capabilities:**
  - **Scene Thumbnail Strip** — For each scene, display: seed image, first segment thumbnail, keyframes at regular intervals, and final frame. A visual filmstrip summary of the entire scene.
  - **Matrix Thumbnails** — The PRD-57 batch matrix view can show thumbnail previews per cell instead of just status indicators. Gives producers an instant visual read of the entire production state.
  - **Keyframe Extraction** — Automatically extract representative keyframes from each segment at configurable intervals (e.g., every 2 seconds). Stored as lightweight thumbnails for fast browsing.
  - **Hover Scrub** — Hover over a scene card to scrub through its keyframe strip without opening the full player. Quick visual check without leaving the list view.
  - **Comparison Strips** — Place two scene thumbnail strips side-by-side to compare visual consistency between characters performing the same scene type, or between different LoRA configurations.
  - **Print-Ready Storyboard** — Export a scene's keyframe strip as a PDF/image for offline review or physical pinboard use.
- **Decision:** Video playback is the bottleneck in review workflows — you have to watch each scene in real time. Storyboard strips give 80% of the visual information in 2 seconds of scanning. For a producer reviewing 160 scenes, the difference between "play each one" and "scan the thumbnail strips" is hours vs. minutes. The hover-scrub enables a natural "glance, decide if it needs closer review" workflow.

### [PRD-63] Prompt Editor & Versioning
- **Features:** Dedicated editor for creating, versioning, and managing prompt templates with syntax support and historical tracking.
- **Key Capabilities:**
  - **Template Editor** — Rich text editor for prompt templates with syntax highlighting for placeholder slots (`{character_name}`, `{hair_color}`). Auto-complete for available metadata fields.
  - **Version History** — Every save creates a version. Compare any two versions side-by-side with diff highlighting. Restore previous versions with one click.
  - **Version Notes** — Attach notes to each version explaining what changed and why ("Reduced emphasis on background to fix outdoor scenes").
  - **Prompt Library** — Save "known good" prompts as named library entries, tagged by model, LoRA, and scene type. Searchable and browsable by the team.
  - **Live Preview** — Show what the prompt will look like after placeholder substitution for a selected character. Verify that metadata values fill in correctly before committing.
  - **A/B Annotations** — When comparing PRD-58 test shots from different prompt versions, link the test shot back to the specific prompt version used. Builds a record of "Prompt v3 + LoRA X = good result."
- **Decision:** Prompts are the most-iterated parameter in the pipeline, yet they're typically managed as raw text strings with no history. When a prompt change breaks something, there's no way to answer "what was the prompt two versions ago?" Versioning brings the same rigor to prompts that version control brings to code. The library prevents knowledge loss when a creator who discovered a great prompt leaves the team.

### [PRD-64] Failure Pattern Tracking & Insights
- **Features:** Automated correlation of quality gate failures (PRD-49) with generation parameters to surface recurring failure patterns and actionable insights.
- **Key Capabilities:**
  - **Failure Correlation** — Track which combinations of workflow, model, LoRA, character, scene type, and segment position produce quality failures. Surface patterns like "LoRA X + Character Y fails at segment 6+" or "Workflow Z has 40% face-drift rate after 30s cumulative duration."
  - **Failure Heatmap** — Visual matrix showing failure rates by scene type × character, or by LoRA × segment position. Red cells instantly show problematic combinations.
  - **Trend Tracking** — Monitor failure rates over time. Detect regressions ("failure rate increased after switching to model v2") and improvements ("new prompt template reduced face-drift by 60%").
  - **Actionable Alerts** — When a scene starts generating and the system recognizes a historically problematic combination, warn the creator: "This LoRA has a 35% failure rate with this character type. Consider using LoRA Y instead."
  - **Root Cause Linking** — When a creator fixes a recurring issue (e.g., by adjusting CFG or switching LoRAs), record the fix in PRD-17 compatibility notes and link it to the failure pattern.
- **Decision:** Quality gate data (PRD-49) is valuable for individual segments, but the real value is in aggregate patterns. Without pattern tracking, the same failures repeat across creators and projects. This PRD turns failure data into institutional knowledge — the system learns which combinations work and which don't, and proactively warns before GPU time is wasted.

### [PRD-65] Workflow Regression Testing
- **Features:** Automated comparison testing when workflows, models, or LoRAs are updated, to verify the change doesn't degrade output quality.
- **Key Capabilities:**
  - **Reference Scenes** — Designate specific character + scene type combinations as "reference benchmarks." These are representative scenes with known-good output.
  - **Regression Run** — When updating a workflow or swapping a LoRA, trigger a re-generation of all reference scenes using the new configuration. Runs at Draft resolution (PRD-59) for speed.
  - **Automated Comparison** — Compare new output against the reference output using: SSIM score, face similarity embedding distance, motion consistency, and auto-QA metrics (PRD-49).
  - **Visual Diff** — Side-by-side playback of old vs. new output using the Sync-Play Grid (PRD-36), with the metric scores overlaid.
  - **Pass/Fail Report** — Summary showing which reference scenes improved, degraded, or stayed the same. Flag regressions that exceed configurable thresholds.
  - **Rollback Support** — If a workflow update causes regressions, revert to the previous workflow version (from PRD-27 template versioning) and re-run to confirm the rollback fixes the issue.
- **Decision:** Workflow and model updates are necessary for quality improvement, but they risk breaking scenes that currently work. Without regression testing, updates are deployed on faith and failures are discovered mid-production. Running reference scenes at Draft resolution takes minutes and provides objective before/after data. This is the equivalent of automated tests for the generation pipeline.

### [PRD-67] Bulk Character Onboarding Wizard
- **Features:** Guided step-by-step workflow for onboarding multiple characters into a project simultaneously, reducing the per-character setup overhead.
- **Steps:**
  1. **Batch Image Upload** — Drop all source images at once. The system creates one character entity per image, using the filename as the initial character name. Preview the character list before confirming.
  2. **Batch Variant Generation** — Trigger clothed variant generation for all uploaded characters in one action. Variants generate in parallel across available workers (PRD-46).
  3. **Variant Review Gallery** — Grid of all generated variants side-by-side with their source images. Approve, reject, or mark for external editing (PRD-21) per character. Bulk-approve all that look good.
  4. **Bulk Metadata Entry** — Opens PRD-66 spreadsheet view pre-populated with the new characters. Fill in common fields across all characters, then per-character specifics.
  5. **Scene Type Selection** — Choose which scene types (from PRD-23 registry) apply to this batch of characters. Select variant applicability (clothed, topless, both, clothes_off). The system generates the scene matrix preview (PRD-57).
  6. **Review & Submit** — Summary screen: N characters, M scene types, estimated GPU time (PRD-61), estimated disk space. Submit to begin generation or save as draft for later.
- **Resume & Partial Progress** — The wizard saves state after each step. Users can close and return to where they left off. Characters that are further along (e.g., variants already approved) skip completed steps.
- **Decision:** Onboarding 10 characters through general-purpose UI means navigating to the character page 10 times, uploading images 10 times, triggering variant generation 10 times. The wizard consolidates this into one flow with batch operations at each step. The step-by-step structure also ensures nothing is skipped — metadata is filled before generation, variants are approved before scenes, etc.

### [PRD-71] Smart Auto-Retry
- **Features:** Opt-in automatic retry of segments that fail quality gates (PRD-49), using varied parameters to increase the chance of a passing result before requiring human intervention.
- **Key Capabilities:**
  - **Auto-Retry Policy** — Per scene type or per project, configure: max retry attempts (default: 3), which parameters to vary (seed, CFG ± 0.5, prompt minor variations), and which QA failures trigger retry (face-melt yes, motion score no).
  - **Varied Seeds** — Each retry uses a different random seed. The most common fix for a one-off generation failure.
  - **Parameter Jitter** — Optionally apply small random adjustments to CFG scale, denoise strength, or other numeric parameters within a configured range. Introduces enough variation to escape a bad local minimum without fundamentally changing the output.
  - **Best-of-N Selection** — If multiple retries pass QA, select the one with the highest quality scores rather than just using the first pass.
  - **Transparent Reporting** — The user sees: "Segment 5: QA failed on attempt 1 (face confidence 0.42), auto-retried, passed on attempt 3 (face confidence 0.87)." Full visibility into what happened and why.
  - **Retry Budget** — Auto-retries count against the project's GPU budget (PRD-61). If the budget is exhausted, retries are skipped and the segment is flagged for manual review.
  - **Escalation** — If all retry attempts fail, the segment is flagged for human review with all attempts attached for comparison. The creator can see what was tried and decide whether to adjust parameters more significantly.
- **Decision:** This is explicitly NOT silent retrying — it's transparent, opt-in, and bounded. The "no silent retries" policy (PRD-07) protects user trust; this PRD adds a structured layer on top where the user has chosen to allow automated recovery. The key insight is that many QA failures are stochastic (a bad seed) not systematic (a broken workflow). Varying the seed fixes ~60-70% of one-off failures without human intervention, saving significant wait-and-resubmit cycles.

### [PRD-74] Project Configuration Templates
- **Features:** Export and import complete project configurations (scene types, workflows, LoRA assignments, prompts, duration targets) as reusable project scaffolds.
- **Key Capabilities:**
  - **Project Config Export** — Package all scene type definitions, workflow assignments, prompt templates, duration settings, variant applicability rules, and auto-retry policies for a project into a single portable JSON file.
  - **Project Config Import** — When creating a new project, optionally import a saved configuration. The new project inherits all scene type definitions and settings without needing manual setup.
  - **Config Library** — Browse and manage saved project configurations at the studio level. Named, described, and versioned.
  - **Selective Import** — Import only specific scene types from a config rather than the entire setup. Useful when a new project needs most but not all of an existing project's scene types.
  - **Config Diff** — When importing into a project that already has some configuration, show what will be added, changed, or remain untouched.
- **Decision:** Distinct from PRD-27 (per-scene-type templates) — this is the entire project scaffolding. When the studio creates a new project with the same scene types, workflows, and settings as a previous project, they shouldn't reconfigure from scratch. Export/import makes project setup a 30-second operation for repeat configurations.

---

## Part 4: Design System & UX Patterns

### [PRD-29] Design System & Shared Component Library
- **Features:** A centralized, token-driven design system that enforces visual consistency and component reuse across every module in the platform. All UI is built from a single shared component library — no one-off implementations.

- **Token Architecture:**
  - **Color Tokens** — Semantic naming (`surface-primary`, `action-danger`, `text-muted`) mapped to raw values. All colors reference tokens, never hex/rgb literals. Supports Obsidian/Neon themes + Dark/Light modes through token swapping alone.
  - **Typography Tokens** — Font family, size scale (12px–32px in named steps: `text-xs` through `text-3xl`), weight, line-height, and letter-spacing. One place to change a font, every screen updates.
  - **Spacing & Layout Tokens** — Consistent spacing scale (4px base unit), border radii, shadow elevations, and breakpoints.
  - **Icon Tokens** — Centralized icon registry (single import source). Adding/swapping an icon happens in one file, propagates everywhere.
  - **Animation Tokens** — Durations, easing curves, and transition presets for consistent motion behavior.

- **Shared Component Library:**
  - **Primitive Components** — Button, Input, Select, Checkbox, Toggle, Badge, Tooltip, Avatar. Every interactive element in the app uses these — no raw HTML `<button>` or `<input>` outside the library.
  - **Composite Components** — Card, Modal, Drawer, Dropdown, Table, Tabs, Accordion, Toast. Built from primitives, used directly by feature modules.
  - **Layout Components** — Stack, Grid, Divider, Spacer, Panel, Sidebar. Encapsulate spacing and responsive behavior so feature code never does manual margin/padding.
  - **Domain Components** — ThumbnailCard, StatusBadge, TimelineEntry, MetadataField. Shared across multiple features (e.g., the same StatusBadge appears in the Library, Review, and Dashboard views).

- **Enforcement Mechanisms:**
  - **Lint Rules** — ESLint/Stylelint rules that flag raw color values, inline styles, and direct HTML elements where a shared component exists. CI fails on violations.
  - **Import Restrictions** — All shared components exported from a single barrel (`@/components`). Lint rules prevent importing internal implementation files directly.
  - **Storybook Catalog** — Every shared component has a Storybook entry with all variants, states, and usage examples. This is the "source of truth" for what exists — developers check here before building anything new.
  - **New Component Review** — Adding a component to the shared library requires it to be used by 2+ features (or be a clear primitive). Prevents premature abstraction while ensuring reuse.

- **Theme System:**
  - **Two-Axis Model** — Themes are composed of two independent axes: *color scheme* (Dark / Light) and *brand palette* (Obsidian / Neon / custom). Any combination works (e.g., Dark+Obsidian, Light+Neon). Each axis is a separate token layer that stacks.
  - **Built-in Themes:**
    - **Dark** — Default. Low-luminance surfaces, high-contrast text. Optimized for extended studio sessions and low-light environments.
    - **Light** — High-luminance surfaces for bright environments or accessibility preference.
    - **Obsidian** — Cool, neutral brand palette. Slate grays, muted accents, professional tone.
    - **Neon** — Vibrant, high-energy brand palette. Electric accents on dark surfaces for a creative/editorial feel.
  - **System Preference Detection** — Respects `prefers-color-scheme` on first visit, then remembers user choice. Per-user setting stored in PRD-04 workspace persistence.
  - **Runtime Switching** — Instant theme change by swapping CSS custom property sets on `:root`. No page reload, no component re-render, no flash of unstyled content.
  - **High Contrast Mode** — Accessibility variant that increases contrast ratios beyond WCAG AA to AAA thresholds. Applies as a modifier on top of any theme combination.
  - **Custom Themes** — Admins can create new brand palettes by duplicating an existing token set and adjusting values through the Token Editor. Custom themes appear in the theme picker alongside built-ins.
  - **Token Editor (Admin)** — UI for adjusting color palette, font family, font size scale, icon set, and spacing scale. Changes preview live in a split-pane before committing. Persists to the theme configuration file.
  - **Brand Export** — Export current token set as JSON or CSS custom properties for use in external tools, documentation, or the External Pulse Dashboard (PRD-42).

- **Decision:** A design system is not a "nice to have" — it's infrastructure. Without enforced sharing, a 45+ PRD platform will inevitably diverge: three different button styles, inconsistent spacing, colors defined in 50 places. The enforcement layer (lint rules, import restrictions) is what makes this a system rather than a suggestion. Changing the entire platform's primary color or switching from Inter to a different font should be a single-line edit.

### [PRD-30] Modular Layout & Panel Management
- **Features:** Blender-style snappable/resizable panels.
- **Decision:** Maximizes screen real estate for different roles (Reviewer vs. Creator).

### [PRD-31] Command Palette & Navigation (Cmd+K)
- **Features:** Global search and command interface. Integrates with PRD-20 for instant entity search.
- **Decision:** Essential for power users to jump between projects and trigger bulk actions instantly.

### [PRD-32] Progressive Disclosure & UX Intelligence
- **Features:** "Power Knobs" vs. Advanced Drawers; Focus Mode; Non-Linear History.
- **Decision:** Prevents information overload while keeping deep technical control accessible.

### [PRD-51] Undo/Redo Architecture
- **Features:** A structured, tree-based undo/redo system that tracks all reversible actions across the platform with per-entity scoping and persistent state.
- **Key Capabilities:**
  - **Tree-Based History** — Undo history forms a tree, not a linear stack. Branching occurs when a user undoes several steps and then performs a new action — the old forward path is preserved as a branch, not destroyed.
  - **Per-Entity Scope** — Undo operates at the entity level (character, scene, segment), not globally. Undoing a metadata change on Character A doesn't affect unrelated work on Character B.
  - **Undoable Actions:**
    - Metadata edits (character traits, scene parameters, segment settings).
    - Approval/rejection decisions (with confirmation, since these may have triggered downstream events).
    - Parameter changes on pending/queued generation jobs.
    - Tag additions/removals (PRD-47).
    - Template application (PRD-27) — revert to pre-template state.
  - **Non-Undoable Actions (by design):**
    - Completed GPU generation (too expensive to "undo" — use re-generation instead).
    - Disk reclamation (deleted files cannot be restored from undo).
    - Audit log entries (PRD-45 — immutable by definition).
  - **Persistence** — Undo tree state serialized and stored per user per entity. Survives logout/login via PRD-04 session persistence.
  - **Visual History Browser** — Scrollable timeline showing the undo tree with branch points. Click any node to preview the state at that point before committing to the revert.
- **Decision:** Creative tools live and die by their undo system. The tree model (vs. linear) is essential because creators frequently explore ("try this, undo, try that") and need to revisit earlier branches. Per-entity scoping prevents the chaos of a global undo stack in a multi-entity workflow. Defining what is and isn't undoable upfront avoids inconsistent behavior that erodes user trust.

### [PRD-52] Keyboard Shortcut System & Presets
- **Features:** Unified, customizable keyboard shortcut infrastructure with industry-standard preset profiles and a discoverable cheat sheet.
- **Key Capabilities:**
  - **Shortcut Registry** — Single centralized registry of all keyboard shortcuts across the platform. Every action that has a shortcut is registered here — no scattered `addEventListener` calls.
  - **Preset Profiles** — Built-in keymap presets modeled after industry tools:
    - **Default** — Platform-native shortcuts optimized for the X121 workflow.
    - **Premiere** — Familiar to Adobe Premiere Pro editors.
    - **Resolve** — Familiar to DaVinci Resolve colorists.
    - **Avid** — Familiar to Avid Media Composer editors.
  - **Custom Keymaps** — Users can rebind any shortcut. Custom bindings override the active preset. Export/import keymaps as JSON for team sharing.
  - **Context-Aware Shortcuts** — Same key can do different things depending on active panel (e.g., `Space` plays video in the Review panel but toggles selection in the Library).
  - **Cheat Sheet Overlay** — Press `?` to see all available shortcuts for the current context, grouped by category. Highlights customized bindings.
  - **One-Handed Review Mode** — Dedicated shortcut cluster for single-hand review (e.g., `1` = Approve, `2` = Reject, `3` = Flag, `J/K/L` = shuttle controls). Optimized for reviewing with one hand on keyboard, other on mouse/jog dial.
- **Decision:** A professional production tool without comprehensive keyboard shortcuts forces users back to mouse-clicking through menus, which is unacceptable for speed-critical workflows like segment review. The preset system acknowledges that editors bring muscle memory from their primary NLE — fighting that muscle memory creates friction. The centralized registry also enables the Command Palette (PRD-31) to show shortcut hints next to every action.

### [PRD-53] First-Run Experience & Onboarding
- **Features:** Guided introduction for new users that progressively reveals platform capabilities without overwhelming them.
- **Key Capabilities:**
  - **Welcome Tour** — Interactive walkthrough on first login highlighting the main navigation areas (Library, Workflow Editor, Review, Dashboard). Skippable, re-accessible from Help menu.
  - **Sample Project** — Pre-loaded demo project with a character, seed images, and a few generated segments. Users can explore the full workflow (review, approve, regenerate) without needing to set up their own data first.
  - **Contextual Hints** — Non-intrusive tooltip hints that appear once per feature on first encounter (e.g., first time opening the Workflow Editor: "Drag nodes from the sidebar to build a pipeline"). Dismissible individually or all at once.
  - **Progressive Feature Reveal** — Advanced features (Worker Pool, Branching, Custom Themes) are visually subdued until the user has completed basic workflows. Not hidden — just not competing for attention during early sessions.
  - **Role-Specific Onboarding** — Different tour paths for Admin (infrastructure setup), Creator (generation workflow), and Reviewer (approval workflow) based on assigned role (PRD-03).
  - **Onboarding Checklist** — Optional "Getting Started" card on the Dashboard (PRD-42) with completion tracking: "Upload your first portrait," "Run your first generation," "Approve your first segment."
- **Decision:** A 50+ PRD platform is complex by nature. Without guided onboarding, new users face a blank canvas with 20 panels and no idea where to start. The sample project is critical — it lets users experience the review and approval flow immediately, building confidence before they invest time in their own data. The progressive reveal avoids the "airplane cockpit" problem while keeping power features accessible.

### [PRD-54] Background Job Tray
- **Features:** Persistent, always-visible lightweight status indicator for running and queued jobs, accessible from any view in the platform.
- **Key Capabilities:**
  - **Tray Icon** — Small persistent indicator in the top navigation bar showing: number of running jobs, number of queued jobs, and overall progress. Visible regardless of which view/panel the user is in.
  - **Expandable Panel** — Click the tray icon to expand a dropdown showing each active job with: name, progress bar, elapsed time, estimated remaining time, and quick actions (pause/cancel).
  - **Toast Notifications** — When a job completes or fails, a transient toast appears (integrated with PRD-10 event bus). Clicking the toast navigates to the completed segment.
  - **Sound Alerts** — Optional audio notification on job completion (configurable: on/off, custom sound). Useful when the user is working in a different application.
  - **Minimized Progress** — When the browser tab is not focused, the page title updates to show progress (e.g., "[73%] X121 — Generating Scene 3").
- **Decision:** PRD-42 (Studio Pulse) is a full dashboard for studio-wide monitoring. This PRD is the personal, glanceable companion — "What are my jobs doing right now?" When a 20-minute generation is running and the user is editing metadata on a different character, they need passive awareness without navigating to a separate dashboard. The browser title trick extends this awareness even when the app isn't the active window.

### [PRD-82] Content Sensitivity Controls
- **Features:** Configurable content visibility settings that control how sensitive material is displayed across the platform, enabling safe workspace use in different environments.
- **Key Capabilities:**
  - **Thumbnail Blur** — Configurable per-user setting to blur or redact thumbnails in library views, search results, and dashboard widgets. Toggle between: Full (unblurred), Soft Blur (recognizable but muted), Heavy Blur (unrecognizable), or Placeholder Icon (generic silhouette). Applies to all image and video thumbnails platform-wide.
  - **Per-View Overrides** — Users can override the global setting per view. Example: blur thumbnails in the library grid, but show full resolution in the active Review Interface (PRD-35) where pixel-level inspection is the purpose.
  - **Preview Watermarking** — Configurable on-screen watermark overlay for in-platform preview playback. Options: username, timestamp, project name, or custom text. Does not affect source files — applied as a compositing layer during playback only. Distinct from delivery watermarking (PRD-39) which burns into exported files.
  - **Screen-Share Mode** — One-click toggle (keyboard shortcut via PRD-52) that activates maximum blur/redaction across all views simultaneously. Designed for screen sharing, over-the-shoulder demos, or working in shared office spaces. Disables video autoplay and mutes audio.
  - **Admin Defaults** — Admins set studio-wide default sensitivity level. Individual users can increase but not decrease the studio minimum (e.g., if Admin sets "Soft Blur" as minimum, users can choose "Heavy Blur" but not "Full").
- **Decision:** The platform handles content that may not be appropriate for all viewing contexts (office environments, screen shares, client demos). Without sensitivity controls, users must either avoid using the platform in certain contexts or risk exposure. The admin minimum ensures studio policy compliance while per-user overrides respect individual preferences. Screen-Share Mode addresses the most urgent use case — a single shortcut to make the entire UI safe for sharing.

---

## Part 5: Workflow Editor & Review

### [PRD-83] Video Playback Engine & Codec Support
- **Features:** The foundational video player component that all review, preview, and comparison features depend on, providing frame-accurate playback with hardware acceleration and professional-grade transport controls.
- **Key Capabilities:**
  - **Codec Support Matrix** — Decode H.264, H.265/HEVC, VP9, and AV1. Graceful fallback when hardware acceleration is unavailable for a given codec. Clear error message (not silent failure) when a video uses an unsupported codec.
  - **Hardware-Accelerated Decoding** — Leverage GPU decoding via WebCodecs API where available. Fallback to software decoding for unsupported formats. Detect capabilities at runtime and select the optimal decode path.
  - **Frame-Accurate Seeking** — Seek to any individual frame by frame number or timecode (HH:MM:SS:FF). No "nearest keyframe" approximation — exact frame delivery for QA work where single-frame artifacts matter.
  - **Playback Speed Control** — Continuous speed adjustment from 0.1x to 4x. Frame-by-frame stepping forward and backward (integrated with PRD-37 jog dial). Keyboard shortcuts for common speeds (1x, 0.5x, 0.25x, 2x).
  - **A-B Loop** — Set loop in-point and out-point for repeated playback of a specific range. Essential for reviewing transition boundaries and spotting cyclic artifacts.
  - **Adaptive Bitrate Preview** — For library browsing and dashboard thumbnails, serve lower-resolution proxy versions to reduce bandwidth and improve responsiveness. Full-quality playback on demand when reviewing in the Review Interface (PRD-35).
  - **Audio Track Management** — Play, mute, or select audio tracks when present. Volume control with waveform visualization. Audio follows playback speed with pitch correction. Supports the audio scrubbing/vinyl mode (PRD-37).
  - **Thumbnail Generation** — Extract representative thumbnails from video files at configurable intervals. Used by library views (PRD-36), dashboard (PRD-42), and comparison grids (PRD-68).
  - **Performance Targets** — First frame rendered within 200ms of seek. Smooth playback at target framerate (24/30/60fps) without dropped frames on recommended hardware. Memory-efficient: no full-video buffering — stream and decode on demand.
- **Decision:** Every review and preview feature in the platform (PRD-35 through PRD-38, PRD-55, PRD-68, PRD-78, PRD-82) implicitly depends on a video player, but none of them define it. Frame-accurate seeking is non-negotiable for a QA tool — "the artifact is somewhere around 3 seconds in" is not professional-grade review. The WebCodecs API path future-proofs the player against codec evolution while the software fallback ensures universal compatibility. Separating the playback engine as its own PRD prevents every review feature from independently solving codec/decoding problems.

### [PRD-33] Node-Based Workflow Canvas
- **Features:** React Flow integration + Node-level timing telemetry.
- **Decision:** Provides high-level visibility into where the GPU time is actually being spent.

### [PRD-34] Interactive Debugger (Mid-Run Control)
- **Features:** Pause/Resume jobs, tweak parameters mid-run, and view intermediate latents.
- **Decision:** Allows "surgical" fixes during generation rather than waiting for failure.

### [PRD-35] One-Key Approval & Finalization Flow
- **Features:** Single-hotkey (`Enter`) asset finalization.
- **Decision:** Maximizes review speed for lead editors.

### [PRD-36] Cinema Mode & Sync-Play Grid
- **Features:** Borderless player with "Ambilight" glow + 2x2 comparison grid.
- **Decision:** Provides an immersive, distraction-free environment for final likeness checks.

### [PRD-37] QA Visual Aids (Ghosting, ROI, Jog Dial)
- **Features:** 50% opacity overlays, zoomed looping windows, and frame-stepping dial.
- **Decision:** Professional-grade tools for detecting micro-artifacts (jitter, pops).

### [PRD-38] Collaborative Review (Notes, Memos, Issues)
- **Features:** Timestamped notes, Voice Memos, and Failure Tagging (Face Melt/Jitter).
- **Decision:** Failure tags provide data for future model/audit-script training.

### [PRD-55] Director's View (Mobile/Tablet Review)
- **Features:** Simplified, touch-optimized interface for reviewing and approving content on mobile and tablet devices.
- **Key Capabilities:**
  - **Touch-First Layout** — Single-column, card-based layout optimized for touch. Large tap targets, swipe gestures, no hover-dependent interactions.
  - **Swipe Gestures** — Swipe right to approve, swipe left to reject, swipe up to flag for discussion. Gesture directions configurable per user preference.
  - **Simplified Navigation** — Flat navigation: Review Queue, My Projects, Activity Feed. No panel management, no node editor, no workflow canvas — those are desktop-only features.
  - **Video Playback** — Full-screen video player with pinch-to-zoom, scrub bar, and frame-step buttons sized for touch. Supports Sync-Play comparison (2-up, not 4-up) for tablet screens.
  - **Voice Notes** — Hold-to-record voice memos attached to the current timestamp. Particularly natural on mobile where typing is slow. Syncs with PRD-38 review notes.
  - **Offline Queue** — Cache the review queue locally for reviewing during connectivity gaps (plane, commute). Sync approvals/rejections when back online.
  - **Push Notifications** — Native push via PWA or wrapper app for job completions, review requests, and `@mentions`.
  - **Responsive Breakpoints** — Adapts from desktop to tablet (1024px) to phone (640px). Tablet gets 2-up comparison; phone gets single-segment view.
- **Decision:** The lead director reviewing dailies on an iPad during a meeting or while away from the studio is a real workflow. Forcing them into the full desktop UI on a touch device means they simply won't review until they're back at their desk, creating a bottleneck. The Director's View is a purpose-built review surface — it doesn't replicate the full platform, just the approval workflow that unblocks the team.

### [PRD-68] Cross-Character Scene Comparison
- **Features:** Gallery view for comparing the same scene type across all characters in a project, enabling consistency and quality assessment at the project level.
- **Key Capabilities:**
  - **Scene Type Gallery** — Select a scene type (e.g., "dance") and see thumbnails/previews for every character that has that scene, side by side. Grid layout: one cell per character, showing the scene's keyframe strip or playing video.
  - **Synchronized Playback** — Play all character versions of the same scene type simultaneously. Spot inconsistencies in timing, motion quality, or style across characters.
  - **Sort & Filter** — Sort by QA score, generation date, approval status. Filter to show only unapproved scenes, or only scenes from a specific variant (clothed/topless).
  - **Quick Actions** — Approve, reject, or flag individual scenes directly from the gallery without opening each one separately. Approve all passing scenes in one click.
  - **Variant Toggle** — Switch the entire gallery between clothed and topless variants for the same scene type. Compare "all clothed dances" then "all topless dances."
  - **Per-Character Comparison** — Inverse view: select a character, see all their scene types in a row. "How does Jane look across dance, idle, bj, feet?"
- **Decision:** The PRD-57 matrix view shows status per cell, and PRD-62 shows storyboard strips per scene. But neither provides the specific "same scene across all characters" comparison that a creative director needs to assess project-wide consistency. When 10 characters are all doing a "dance" scene, you want to see them all at once to spot the one that looks off — not review 10 separate videos sequentially.

### [PRD-70] On-Frame Annotation & Markup
- **Features:** Drawing and annotation tools for marking up specific frames during review, enabling precise visual communication of issues.
- **Key Capabilities:**
  - **Drawing Tools** — Freehand pen, circle, rectangle, arrow, and highlight overlays directly on paused video frames. Color picker for annotation color.
  - **Text Labels** — Add text callouts anchored to specific frame locations: "Hand artifact here," "Face drift starting," "Lighting mismatch."
  - **Frame Pinning** — Annotations are attached to a specific frame number and timecode. When scrubbing through the video, annotations appear/disappear at their pinned frame.
  - **Annotation Layers** — Multiple reviewers can annotate the same segment. Each reviewer's annotations appear as a separate layer, togglable on/off.
  - **Annotation Summary** — List view of all annotations on a segment, sortable by frame number. Click an annotation to jump to that frame with the markup visible.
  - **Export** — Export annotated frames as PNG images for sharing outside the platform (email, Slack, print).
  - **Integration with PRD-38** — Annotations are stored as part of the collaborative review notes. When a reviewer flags a segment with a drawing, the annotation appears in the review thread alongside text notes and voice memos.
- **Decision:** "The hand is wrong" is vague. A circle drawn on the exact frame where the hand artifact occurs is unambiguous. Professional review tools (Frame.io, SyncSketch) have proven that visual annotation dramatically reduces review cycles by eliminating back-and-forth about which issue is being discussed. For a platform where subtle artifacts (face drift, finger count, clothing seams) are common failure modes, pointing at the problem is faster and clearer than describing it.

### [PRD-78] Segment Trimming & Frame-Level Editing
- **Features:** Lightweight in-platform video trimmer for making minor adjustments to generated segments without requiring full regeneration.
- **Key Capabilities:**
  - **In/Out Point Trimming** — Set in-point and out-point on a segment to trim unwanted frames from the start or end. Frame-accurate scrubbing with timecode display.
  - **Non-Destructive** — Trimming creates a new trimmed version; the original segment is preserved. The user can revert to the original at any time.
  - **Seed Frame Update** — When a segment's end is trimmed, the last frame of the trimmed version becomes the new seed for the next segment. The system warns if this would invalidate an already-generated next segment.
  - **Quick Trim Presets** — "Trim first 5 frames" and "Trim last 5 frames" one-click actions for the most common use case (removing a start/end artifact).
  - **Batch Trim** — Apply the same trim (e.g., remove first 3 frames) to multiple segments at once. Useful when a workflow consistently produces a bad first frame.
  - **Concatenation Awareness** — PRD-39 (Scene Assembler) uses trimmed versions when available. Trim points are respected during concatenation without requiring re-export.
- **Decision:** Regenerating a 5-second segment because the last 0.3 seconds has a motion artifact wastes 30+ seconds of GPU time plus queue wait time. Trimming costs zero GPU time and takes 5 seconds. For segments where the issue is confined to the first or last few frames (common with I2V models), trimming is the correct fix — not regeneration. The non-destructive approach ensures no data is lost.

### [PRD-92] Batch Review & Approval Workflows
- **Features:** Bulk review actions and structured review workflows for efficiently processing large numbers of segments and scenes, extending PRD-35 (Review Interface) with batch capabilities.
- **Key Capabilities:**
  - **Multi-Select Review** — Select multiple segments or scenes in the review queue. Apply a single action to all: Approve All, Reject All, Reject & Re-queue All. Keyboard-accelerated: Shift+Click to select range, Ctrl+A to select all visible.
  - **Auto-QA Filter Actions** — "Approve all segments that passed auto-QA (PRD-49) with score above X." One-click to approve the obvious passes, leaving only borderline cases for manual review. Configurable threshold per batch.
  - **Sorted Review Queue** — Configurable sort order for review: worst QA score first (review problems first), oldest first (FIFO), by scene type (review all dances, then all idles), by character, or random. Saved sort preferences per user.
  - **Review Progress Counter** — "23 of 47 reviewed" with a progress bar. Estimated time remaining based on average review pace. Gamification: "You've reviewed 15 segments in the last 10 minutes."
  - **Quick Review Mode** — Streamlined keyboard-only workflow: video auto-plays, press 1 to approve, 2 to reject, 3 to flag for discussion, Space to skip. No mouse interaction needed. Next segment loads automatically after action. Designed for rapid throughput.
  - **Review Assignment** — Assign review batches to specific reviewers: "Jane reviews all dance scenes, Bob reviews all idle scenes." Assignment dashboard showing who has what and their progress.
  - **Review Deadline** — Set a deadline on review batches. Notification escalation if the deadline approaches with unreviewed items: "12 segments unreviewed — deadline in 2 hours."
- **Decision:** A 10-character × 8-scene-type production run produces 80+ scenes, each with multiple segments — potentially 400+ items to review. Without batch workflows, every segment is reviewed one at a time with full mouse interaction. Quick Review Mode with keyboard shortcuts can increase review throughput 3-5x. The auto-QA filter handles the easy cases automatically, focusing human attention on the genuinely ambiguous segments where judgment is needed.

### [PRD-101] Segment Regeneration Comparison
- **Features:** Automatic side-by-side comparison of old vs. new versions when a segment is regenerated, enabling quick accept/revert decisions without navigating to the full branching system (PRD-50).
- **Key Capabilities:**
  - **Auto-Trigger** — When a rejected segment is regenerated, the system automatically presents the comparison view: old version on the left, new version on the right.
  - **Synchronized Playback** — Both versions play in sync (PRD-83 engine). Pause, scrub, and frame-step controls affect both simultaneously. Spot differences in real time.
  - **Difference Highlighting** — Optional SSIM-based difference overlay showing regions where the two versions diverge most. Heat map mode: blue = identical, red = maximum difference.
  - **Quick Actions** — "Keep New" (approve the regeneration), "Revert to Old" (restore the previous version), or "Keep Both" (create a branch via PRD-50 for later comparison). Single keyboard shortcut for each.
  - **Version History** — If a segment has been regenerated multiple times, browse all previous versions in a filmstrip. Select any two versions for side-by-side comparison.
  - **QA Score Comparison** — Show auto-QA scores (PRD-49) for both versions side by side: "Old: face 0.82, motion 0.71. New: face 0.89, motion 0.68." Helps quantify whether the regeneration actually improved quality.
  - **Batch Comparison** — When multiple segments in a scene are regenerated at once (e.g., after a LoRA update), present a sequential comparison workflow: review each regenerated segment one by one, accept/revert each, with progress tracking.
- **Decision:** Regeneration is the most common response to a rejected segment, and "Is the new version better?" is the immediate next question. PRD-50 (Content Branching) provides a full git-like branching system, but it's heavyweight for the simple case of "I regenerated this one segment — is it better?" The comparison view answers this question in 5 seconds with zero navigation overhead. The version history ensures that if the third regeneration attempt was actually worse than the second, the second can be recovered.

### [PRD-95] Production Notes & Internal Comments
- **Features:** Freeform sticky notes attachable to any platform entity (project, character, scene, segment), providing persistent internal communication that lives alongside the entities they describe.
- **Key Capabilities:**
  - **Entity Attachment** — Attach notes to any entity: projects, characters, scenes, segments, scene types, or workflows. Notes appear in a collapsible panel on the entity's detail view.
  - **Rich Text** — Markdown-formatted notes with support for @mentions (PRD-10 notifications), inline images, and links to other platform entities (character, scene, segment deep-links).
  - **Pinned Notes** — Pin critical notes to the top of the entity's note list. Pinned notes also display as a banner when navigating to the entity: "Note: This character needs manual face correction before scene generation."
  - **Note Categories** — Categorize notes: Instruction (how-to), Blocker (something preventing progress), FYI (informational), or Custom. Filter notes by category.
  - **Thread Replies** — Reply to notes to create discussion threads. Keeps related conversation grouped rather than scattered across individual notes.
  - **Note Search** — Notes are indexed by PRD-20 (Search Engine). "Find all notes mentioning 'face correction'" returns results across all entities.
  - **Visibility Scope** — Notes can be scoped: Private (only the author sees it), Team (all platform users), or Role-specific (only Admins, only Creators). Default: Team.
- **Decision:** PRD-38 (Collaborative Review) handles QA-specific notes tied to the approval workflow: "this segment has a hand artifact at frame 47." Production notes serve a different purpose: "this character's source image is being re-shot next week — hold off on generation," "client requested all dance scenes use the new LoRA," or "this workflow crashes on Worker 3 — use Worker 1 only." These are operational communications that don't belong in the QA review thread but need to be visible where the work happens.

### [PRD-96] Poster Frame & Thumbnail Selection
- **Features:** Manual selection of representative frames for scenes and characters, overriding auto-generated thumbnails with hand-picked hero images.
- **Key Capabilities:**
  - **Frame Selection from Player** — While viewing a segment in the review player (PRD-35/PRD-83), click "Set as Poster Frame" to use the current frame as the scene's thumbnail. The selected frame is extracted and stored as a static image.
  - **Character Poster** — Select a poster frame that represents the character across the platform: library views (PRD-60), dashboard widgets (PRD-42/PRD-89), search results (PRD-20), and shared links (PRD-84). Defaults to a keyframe from the first approved scene if not manually set.
  - **Scene Poster** — Select a poster frame per scene, used in the scene list, batch orchestrator grid (PRD-57), and comparison views (PRD-68). Defaults to the first frame of the first segment.
  - **Poster Frame Gallery** — View all poster frames for a project's characters in a grid. Quickly identify characters with weak or unrepresentative thumbnails. Bulk action: "Auto-select best frame" using face confidence score from PRD-49.
  - **Crop & Adjust** — Light editing of the selected poster frame: crop to aspect ratio, brightness/contrast adjustment. No full image editing — just enough to make a good thumbnail from a good frame.
  - **Versioned** — When a scene is regenerated, the poster frame selection persists if the selected frame still exists. If the segment was regenerated, the user is prompted to select a new poster frame.
- **Decision:** Auto-generated thumbnails (typically first frame or middle frame) are often unrepresentative — the first frame of a dance scene is a still pose, not a dance. The character's "first impression" in every library view, dashboard, and shared link is determined by the thumbnail. A manually selected hero frame that captures the best moment dramatically improves the visual quality of the entire platform's UI. It's a small feature with outsized impact on perceived production quality.

---

## Part 6: Production & Hand-off

### [PRD-39] Scene Assembler & Delivery Packaging
- **Features:** Concatenation of approved segments into final scene videos, automatic naming per convention, and ZIP packaging for downstream delivery.
- **Key Capabilities:**
  - **Segment Concatenation** — Combine all approved segments for a scene into a single continuous video. Lossless concatenation where codec/resolution match; re-encode only when necessary.
  - **Automatic Naming** — Apply the naming convention (PRD-01) automatically based on scene metadata:
    - Derive `prefix_` from image variant (`topless_` or none).
    - Derive `content` from scene type name.
    - Append `_clothes_off` for transition scenes.
    - Append `_index` when multiple scenes of the same type exist.
    - No manual renaming required — the system knows the scene's variant, type, and index.
  - **Review Concatenation** — Generate a "review cut" for approval before producing the final delivery version.
  - **Watermarking** — Review cuts are watermarked to prevent premature distribution. Configurable watermark: text or image overlay, position (center/corner), opacity, and optional timecode burn-in. Final delivery versions are clean (no watermark).
  - **Output Format Profiles** — Define reusable delivery profiles specifying resolution, codec, bitrate, and container format. Examples: "Platform A: 1080p H.264 8Mbps MP4", "Platform B: 720p H.265 4Mbps MP4", "Archive: 4K ProRes MOV". Scenes are assembled once, then transcoded to each required profile automatically.
  - **Per-Character Packaging** — Assemble all approved scene videos for a character into their delivery folder alongside `metadata.json`, `clothed.png`, and `topless.png`.
  - **Project ZIP Export** — Package all character folders into a single ZIP archive matching the delivery structure (PRD-01). One-click export for the entire project or selected characters. Supports exporting per output format profile.
  - **Delivery Validation** — Pre-export check that all expected scenes are present and approved, all required files exist (metadata, images, videos), and naming follows convention. Warn on missing scenes before allowing export.
  - **Incremental Re-export** — When a single scene is re-done and re-approved, re-export only that character's folder without rebuilding the entire ZIP.
- **Decision:** This is the bridge between "all scenes approved" and "deliverable output." The automated naming eliminates the manual rename step that currently requires scripts (rename_videos.py). The delivery validation prevents shipping incomplete packages. The ZIP structure is contractual — it must match what the downstream consumer expects, so the system enforces it rather than relying on humans to remember the convention. Watermarking protects work-in-progress from unauthorized distribution. Output format profiles prevent manual FFmpeg transcoding and ensure every delivery target gets the right specification.

### [PRD-102] Video Compliance Checker
- **Features:** Automated pre-delivery verification that all video files meet target specifications, catching technical issues before export.
- **Key Capabilities:**
  - **Spec Validation per Profile** — For each output format profile (PRD-39), verify every video matches: target resolution (exact or within tolerance), correct codec and container format, bitrate within acceptable range, and correct pixel format / color depth.
  - **Duration Compliance** — Verify scene videos fall within the target duration range configured in the scene type (PRD-23). Flag videos that are shorter than minimum duration (missing segments?) or longer than maximum (extra segments?).
  - **File Integrity** — Verify every video is playable to its last frame. Detect truncated files (common after interrupted generation), corrupted headers, and files that claim a duration longer than their actual content.
  - **Audio Compliance** — Verify audio track presence matches expectation: if audio is expected, check it exists and has the correct sample rate/channel count. If audio should be absent, flag unexpected audio tracks.
  - **Naming Convention** — Verify all filenames follow the PRD-01 naming convention. Flag misnamed files with suggested corrections.
  - **Completeness Check** — Cross-reference the delivery manifest against actual files: are all expected scenes present? Are all required files (metadata.json, clothed.png, topless.png) in each character folder? Report missing files.
  - **Compliance Report** — Generate a pass/fail report per character and per file. Summary: "42 of 44 files pass. 2 issues: bj.mp4 bitrate 12.1Mbps exceeds target 8Mbps; topless_feet.mp4 is 2s shorter than target duration." One-click action to fix where possible (re-transcode) or flag for re-generation.
  - **Pre-Export Gate** — Optionally block ZIP export (PRD-39) until all compliance checks pass. Configurable: strict (block on any failure) or lenient (warn but allow export).
- **Decision:** PRD-39's delivery validation checks that files exist and are approved. This PRD goes deeper into technical correctness — a file can exist and be approved but have the wrong bitrate, be slightly corrupted, or fail to match the output format profile. These issues are invisible in the UI (the video plays fine in-browser) but cause problems downstream: rejected by a platform's ingestion pipeline, quality complaints from re-encoding artifacts, or duration mismatches breaking a client's templating system. Catching these before export prevents costly re-delivery cycles.

### [PRD-40] VFX Sidecar & Dataset Export
- **Features:** Automated XML/CSV technical data generation + One-click training dataset zip.
- **Decision:** Bridges the gap between AI generation and professional VFX/Training pipelines.

### [PRD-41] Performance & Benchmarking Dashboard
- **Features:** Reports on time-per-frame, VRAM peaks, and Likeness Scores.
- **Decision:** Helps Admins identify "expensive" or "low-quality" workflows.

### [PRD-42] Studio Pulse Dashboard
- **Features:** Customizable widgets for Active Tasks, Disk Health, Project Progress, and Activity Feed. Consumes events from PRD-10.
- **Decision:** The "Command Center" for the whole studio to see real-time activity.

### [PRD-72] Project Lifecycle & Archival
- **Features:** Formal lifecycle states for projects with transitions, completion workflows, and archival policies.
- **Lifecycle States:**
  - **Setup** — Project created, characters being onboarded, scene types being configured. No generation has started.
  - **Active** — Generation, review, and approval in progress. The default working state.
  - **Delivered** — All scenes approved and delivery ZIP exported (PRD-39). Project is locked from new generation but review notes and metadata remain editable.
  - **Archived** — Project moved to cold storage (PRD-48). Metadata remains searchable but binary assets require retrieval. Can be un-archived back to Delivered state.
  - **Closed** — Permanently concluded. Supporting files eligible for full reclamation (PRD-15). Only final deliverables and metadata preserved.
- **Key Capabilities:**
  - **Completion Checklist** — Before transitioning to Delivered, verify: all scenes approved, metadata complete, delivery validation passed (PRD-39). Block transition if checks fail.
  - **Project Summary Report** — Auto-generated on delivery: total characters, scenes produced, GPU hours consumed, wall-clock time from start to delivery, QA pass rates, re-generation counts. Exportable as PDF/JSON.
  - **Bulk Archival** — Archive multiple completed projects at once. Schedule archival (e.g., "Archive all Delivered projects older than 90 days").
  - **Edit Lock** — Delivered and Archived projects prevent accidental changes. Explicit "Re-open" action required to return to Active state, with audit log entry (PRD-45).
- **Decision:** Without lifecycle management, old projects accumulate indefinitely — consuming disk, cluttering search results, and creating ambiguity about what's "done." Formal states with transition rules bring the same discipline to project management that PRD-08 brings to job management. The summary report provides institutional memory of how long projects actually take and where time was spent.

### [PRD-73] Production Reporting & Data Export
- **Features:** Aggregated production metrics and exportable reports for management visibility and operational planning.
- **Key Reports:**
  - **Delivery Summary** — Characters delivered per period, broken down by project. "This month: 45 characters across 3 projects."
  - **Throughput Metrics** — Average turnaround time from character onboarding to delivery. Trend over time to measure process improvement.
  - **GPU Utilization** — Total GPU hours consumed, broken down by project, scene type, and resolution tier (PRD-59). Idle time vs. active generation time.
  - **Quality Metrics** — Auto-QA pass rates (PRD-49), average retry count (PRD-71), most common failure types, failure rate trends.
  - **Cost per Character** — Average GPU time and wall-clock time per character, broken down by scene type. Identify which scene types are most expensive.
  - **Reviewer Productivity** — Average review turnaround time, approval/rejection ratios, annotation density. Not for micromanagement — for identifying bottlenecks in the review pipeline.
- **Key Capabilities:**
  - **Export Formats** — CSV for data analysis, PDF for stakeholder presentations, JSON for programmatic consumption via PRD-12 API.
  - **Scheduled Reports** — Configure reports to auto-generate and email at regular intervals (weekly, monthly).
  - **Custom Date Ranges** — All reports support arbitrary date range filtering.
  - **Dashboard Widgets** — Key metrics surfaced as PRD-42 (Studio Pulse) widgets for real-time monitoring.
- **Decision:** Producers and studio managers who don't use the platform daily need visibility into production progress and resource consumption. Without reporting, status updates require manually counting scenes and asking creators. Reporting also enables data-driven decisions: "Scene type X costs 3x more GPU time than type Y — is the quality difference worth it?"

### [PRD-84] External Review / Shareable Preview Links
- **Features:** Time-limited, token-authenticated URLs for sharing specific scenes or characters with people who do not have platform accounts, enabling external stakeholder review without requiring onboarding.
- **Key Capabilities:**
  - **Link Generation** — From any scene, character, or project, generate a shareable preview URL. The link includes a cryptographic token that grants read-only access to the specified content without requiring login.
  - **Scope Control** — Links can be scoped to: a single segment, a full scene (all segments concatenated), all scenes for a character, or an entire project. The viewer sees only the scoped content — no navigation to other parts of the platform.
  - **Expiry & Limits** — Each link has a configurable expiry (e.g., 24 hours, 7 days, custom). Optional view-count limit (e.g., "valid for 10 views"). Optional password protection for an additional access barrier.
  - **Watermarked Playback** — External previews are automatically watermarked (using PRD-39 watermark settings or a dedicated "external review" watermark). The viewer's IP or link token is embedded in the watermark for traceability.
  - **Viewer Feedback** — Optional feedback form: approve/reject buttons and a text comment field. Feedback is captured and attached to the scene's review thread (PRD-38) with attribution to the link token (not a platform user).
  - **Activity Tracking** — Track when the link was accessed, from which IP, how many times, and whether feedback was submitted. Visible to the link creator in a "Shared Links" management panel.
  - **Link Management** — Dashboard of all active shared links: who created them, what they link to, expiry status, view count, and feedback received. Revoke any link instantly.
  - **Branding** — The external review page uses a minimal, clean layout with optional studio logo and name. No platform chrome, no navigation — just the content and feedback controls.
- **Decision:** PRD-55 (Director's View) serves users with platform accounts. But studios frequently need feedback from people outside the platform: clients, external directors, compliance reviewers, or business partners. Creating accounts for every external reviewer adds friction, RBAC complexity, and security surface area. Shareable links provide the "send this to the client for a quick thumbs up" workflow that currently happens via email attachments or cloud storage links — but with watermarking, expiry, and audit trails built in.

### [PRD-89] Dashboard Widget Customization
- **Features:** User-configurable dashboard layouts with drag-and-drop widget placement, a widget library, and per-user persistence, extending PRD-42 (Studio Pulse Dashboard) with personalization.
- **Key Capabilities:**
  - **Widget Library** — Catalog of available dashboard widgets: Active Jobs, Recent Approvals, My Review Queue, Disk Health, Project Progress, GPU Utilization, Pinned Characters, Quick Links, Activity Feed (PRD-42), Calendar/Schedule (PRD-08), and Quality Trends (PRD-73).
  - **Drag-and-Drop Layout** — Enter "Edit Mode" on the dashboard to rearrange, resize, add, or remove widgets. Snap-to-grid layout with responsive columns. Widgets can span 1-4 columns and have configurable row height.
  - **Per-Widget Configuration** — Each widget instance has settings. Example: the "Project Progress" widget can be configured to show a specific project or all projects. The "Active Jobs" widget can filter to "My jobs" or "All jobs."
  - **Per-User Persistence** — Dashboard layouts are saved per user (via PRD-04 session persistence). Each user sees their own arrangement. Changes don't affect other users.
  - **Role-Based Defaults** — Admins define default dashboard layouts per role: Admins see system health and GPU utilization prominently, Creators see their job queue and review status, Reviewers see the review queue and recent submissions. Users can customize from the role default.
  - **Dashboard Presets** — Save and name multiple dashboard layouts. Switch between them: "Production Mode" (jobs and progress), "Review Mode" (review queue and comparisons), "Admin Mode" (system health and GPU stats). Share presets with other users.
  - **Extension Widgets** — UI plugins (PRD-85) can register custom widgets that appear in the widget library alongside native ones.
- **Decision:** PRD-42 defines what the Studio Pulse Dashboard shows, but treats it as a fixed layout. In practice, an Admin monitoring GPU health wants a different dashboard from a Creator tracking their active jobs, and a Reviewer wants their review queue front and center. Without customization, everyone gets the same compromise layout where nobody's primary information is prominently placed. Role-based defaults provide a sensible starting point while per-user customization handles individual preferences.

---

## Part 7: Maintenance & Admin

### [PRD-43] System Integrity & Repair Tools
- **Features:** Model Integrity Scanner + Missing Node Auto-Installer.
- **Decision:** Simplifies the setup of new workers and maintains a "Healthy" asset library.

### [PRD-105] Platform Setup Wizard
- **Features:** Guided first-time installation and configuration wizard that walks an administrator through connecting all platform dependencies and verifying the system is ready for use.
- **Key Capabilities:**
  - **Step-by-Step Flow** — Sequential configuration screens:
    1. **Database Connection** — Enter PostgreSQL connection string. Test connectivity. Run initial schema migration. Verify successful table creation.
    2. **Storage Configuration** — Set root storage path for assets, temp files, and exports. Verify disk space meets minimum requirements. Create directory structure.
    3. **ComfyUI Connection** — Enter ComfyUI WebSocket URL(s). Test connectivity (PRD-05). Verify version compatibility. Discover installed custom nodes and models.
    4. **First Admin Account** — Create the initial admin user. Set password and recovery method.
    5. **Worker Registration** — Register at least one GPU worker (PRD-46). Run a test generation to verify the full pipeline works end-to-end.
    6. **Optional Integrations** — Configure email/Slack for notifications (PRD-10), external webhook endpoints (PRD-12), and storage backup destination (PRD-81).
  - **Validation at Each Step** — Each step validates before allowing progression. Clear error messages with troubleshooting hints: "Cannot connect to PostgreSQL at localhost:5432. Is the service running? Check firewall rules."
  - **System Health Check** — Final step runs PRD-80 (System Health Page) checks and presents a summary: all green = ready to go, any red = what needs fixing.
  - **Skip for Experts** — Experienced admins can skip the wizard and configure everything via config files or environment variables. The wizard is a convenience, not a requirement.
  - **Re-Run Capability** — The wizard can be re-run from the admin panel to reconfigure any component (e.g., add a new ComfyUI instance, change storage path). Only the relevant steps are shown.
- **Decision:** PRD-53 handles onboarding for users who interact with the platform. This PRD handles onboarding for the person who deploys and configures the platform itself — a fundamentally different audience (DevOps/Admin vs. Creator/Reviewer). A complex platform with 5+ external dependencies (PostgreSQL, ComfyUI, GPU workers, filesystem, optional integrations) is daunting to set up from documentation alone. The wizard turns "read 20 pages of docs and hope you didn't miss a step" into "follow the prompts and get confirmation at each step."

### [PRD-44] Bug Reporting & App Config Export
- **Features:** One-click session recording for bugs + Portable App-Config export.
- **Decision:** Ensures the Admin can debug UI issues and back up the studio's entire logic.

### [PRD-45] Audit Logging & Compliance
- **Features:** Comprehensive, immutable operational audit trail for all user and system actions.
- **Key Capabilities:**
  - **User Actions** — Login/logout, job submissions, approvals/rejections, metadata edits, configuration changes.
  - **System Actions** — Service restarts, disk reclamation runs, auto-healing events, failed authentication attempts.
  - **Queryable Log Store** — Structured logs (not just text files) with filtering by user, action type, entity, and time range.
  - **Retention Policies** — Configurable log retention with automatic archival of older entries.
- **Decision:** Distinct from M-04 (Metadata Timeline) which tracks field-level content changes. This PRD covers operational accountability: who did what and when. Multi-user studio environments need this for dispute resolution ("Who deleted that scene?"), security auditing, and understanding system behavior during incidents.

### [PRD-98] Session Management & Active Users
- **Features:** Admin panel for real-time visibility into active user sessions with session control and login history, extending PRD-03 (RBAC) and PRD-45 (Audit Logging).
- **Key Capabilities:**
  - **Active Sessions List** — Real-time view of all currently active sessions: username, role, login time, last activity timestamp, current page/view, IP address, and device/browser info.
  - **Idle Detection** — Sessions marked as "Idle" after configurable inactivity period (e.g., 15 minutes). Idle sessions can be automatically terminated after a longer timeout (e.g., 2 hours) to free segment locks (PRD-11).
  - **Force Terminate** — Admin can force-terminate any session. The affected user sees a "Session terminated by administrator" message and must re-authenticate. Use case: suspected unauthorized access, or clearing a stale session that holds segment locks.
  - **Concurrent Session Limits** — Optional per-user or per-role limit on simultaneous sessions. "Reviewers can have 1 active session; Admins can have 3." Prevents credential sharing.
  - **Login History** — Per-user history of all login/logout events with timestamps, IP addresses, and success/failure status. "Jane logged in from 3 different IPs in the last 24 hours" flagged as unusual activity.
  - **Failed Login Alerts** — After N failed login attempts for a user, trigger a notification to Admins via PRD-10. Optionally lock the account temporarily (configurable lockout duration).
  - **Session Analytics** — Usage patterns: average session duration, peak concurrent users, most active times of day. Feeds into capacity planning and license management.
- **Decision:** PRD-03 handles authentication and role assignment, and PRD-45 logs actions after the fact. But neither provides real-time "who's online right now?" visibility. For segment locking (PRD-11), this is operationally critical — if a user closes their browser without logging out, their locks persist until the heartbeat times out. Session management lets admins clear these immediately. The login history and failed attempt alerting add a basic security monitoring layer that's essential for any multi-user platform.

### [PRD-56] Studio Wiki & Contextual Help
- **Features:** Integrated documentation system with context-aware help links throughout the platform, enabling both official platform docs and studio-specific knowledge articles.
- **Key Capabilities:**
  - **Contextual Help Links** — Right-click any node type, parameter, or panel header to see "View Docs" linking to the relevant wiki article. Hover a workflow parameter to see a tooltip with its description pulled from the wiki.
  - **Built-in Platform Docs** — Pre-loaded documentation for all platform features: how each panel works, what each parameter does, workflow best practices. Ships with the platform and updates with each release.
  - **Studio Knowledge Base** — User-created articles for studio-specific knowledge: "Our LoRA naming conventions," "How to set up a new character," "Color correction checklist." Markdown editor with image/video embedding.
  - **Searchable** — Wiki articles are indexed by PRD-20 (Search Engine). Searching "LoRA" in the Command Palette (PRD-31) returns both platform entities and relevant wiki articles.
  - **Version History** — Wiki articles are versioned with diff view. Any user can edit; Admins can revert.
  - **Pinned Articles** — Admins can pin important articles (e.g., "Studio Style Guide") to the Dashboard (PRD-42) or specific panel headers.
- **Decision:** A 56-PRD platform needs embedded documentation, not an external wiki users will never visit. Contextual help — right where the user encounters the concept — is the difference between "I'll figure it out later" and "I understand this now." Studio-specific articles capture tribal knowledge that would otherwise live in someone's head or a Slack thread.

### [PRD-80] System Health Page
- **Features:** Unified infrastructure health dashboard providing at-a-glance status of all platform dependencies and services.
- **Key Capabilities:**
  - **Service Status Grid** — Real-time status indicators for each core service: Rust backend, PostgreSQL database, ComfyUI instance(s), worker nodes (PRD-46), filesystem/storage, and event bus (PRD-10). Each shows: status (healthy/degraded/down), uptime since last restart, response latency, and last health check timestamp.
  - **Dependency Checks** — Automated verification of external dependencies: disk space thresholds, database connection pool utilization, WebSocket connection health (PRD-05), and model file accessibility (PRD-17). Each dependency has configurable warning and critical thresholds.
  - **Historical Uptime** — Rolling 7-day and 30-day uptime percentage per service. Timeline visualization showing outage windows and degraded periods.
  - **Alerting Integration** — When any service transitions from healthy to degraded or down, triggers an event via PRD-10 (Event Bus). Configurable escalation: first alert to admin dashboard, second alert after N minutes to external webhook (Slack/PagerDuty via PRD-12).
  - **Quick Actions** — Per-service action buttons: restart service, view logs (last 100 lines), run diagnostic check, and force health re-check. Integrates with PRD-06 (Hardware Monitoring) for GPU-specific controls.
  - **Startup Checklist** — On platform boot, runs a comprehensive pre-flight check: database migrations current, ComfyUI reachable, at least one worker online, required model files present. Blocks generation jobs until all critical checks pass, with a clear status page showing what's pending.
- **Decision:** PRD-06 monitors GPU hardware and PRD-46 monitors worker nodes, but neither provides a holistic view of whether the platform as a whole is healthy. When generation fails, the first question is always "Is everything running?" Without a unified health page, admins must SSH into multiple services to answer that question. The startup checklist prevents the common scenario where a platform restart leaves one service down and generation jobs silently fail.

### [PRD-81] Backup & Disaster Recovery
- **Features:** Automated backup scheduling, verification, and recovery procedures for all platform data (database, configuration, and critical assets).
- **Key Capabilities:**
  - **Database Backup Scheduling** — Automated pg_dump-based backups on a configurable schedule (e.g., every 6 hours). Full and incremental backup support. Backups written to a configurable destination (local path, network mount, or S3-compatible storage).
  - **Point-in-Time Recovery (PITR)** — PostgreSQL WAL archiving for continuous backup. Restore to any point within the retention window (e.g., "restore to 3:42 PM yesterday"). UI shows a timeline of available restore points with annotations (what was happening at that time — jobs running, approvals made).
  - **Configuration Backup** — Automated export of all platform configuration: workflow JSONs, scene type definitions, hook scripts (PRD-77), project templates (PRD-74), notification preferences, and RBAC settings. Stored as a versioned portable archive (extends PRD-44 App Config Export).
  - **Asset Backup Verification** — Periodic integrity check of critical assets (source images, approved final videos). Compares checksums against database records. Flags missing or corrupted files before they're needed in a generation run.
  - **Backup Verification** — Automated test restores on a schedule (e.g., weekly). Restores the latest backup to a temporary database, runs validation queries, and reports success/failure. Prevents the "backups existed but were corrupt" disaster.
  - **Recovery Runbook** — In-platform step-by-step recovery guide: which backup to use, how to restore the database, how to re-import configuration, and how to verify the restored state. Accessible even when the main platform is down (static HTML export).
  - **Retention Management** — Configurable backup retention (e.g., keep hourly for 24h, daily for 30d, weekly for 6 months). Automatic cleanup of expired backups with disk space tracking.
- **Decision:** A platform managing hundreds of characters with thousands of approved video segments cannot afford data loss. Database-only backup is insufficient — configuration (workflows, templates, hooks) represents significant studio investment that's equally critical. Backup verification is the key differentiator: untested backups are not backups. The recovery runbook ensures that restoration doesn't depend on one person's tribal knowledge.

---

## Part 8: Evaluation List (The "MAYBE" List)

### [M-01] Hero Asset Propagation (Global Template Sync)

- **Description:** Bulk application of winning settings (Workflow ID, LoRA weights, CFG, Prompt structure) to all other scenes for a character.

- **Decision Status:** *Strong Maybe — consider promoting to core for V1.1.*

- **Reasoning:** High value for consistency, but requires a sophisticated "Inheritance vs. Override" model. The Template system (PRD-27) provides the forward-looking half of this problem (new scenes start from a template). M-01 adds the retroactive half (existing scenes adopt a new baseline). A cascade model (like CSS specificity — Studio > Project > Character > Scene, with explicit overrides preserved) makes the "Inheritance vs. Override" problem tractable. Once a studio has 20+ characters each with 10+ scenes, manual application becomes a genuine bottleneck.

### [M-02] Bulk Metadata Enrichment (AI VLM Scanning)

- **Description:** Using VLMs to automatically populate `character_metadata` fields (eye color, hair texture, etc.).

- **Decision Status:** *Maybe.*

- **Reasoning:** Risk of AI hallucinations in metadata. Since this metadata is for downstream consumption (VFX/3D), 100% accuracy is required. Manual "Human-in-the-loop" verification is prioritized for Phase 1.

### [M-03] Visual Workflow Diff (Graph Comparison)

- **Description:** Graph-based comparison of two ComfyUI JSON versions, highlighting new/deleted/modified nodes on the canvas.

- **Decision Status:** *Maybe.*

- **Reasoning:** High implementation complexity for non-linear graph comparison. The "Raw Data Inspector" (PRD-34) provides a simpler textual diff for Version 1.

### [M-04] Metadata Timeline & Versioning

- **Description:** Field-level audit trail for every character trait change, with a "Revert" UI.

- **Decision Status:** *Maybe.*

- **Reasoning:** Adds significant database overhead. Operational audit logging (PRD-45) covers the "who changed what" question. M-04 adds content-level versioning ("what was the previous value"). Valuable, but backend logs suffice until high-volume conflicting edits become a real problem.

### [M-05] Conditional Script Nodes (Logic Branching)

- **Description:** Branching nodes in the Pipeline Canvas ("If SubjectCount > 1, use Workflow A").

- **Decision Status:** *Maybe.*

- **Reasoning:** Increases risk of non-linear "Logic Loops" and complicates progress reporting. Linear pipelines (Portrait -> Foundation -> Loop) will be stabilized first.

### [M-06] Image Variant Evolution (Latent Merging)

- **Description:** Weighted latent merging of two image variants to create a hybrid seed (e.g., blending two different clothed generations).

- **Decision Status:** *Maybe.*

- **Reasoning:** Mathematically complex to ensure valid starting points for all I2V models. Variant selection (PRD-21) handles the majority of production needs.

### [M-07] Variation Heatmaps (Parameter Grids)

- **Description:** 2D visualization grid for rapid "Sweet Spot" identification across two parameter axes.

- **Decision Status:** *Maybe.*

- **Reasoning:** Massive GPU overhead (9-25 versions per experiment). Potentially distracting for standard production workflows.

### [M-08] Remote GPU Auto-Scaling (Dynamic Orchestration)

- **Description:** Automatic cloud GPU spin-up/down (RunPod, AWS) based on queue length.

- **Decision Status:** *Maybe.*

- **Reasoning:** Cost-control risks and environment setup complexity. Manual worker registration preferred for initial rollout. Queue Management (PRD-08) provides the scheduling foundation this would build on.

### [M-09] Shadow Generation (A/B Blind Testing)

- **Description:** Silent background "Shadow Job" using experimental workflows for blind A/B comparison.

- **Decision Status:** *Maybe.*

- **Reasoning:** Doubles GPU consumption for shadowed jobs. Only economically feasible once the core pipeline is highly optimized.

### [M-10] Workflow Shadowing (Randomized Traffic)

- **Description:** Randomized production traffic redirected to experimental workflows.

- **Decision Status:** *Maybe.*

- **Reasoning:** Risks introducing inconsistency into final output.

### [M-11] Metadata Schema Builder (Dynamic Forms)

- **Description:** Drag-and-drop form builder for Admins to define required metadata keys per project.

- **Decision Status:** *Maybe.*

- **Reasoning:** High development cost for dynamic form generation. A strict, fixed "Global Schema" with optional fields is a more stable starting point.

### [M-12] Multi-Monitor & Detachable Panels

- **Description:** Pop out any panel (review player, library, node editor, metadata) into a standalone browser window. Cross-window state synchronization so actions in a detached window update the main workspace. Multi-monitor layout presets.

- **Decision Status:** *Maybe.*

- **Reasoning:** Professional studios with dual/triple monitor setups would benefit significantly — a full-screen review player on one monitor while the library and metadata panels occupy the other. However, cross-window state synchronization (SharedWorker/BroadcastChannel) adds significant frontend complexity, and most panel workflows can be served adequately by the existing modular panel system (PRD-30) within a single maximized window. Worth revisiting once the single-window experience is polished.

### [M-13] In-App Changelog & Platform Version Awareness

- **Description:** After platform updates, users see a "What's New" notification with version number, new features, and fixes. Version-aware help documentation (PRD-56 wiki articles tagged with the version they apply to). Admins see the current platform version and can check for available updates.

- **Decision Status:** *Maybe.*

- **Reasoning:** Useful for user communication and reducing support load after updates. However, for an internal studio tool with a small user base, a Slack message or team meeting covers the same ground. The version-aware documentation is the most compelling part — knowing that a help article applies to the current version — but requires tight coupling between the doc system and the release process. Consider implementing when the platform reaches a stable release cadence with external users.

### [M-14] In-Platform Light Image Editor

- **Description:** Built-in lightweight image editor for quick source image and variant adjustments: crop, brightness, contrast, saturation, white balance, and rotation. Avoids the export/re-import round-trip (PRD-21) for minor corrections.

- **Decision Status:** *Maybe.*

- **Reasoning:** High value for workflow speed — a brightness tweak shouldn't require Photoshop. However, building a reliable image editor (even a "light" one) is significant frontend effort, and scope creep toward "just add one more tool" is a real risk. The external edit loop (PRD-21) already handles the workflow; this is a convenience optimization. Consider adding when the most common external edits are analyzed and found to be simple adjustments that don't require Photoshop-level tools.

### [M-15] Color Management Pipeline

- **Description:** Studio-wide color space management: define a target color space (sRGB, Rec.709, Display P3), verify source images on upload, apply color space conversion when needed, and embed ICC profiles in deliverables. Flag color space mismatches in the compliance checker (PRD-102).

- **Decision Status:** *Maybe.*

- **Reasoning:** Color management is critical for professional VFX pipelines but adds significant complexity to every image and video processing step. Most AI generation workflows operate in sRGB implicitly, and consumer-facing delivery platforms (the current downstream target) don't require strict color management. Worth implementing when the platform serves studios with broadcast/theatrical delivery requirements where Rec.709 compliance is contractual.

---

## Appendix: PRD Cross-Reference Map

| PRD | Depends On | Depended On By |
|-----|-----------|----------------|
| PRD-00 | — | All |
| PRD-01 | PRD-00 | PRD-03, PRD-04, PRD-08, PRD-13, PRD-14, PRD-15, PRD-16, PRD-20, PRD-21, PRD-23, PRD-39, PRD-45, PRD-47, PRD-50, PRD-57, PRD-60, PRD-66, PRD-69, PRD-72 |
| PRD-02 | — | PRD-03, PRD-05, PRD-07, PRD-09, PRD-10, PRD-11, PRD-12, PRD-46 |
| PRD-03 | PRD-01, PRD-02 | PRD-04, PRD-11, PRD-12, PRD-35, PRD-45, PRD-53, PRD-55, PRD-60 |
| PRD-04 | PRD-01, PRD-03 | PRD-51 |
| PRD-05 | PRD-02 | PRD-07, PRD-24, PRD-33, PRD-34 |
| PRD-07 | PRD-02, PRD-05 | PRD-08, PRD-24, PRD-28, PRD-46 |
| PRD-08 | PRD-07 | PRD-06, PRD-46, PRD-57, PRD-61, PRD-65, M-08 |
| PRD-10 | PRD-02 | PRD-08, PRD-11, PRD-38, PRD-42, PRD-49, PRD-54, PRD-57 |
| PRD-11 | PRD-02, PRD-03, PRD-10 | PRD-38 |
| PRD-12 | PRD-02, PRD-03 | PRD-46, PRD-73, M-08 |
| PRD-14 | PRD-00, PRD-01 | PRD-13, PRD-16, PRD-66 |
| PRD-15 | PRD-01 | PRD-48, PRD-50, PRD-72 |
| PRD-17 | PRD-01 | PRD-23, PRD-64, PRD-69 |
| PRD-20 | PRD-00, PRD-01, PRD-47 | PRD-31, PRD-56, PRD-60 |
| PRD-21 | PRD-01, PRD-22 | PRD-23, PRD-24, PRD-57, PRD-58, PRD-60, PRD-67, PRD-69 |
| PRD-22 | PRD-01 | PRD-21, PRD-67 |
| PRD-23 | PRD-01, PRD-17, PRD-21 | PRD-24, PRD-57, PRD-58, PRD-63, PRD-65, PRD-67, PRD-68, PRD-71, PRD-74 |
| PRD-24 | PRD-05, PRD-07, PRD-21, PRD-23, PRD-28 | PRD-25, PRD-49, PRD-57, PRD-58, PRD-59, PRD-62, PRD-69 |
| PRD-27 | PRD-23, PRD-33 | PRD-65, PRD-74, M-01 |
| PRD-28 | PRD-07 | PRD-24, PRD-25, PRD-46, PRD-49 |
| PRD-29 | — | All frontend PRDs (PRD-30 through PRD-74) |
| PRD-35 | PRD-03 | PRD-49, PRD-55, PRD-57, PRD-68 |
| PRD-36 | PRD-29 | PRD-50, PRD-55, PRD-58, PRD-62, PRD-65, PRD-68 |
| PRD-38 | PRD-10, PRD-11 | PRD-55, PRD-70 |
| PRD-39 | PRD-01, PRD-24, PRD-35 | PRD-57, PRD-72 |
| PRD-41 | PRD-10 | PRD-61, PRD-64, PRD-73 |
| PRD-42 | PRD-10 | PRD-53, PRD-56, PRD-57, PRD-73 |
| PRD-45 | PRD-01, PRD-03 | PRD-72 |
| PRD-46 | PRD-02, PRD-07, PRD-08 | PRD-24, PRD-61, PRD-67, M-08 |
| PRD-47 | PRD-01 | PRD-20, PRD-51 |
| PRD-48 | PRD-15 | PRD-72 |
| PRD-49 | PRD-24, PRD-28, PRD-10 | PRD-35, PRD-41, PRD-64, PRD-65, PRD-71 |
| PRD-50 | PRD-01, PRD-15, PRD-36 | — |
| PRD-51 | PRD-04, PRD-47 | — |
| PRD-52 | PRD-29 | PRD-31, PRD-55 |
| PRD-53 | PRD-03, PRD-42 | — |
| PRD-54 | PRD-10 | — |
| PRD-55 | PRD-03, PRD-29, PRD-35, PRD-36, PRD-38, PRD-52 | — |
| PRD-56 | PRD-20, PRD-42 | — |
| PRD-57 | PRD-01, PRD-08, PRD-10, PRD-21, PRD-23, PRD-24, PRD-35, PRD-39, PRD-42, PRD-46 | PRD-62, PRD-67, PRD-68 |
| PRD-58 | PRD-21, PRD-23, PRD-24, PRD-36 | PRD-63 |
| PRD-59 | PRD-24, PRD-36, PRD-39 | PRD-65 |
| PRD-60 | PRD-01, PRD-03, PRD-20, PRD-21 | PRD-67 |
| PRD-61 | PRD-08, PRD-41, PRD-46, PRD-57 | PRD-67, PRD-71 |
| PRD-62 | PRD-24, PRD-36, PRD-57 | PRD-68 |
| PRD-63 | PRD-23, PRD-58 | PRD-65 |
| PRD-64 | PRD-17, PRD-41, PRD-49 | PRD-71 |
| PRD-65 | PRD-23, PRD-27, PRD-36, PRD-49, PRD-59, PRD-63, PRD-08 | — |
| PRD-66 | PRD-01, PRD-14 | PRD-67 |
| PRD-67 | PRD-21, PRD-22, PRD-23, PRD-46, PRD-57, PRD-60, PRD-61, PRD-66 | — |
| PRD-68 | PRD-23, PRD-35, PRD-36, PRD-57, PRD-62 | — |
| PRD-69 | PRD-01, PRD-17, PRD-21, PRD-24 | PRD-71 |
| PRD-70 | PRD-38, PRD-29 | — |
| PRD-71 | PRD-23, PRD-49, PRD-61, PRD-64, PRD-69 | — |
| PRD-72 | PRD-01, PRD-15, PRD-39, PRD-45, PRD-48 | — |
| PRD-73 | PRD-12, PRD-41, PRD-42, PRD-49, PRD-61 | — |
| PRD-74 | PRD-23, PRD-27 | PRD-67 |
| PRD-75 | PRD-17, PRD-23, PRD-43, PRD-46 | PRD-23, PRD-65, PRD-77 |
| PRD-76 | PRD-01, PRD-20, PRD-22 | PRD-49, PRD-79 |
| PRD-77 | PRD-09, PRD-10, PRD-75 | PRD-39, PRD-81 |
| PRD-78 | PRD-24, PRD-35 | PRD-39 |
| PRD-79 | PRD-01, PRD-20, PRD-76 | PRD-21, PRD-67 |
| PRD-80 | PRD-05, PRD-06, PRD-10, PRD-12, PRD-17, PRD-46 | PRD-81 |
| PRD-81 | PRD-00, PRD-44, PRD-74, PRD-77, PRD-80 | — |
| PRD-82 | PRD-29, PRD-35, PRD-39, PRD-52 | — |
| PRD-83 | PRD-29 | PRD-35, PRD-36, PRD-37, PRD-55, PRD-68, PRD-78, PRD-82, PRD-84 |
| PRD-84 | PRD-38, PRD-39, PRD-83 | — |
| PRD-85 | PRD-02, PRD-10, PRD-29 | PRD-89 |
| PRD-86 | PRD-01, PRD-60, PRD-66, PRD-76, PRD-79 | — |
| PRD-87 | PRD-08, PRD-46 | PRD-73 |
| PRD-88 | PRD-45, PRD-51, PRD-60, PRD-66 | — |
| PRD-89 | PRD-04, PRD-42, PRD-85 | — |
| PRD-90 | PRD-08, PRD-46, PRD-61 | PRD-89, PRD-93 |
| PRD-91 | PRD-23, PRD-49, PRD-77 | PRD-92, PRD-94 |
| PRD-92 | PRD-35, PRD-49, PRD-52, PRD-91 | — |
| PRD-93 | PRD-08, PRD-10, PRD-57, PRD-61, PRD-90 | PRD-73, PRD-97 |
| PRD-94 | PRD-49, PRD-68, PRD-76, PRD-91 | PRD-72 |
| PRD-95 | PRD-10, PRD-20, PRD-38 | — |
| PRD-96 | PRD-49, PRD-60, PRD-83 | PRD-57, PRD-68, PRD-84, PRD-89 |
| PRD-97 | PRD-08, PRD-10, PRD-12, PRD-45, PRD-57 | — |
| PRD-98 | PRD-03, PRD-10, PRD-11, PRD-45 | — |
| PRD-99 | PRD-10, PRD-12, PRD-77 | — |
| PRD-100 | PRD-23 | PRD-91, PRD-97 |
| PRD-101 | PRD-35, PRD-49, PRD-50, PRD-83 | PRD-92 |
| PRD-102 | PRD-01, PRD-23, PRD-39, PRD-59 | PRD-72 |
| PRD-103 | PRD-49, PRD-76, PRD-94, PRD-96 | PRD-72 |
| PRD-104 | PRD-17, PRD-46 | PRD-75 |
| PRD-105 | PRD-03, PRD-05, PRD-46, PRD-80, PRD-81 | — |
| PRD-106 | PRD-10, PRD-12, PRD-45 | PRD-73 |
