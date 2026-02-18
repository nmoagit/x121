# Image-to-Video Platform: Master Specification (Granular)

This document is the final architectural blueprint. It is divided into granular, PRD-ready modules.

---

## Part 0: Architecture & Data Standards

### [PRD-00] Database Normalization & Strict Integrity
- **Standard:** 3rd Normal Form (3NF) minimum.
- **Lookup Tables:** All statuses (Job, Approval, Worker, Role) must reside in dedicated tables. No text-column state storage.
- **Relational Integrity:** Cascading rules and strict foreign keys to prevent metadata or file-to-DB mismatches.
- **Decision:** Essential for a professional studio tool to prevent "Data Drift" and ensure 100% reliable technical hand-offs.

---

## Part 1: Infrastructure & System Core

### [PRD-01] Backend Foundation (Rust/Axum)
- **Stack:** Axum, SQLx (PostgreSQL), Tokio.
- **Role:** High-performance async orchestration and WebSocket management.

### [PRD-02] User Identity & RBAC
- **Features:** JWT Auth, Admin/Creator/Reviewer roles.
- **Decision:** Creators have "Final Approval" rights to maintain production speed while allowing Reviewers to focus on QA.

### [PRD-03] Session & Workspace Persistence
- **Features:** DB-backed storage of UI state (open files, zoom, undo tree).
- **Decision:** Professional users must be able to log out and return to the exact same visual state.

### [PRD-04] ComfyUI WebSocket Bridge
- **Features:** Real-time state syncing between Rust and ComfyUI.
- **Decision:** Enables the "Interactive Debugger" and real-time progress bars.

### [PRD-05] Hardware Monitoring & Direct Control
- **Features:** GPU Vitals (VRAM/Temp) + "One-Click Restart" for hanging services.
- **Decision:** Reduces downtime by allowing Admins to fix GPU issues without terminal access.

### [PRD-06] Parallel Task Execution Engine
- **Features:** Background job queue allowing UI multitasking.
- **Decision:** Users shouldn't be "locked" by a 30-second render; they can set up the next job in parallel.

### [PRD-07] Multi-Runtime Script Orchestrator
- **Features:** Managed execution of Shell, Python (venv), and C++ binaries.
- **Decision:** Allows the studio to use custom optimized code alongside AI workflows.

---

## Part 2: Data & Storage Management

### [PRD-08] Dual-Metadata System (JSON)
- **Features:** Automated generation of `character_metadata` and `video_metadata` JSON files.
- **Decision:** Required for registration and downstream consumption by future VFX/3D pipelines.

### [PRD-09] Intelligent & Deferred Disk Reclamation
- **Features:** Manual and policy-driven "Deferred Cleanup" of supporting files.
- **Decision:** Protects Seed A/B permanently but prevents the server from filling with "failed" re-rolls.

### [PRD-10] Folder-to-Entity Bulk Importer
- **Features:** Drag-and-drop import using folder paths for naming (Jane/Bio -> Jane).
- **Decision:** Logic handles path-uniqueness (Jane/Bio vs Bob/Bio) to prevent accidental merging.

### [PRD-11] Asset Registry & Dependency Mapping
- **Features:** Versioned Model/LoRA tracking + "Where is this used?" dependency graph.
- **Decision:** Prevents accidental deletion of a LoRA that is currently needed for an active project.

### [PRD-12] Bulk Data Maintenance (Search/Replace/Re-path)
- **Features:** Global find/replace for metadata and "Bulk Re-Pathing" for moved asset libraries.
- **Decision:** Minimizes manual admin work during library reorganizations or drive migrations.

### [PRD-13] Disk Space Visualizer (Treemap)
- **Features:** Sunburst/Treemap chart of storage usage by project/scene.
- **Decision:** Provides instant visibility into which scenes are hogging space.

---

## Part 3: Generation & Pipeline Core

### [PRD-14] Bi-directional Seed Management (A <-> B)
- **Features:** Forward (A->B), Reverse (B->A), and Manual (A+B) input support.
- **Decision:** Provides flexibility for both Portrait-led and Foundation-led creative starting points.

### [PRD-15] Portrait Pre-processing & Refinement
- **Features:** Automated skin/symmetry normalization scripts.
- **Decision:** High-quality base seeds lead to more stable video generation later.

### [PRD-16] Seed B Variation & Hero Selection
- **Features:** UI for generating foundation variations and picking the "Hero" foundation.
- **Decision:** Ensures the "Foundation" is approved before expensive video segments are run.

### [PRD-17] Recursive Video Generation Loop
- **Features:** $V_1...V_n$ generation with "Elastic Duration" (seeking stable end-frames).
- **Decision:** Delivers precise durations without "hard cuts" or "motion pops" at the end.

### [PRD-18] Incremental Re-stitching & Smoothing
- **Features:** Targeted regeneration of 1 segment with boundary "auto-healing."
- **Decision:** Saves massive GPU time by not re-rendering the whole video for one mistake.

### [PRD-19] Temporal Continuity (Normalization & Sync)
- **Features:** Subject re-centering, Latent Texture Sync, and Likeness Anchoring (Seed A).
- **Decision:** Eliminates "subject drift" and grain flickering over long video durations.

---

## Part 4: Design System & UX Patterns

### [PRD-20] Token-Based Design System
- **Features:** JSON theme tokens for Obsidian/Neon theme + Dark/Light mode.
- **Decision:** Allows instant branding updates and ensures consistency across 50+ PRDs.

### [PRD-21] Modular Layout & Panel Management
- **Features:** Blender-style snappable/resizable panels.
- **Decision:** Maximizes screen real estate for different roles (Reviewer vs. Creator).

### [PRD-22] Command Palette & Navigation (Cmd+K)
- **Features:** Global search and command interface.
- **Decision:** Essential for power users to jump between projects and trigger bulk actions instantly.

### [PRD-23] Progressive Disclosure & UX Intelligence
- **Features:** "Power Knobs" vs. Advanced Drawers; Focus Mode; Non-Linear History.
- **Decision:** Prevents information overload while keeping deep technical control accessible.

---

## Part 5: Workflow Editor & Review

### [PRD-24] Node-Based Workflow Canvas
- **Features:** React Flow integration + Node-level timing telemetry.
- **Decision:** Provides high-level visibility into where the GPU time is actually being spent.

### [PRD-25] Interactive Debugger (Mid-Run Control)
- **Features:** Pause/Resume jobs, tweak parameters mid-run, and view intermediate latents.
- **Decision:** Allows "surgical" fixes during generation rather than waiting for failure.

### [PRD-26] One-Key Approval & Finalization Flow
- **Features:** Single-hotkey (`Enter`) asset finalization.
- **Decision:** Maximizes review speed for lead editors.

### [PRD-27] Cinema Mode & Sync-Play Grid
- **Features:** Borderless player with "Ambilight" glow + 2x2 comparison grid.
- **Decision:** Provides an immersive, distraction-free environment for final likeness checks.

### [PRD-28] QA Visual Aids (Ghosting, ROI, Jog Dial)
- **Features:** 50% opacity overlays, zoomed looping windows, and frame-stepping dial.
- **Decision:** Professional-grade tools for detecting micro-artifacts (jitter, pops).

### [PRD-29] Collaborative Review (Notes, Memos, Issues)
- **Features:** Timestamped notes, Voice Memos, and Failure Tagging (Face Melt/Jitter).
- **Decision:** Failure tags provide data for future model/audit-script training.

---

## Part 6: Production & Hand-off

### [PRD-30] Scene Assembler & Delivery
- **Features:** Bulk concatenation of "Final" clips into Master Scenes with technical headers.
- **Decision:** Automates the final stage of "finishing" a scene for hand-off.

### [PRD-31] VFX Sidecar & Dataset Export
- **Features:** Automated XML/CSV technical data generation + One-click training dataset zip.
- **Decision:** Bridges the gap between AI generation and professional VFX/Training pipelines.

### [PRD-32] Performance & Benchmarking Dashboard
- **Features:** Reports on time-per-frame, VRAM peaks, and Likeness Scores.
- **Decision:** Helps Admins identify "expensive" or "low-quality" workflows.

### [PRD-33] Studio Pulse Dashboard
- **Features:** Customizable widgets for Active Tasks, Disk Health, and Project Progress.
- **Decision:** The "Command Center" for the whole studio to see real-time activity.

---

## Part 7: Maintenance & Admin

### [PRD-34] System Integrity & Repair Tools
- **Features:** Model Integrity Scanner + Missing Node Auto-Installer.
- **Decision:** Simplifies the setup of new workers and maintains a "Healthy" asset library.

### [PRD-35] Bug Reporting & App Config Export
- **Features:** One-click session recording for bugs + Portable App-Config export.
- **Decision:** Ensures the Admin can debug UI issues and back up the studio's entire logic.

---

## Part 8: Evaluation List (The "MAYBE" List)



### [M-01] Hero Asset Propagation (Global Template Sync)

- **Description:** A mechanism to select a "Winning" configuration (Workflow ID, LoRA weights, CFG, Prompt structure) from a single successful segment and propagate it as a "Template" across all other scenes for that character.

- **Decision Status:** *Maybe.*

- **Reasoning:** While high value for consistency, it introduces complex state-management issues. If a specific scene requires a "Night" lighting tweak, a global sync could accidentally overwrite those local overrides. Requires a sophisticated "Inheritance vs. Override" UI.



### [M-02] Bulk Metadata Enrichment (AI VLM Scanning)

- **Description:** Using Vision-Language Models (VLMs) like LLaVA or specialized tagging models to automatically scan portraits/videos and populate `character_metadata` fields (e.g., eye color, hair texture, clothing type).

- **Decision Status:** *Maybe.*

- **Reasoning:** Risk of AI hallucinations in metadata. Since this metadata is for downstream consumption (VFX/3D), 100% accuracy is required. Manual "Human-in-the-loop" verification is prioritized for Phase 1.



### [M-03] Visual Workflow Diff (Graph Comparison)

- **Description:** A specialized UI tool for the Workflow Editor that compares two ComfyUI JSON versions. It visually highlights new nodes (Green), deleted nodes (Red), and modified parameters (Yellow) directly on the canvas.

- **Decision Status:** *Maybe.*

- **Reasoning:** High implementation complexity for non-linear graph comparison. While useful for debugging, the "Raw Data Inspector" (PRD-25) provides a simpler textual way to see changes in Version 1.



### [M-04] Metadata Timeline & Versioning

- **Description:** A complete audit log for every field in the character database. Includes a horizontal timeline in the UI allowing users to see a "History of Changes" and click "Revert" to restore a previous state (e.g., "Revert eye color to Brown").

- **Decision Status:** *Maybe.*

- **Reasoning:** Adds significant database overhead (storing every change event). Manual audit logs in the backend are sufficient until a studio reaches a high volume of conflicting metadata edits.



### [M-05] Conditional Script Nodes (Logic Branching)

- **Description:** Introduction of "Branching" nodes in the Pipeline Canvas (e.g., "If SubjectCount > 1, use Workflow A; else use Workflow B").

- **Decision Status:** *Maybe.*

- **Reasoning:** Increases the risk of non-linear "Logic Loops" and makes progress reporting much more complex. We will stabilize strictly linear pipelines (Portrait -> Foundation -> Loop) before introducing branching.



### [M-06] Seed Image B Evolution (Latent Merging)

- **Description:** An advanced foundation tool where a user picks two Seed B variations and runs a specialized C++ or Python script to perform a "Latent Merge" or "Weighted Average," creating a custom hybrid starting point.

- **Decision Status:** *Maybe.*

- **Reasoning:** High experimental value, but mathematically complex to ensure the resulting hybrid latent is still a valid starting point for all I2V models. "Hero Selection" (PRD-16) handles the majority of production needs.



### [M-07] Variation Heatmaps (Parameter Grids)

- **Description:** A 2D visualization grid where the X-axis represents one parameter (e.g., Prompt Strength) and the Y-axis another (e.g., LoRA Weight). The grid displays thumbnails of the results for rapid "Sweet Spot" identification.

- **Decision Status:** *Maybe.*

- **Reasoning:** Massive GPU overhead (requires generating 9-25 versions for a single experiment). Potentially distracting for standard production workflows where "Known Good" recipes are used.



### [M-08] Remote GPU Auto-Scaling (Dynamic Orchestration)

- **Description:** Integration with cloud provider APIs (RunPod, AWS, Modal) to automatically spin up/down worker nodes based on real-time queue length in the "Studio Pulse."

- **Decision Status:** *Maybe.*

- **Reasoning:** Essential for high-scale operations but introduces cost-control risks (preventing "runaway" billing) and environment setup complexity. Manual worker registration is preferred for the initial rollout.



### [M-09] Shadow Generation (A/B Blind Testing)

- **Description:** The system silently triggers a "Shadow Job" for a small percentage of production tasks using an experimental workflow. Results are presented side-by-side in the Review UI for blind A/B testing.

- **Decision Status:** *Maybe.*

- **Reasoning:** Consumes double the GPU resources for shadowed jobs. Provides excellent data but is only economically feasible once the core pipeline is highly optimized.



### [M-10] Workflow Shadowing (Randomized Traffic)

- **Description:** Similar to A/B testing, but actually "Swapping" the production workflow for a randomized percentage of the load to test stability in the real world.

- **Decision Status:** *Maybe.*

- **Reasoning:** Risks introducing inconsistency into the final output. Manual "Comparison Mode" (PRD-12) is a safer way to validate new techniques.



### [M-11] Metadata Schema Builder (Dynamic Forms)

- **Description:** A drag-and-drop form builder for Admins to define "Required" keys per project (e.g., Project A needs "Faction," Project B needs "Costume ID").

- **Decision Status:** *Maybe.*

- **Reasoning:** High development cost for dynamic form generation. A strict, fixed "Global Schema" with optional fields is a more stable starting point for development.
