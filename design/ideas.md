# Image-to-Video Generation Platform Design

The **Image-to-Video Platform** (internally referred to as "X121") is a professional-grade studio orchestration tool designed to manage complex AI video production pipelines. It bridges the gap between raw AI generation (like ComfyUI) and a structured, multi-user VFX production environment.

### **Core Purpose**
The platform automates the lifecycle of video creation—starting from a single portrait (**Seed A**) and a foundation style (**Seed B**), then iteratively generating and "stitching" video segments to ensure temporal stability, likeness consistency, and professional-quality output.

### **Key Features**
*   **Bi-directional Pipeline:** Flexible starting points where you can evolve a portrait from a foundation image or vice versa.
*   **Temporal Stability Engine:** Advanced logic for "Likeness Anchoring" and "Latent Texture Sync" to prevent the flickering and "face drift" common in AI video.
*   **Node-Based Workflow Editor:** A React Flow interface for designing and debugging ComfyUI pipelines with real-time telemetry.
*   **Professional Review Suite:** High-density UI featuring a 2x2 comparison grid, "Cinema Mode" with Ambilight effects, and frame-accurate jog dials for QA.
*   **Studio Orchestration:** Manages GPU resources, monitors hardware vitals, and provides automated "auto-healing" for broken video boundaries.

### **Technical Stack**
*   **Frontend:** React (TypeScript) + Tailwind CSS + Zustand (State) + React Flow.
*   **Backend:** Rust (Axum) for high-performance async orchestration and Python (pyo3) for script integration.
*   **Database:** PostgreSQL (SQLx) with strict 3NF normalization and pgvector for visual asset searching.
*   **Processing:** ComfyUI WebSocket bridge and a multi-runtime script engine (Shell/Python/C++).

### **Unique Value Proposition**
Unlike "prompt-to-video" tools, this is a **production-first** platform. It treats AI generation as a manageable technical process with granular "undo" trees, versioned metadata for downstream VFX software (Nuke/After Effects), and intelligent disk management to keep studio servers clean while preserving high-value assets.

## Overview
A web-based platform for orchestration of a complex image-to-video generation pipeline. The system manages the lifecycle of video creation from initial portrait (Seed A) and foundation (Seed B) images, through multi-stage processing (ComfyUI & Scripts), to final review and approval.

## Technology Stack
- **Frontend:** React (TypeScript). Includes Vite, Zustand (State), React Flow (Node Editor), TanStack Query (Data Fetching), and Tailwind CSS.
- **Backend:** Rust (Axum/Actix-web) acting as the orchestration engine. Includes SQLx (PostgreSQL), Tokio (Async), and pyo3 (Python integration).
- **Database:** PostgreSQL with pgvector for visual search. Strict 3rd Normal Form normalization.
- **Processing:** ComfyUI (via WebSocket), Multi-Runtime Script Engine (Shell, Python/venv, C++).
- **Storage:** Local filesystem (primary) with Intelligent Disk Management.

## Architecture & Data Standards
### Database Normalization & Integrity
- **Perfect Normalization:** The database must adhere to 3rd Normal Form (3NF) at minimum.
- **Lookup Tables:** All statuses (Job, Approval, Worker, etc.) must be in dedicated lookup tables; no text-column state storage.
- **Relational Integrity:** Strict foreign key constraints and cascading rules to prevent metadata/file mismatches.

## Core Pipeline Architecture

### 1. Input & Preprocessing
- **Bi-directional Seed Generation:** Support for Forward (A->B), Reverse (B->A), and Manual (A+B) starting points.
- **Portrait Refinement:** Automated C++/Python scripts for symmetry and skin-texture normalization.
- **Validation:** Quality and centering checks; auto-cropping.
- **Output:** Validated "Seed Image A" and "Seed Image B".
- **Seed B Manager:** Interactive "Hero" selection from multiple variations with merging support.

### 2. Video Generation & Temporal Stitching
- **Stitching Modes:** Strict Last-Frame (Simple) and Validated Continuity (Advanced/Smoothing using SSIM/pHash).
- **Incremental Re-stitching:** Regenerate a single segment and "auto-heal" boundaries without a full re-render.
- **Elastic Duration:** System chooses the most stable stopping point within a duration range.
- **Transition Normalization:** Automated re-centering/resizing between segments to prevent "subject drift."
- **Latent Texture Sync:** Propagation of seeds for consistent grain and texture.
- **Likeness Anchoring:** Constant low-weight injection of Seed Image A throughout the loop to prevent face-drift.
- **Regeneration Logic:** Granular controls to "Redo" individual segments, scenes, or batches.

## Execution Engine (The "Orchestrator")
- **Parallel Task Processing:** Robust multitasking engine for concurrent jobs and UI navigation.
- **Workflow Health Heartbeat:** Pre-run validation of LoRAs and nodes.
- **Workflow Dependency Auto-Installer:** Automated detection/installation of missing ComfyUI custom nodes (git/pip).
- **Plugin Architecture:** Specialized API for "UI Extensions" via `plugin.json`.
- **Interactive Debugger:** Ability to "Step Into" running jobs, view intermediate latents, and tweak parameters mid-execution.
- **Warm-Start Caching:** Prevents redundant processing of shared nodes by caching intermediate states.
- **Failure Handling:** Direct notification system for execution errors (no silent retries).

## Data Management & Storage
- **File Preservation Policy:** Original source portraits (Seed A) and foundation images (Seed B) are permanent.
- **Deferred Disk Reclamation:** Manual or policy-driven cleanup of "supporting_files" post-approval.
- **Downstream Metadata Registration:** Primary entry point for character and video metadata; schema validation for external pipelines.
- **Intelligent Disk Management:** Retention policies and Cold Storage (Metadata Only) mode for archived projects.
- **Disk Space Visualizer:** Treemap/sunburst chart for storage usage.
- **Conflict Management:** UI for resolving mismatches between physical `.json` files and the database.
- **Asset Dependency Graph:** Visual mapping of LoRA/Model dependencies to prevent accidental deletions.

## User Management & Collaboration
- **Authentication & Profiles:** Secure JWT-based auth with per-user settings and state persistence.
- **Creator Rights:** Creators authorized for "Final Approval" (moving assets to `final/`).
- **Role-Based Access Control (RBAC):** Admin, Creator, Reviewer roles.
- **Director's View:** Simplified, touch-optimized mobile/tablet interface for remote review.
- **Integrated Studio Wiki:** Contextual "View Studio Docs" right-click actions on assets/nodes.
- **Conflict Resolution:** Real-time presence indicators and segment locking.
- **Activity Feed & Mentions:** Real-time "Studio Pulse" stream with `@mentions` deep-linking directly to specific video frames.

## Post-Generation & Hand-off
- **Scene Assembler:** Bulk concatenation of "Final" videos with technical headers and master metadata.
- **Dataset Generator:** One-click tool to package character frames for model fine-tuning.
- **VFX Sidecar Export:** Automated technical metadata (XML/CSV) for Nuke/After Effects.
- **External Pulse Dashboard:** High-level scene completion tracking for external managers.

## System Integrity & Administration
- **Context-Aware Bulk Importer:** Drag-and-drop import using folder paths for naming (Jane/Bio/img.jpg -> Jane); uniqueness determined by full relative path.
- **Unified Service Control:** Status bar UI for monitoring/restarting core services (Rust, ComfyUI, DB, Workers).
- **Model Integrity Scanner:** Automated link-checking and "Bulk Re-Pathing" utility for moved assets.
- **Exportable App Configuration:** One-click portable backup of studio logic (Workflows, Scripts, DB Schemas).

## Design System & UI/UX
- **Token-Based Theming:** JSON-driven tokens (Obsidian/Neon) supporting Dark and Light modes.
- **Modern Industrial Aesthetic:** High-density modular panels and crisp typography (Inter/JetBrains Mono).
- **Command Palette (Cmd+K):** Global search and command interface for navigation and bulk actions.
- **Keyboard Shortcut Presets:** Selectable keymaps (Premiere, Resolve, Avid).
- **Advanced UX Patterns:** Progressive Disclosure, Non-Linear History, Focus Mode, and Smart Drag-and-Drop (glow-highlight targets).
- **Micro-Interactions & QoL:** Hover Metadata Peeking (Alt+Hover), Smart Range Selection (with duration calc), Reference Image Lock, Focus Peaking, and Color-Coded Timelines.

## UI Requirements
- **Workflow Editor:** Node-based canvas with Dynamic Parameter Mapping and real-time telemetry.
- **Library Viewer:** Visual Search, Timeline Scrubbing, Spreadsheet Mode, Metadata Search & Replace, and Pinning/Favorites.
- **Review Interface:** 
    - **Sync-Play Grid:** Simultaneous playback of multiple re-rolls.
    - **Jog Dial & Frame-Stepping:** Precise 1:1 playback controls.
    - **Reference Segment Pinning:** Compare likeness/consistency with pinned segments.
    - **Voice Memos:** Timestamped audio-annotation.
    - **Audio Scrubbing (Vinyl Mode):** Auditory feedback during scrubbing.
    - **Region-of-Interest Looping:** User-defined zoom windows.
    - **One-Handed Review Shortcuts:** Optimized hotkeys (1, 2, 3).
    - **Cinema Mode:** Immersive player with "Ambilight" edge-glow.
    - **Transition Ghosting:** 50% opacity overlay for boundary inspection.
    - **Pro-Grade Annotation:** On-frame drawing tools.
    - **Comparison View:** Side-by-side and split-screen Project Comparison Mode.
- **Power User Features:** Secret/Env Manager, Raw Data Inspector, Hardware Direct Control, One-Click Bug Reporting, and Unified Log Stream.

## Performance & Monitoring
- **Benchmarking Dashboard:** Performance reports (time per frame, VRAM peaks, aesthetic scores).
- **Performance Nerve Center:** Real-time monitoring of GPU vitals and worker bottlenecks.
- **Cost Tracking:** Per-project GPU spend and budget alerts.
- **Studio Pulse Dashboard:** Customizable widgets (Active Tasks, Recently Approved, Disk Health, Project Progress).

## Evaluation List (The "MAYBE" List)

### [M-01] Hero Asset Propagation
- **Description:** Bulk application of winning settings (LoRA/Prompt) to all other scenes for a character.
- **Reasoning:** High value for consistency but requires complex "Inheritance vs. Override" logic to avoid breaking custom scenes.

### [M-02] Bulk Metadata Enrichment (AI Scanning)
- **Description:** Automated metadata population via VLM models (detecting eye color, etc.).
- **Reasoning:** Risk of AI hallucinations; manual control prioritized for downstream DB integrity.

### [M-03] Visual Workflow Diff
- **Description:** Graph-based comparison of ComfyUI JSON versions.
- **Reasoning:** High implementation complexity for Version 1.

### [M-04] Metadata Timeline (Versioning)
- **Description:** Audit trail of every trait change over time.
- **Reasoning:** Significant DB overhead; backend logs suffice for initial rollout.

### [M-05] Conditional Script Nodes (Logic Gates)
- **Description:** Branching workflow logic (If/Then/Else).
- **Reasoning:** Standard linear pipelines prioritized for stability.

### [M-06] Seed Image B Evolution (Merging/Interpolation)
- **Description:** Creating hybrid foundations from two parents.
- **Reasoning:** Creative/experimental; "Hero Selection" handles most production needs.

### [M-07] Variation Heatmaps
- **Description:** 2D visual plotting of parameter experiments.
- **Reasoning:** High GPU overhead; potentially distracting for standard production.

### [M-08] Remote GPU Auto-Scaling
- **Description:** Dynamic RunPod/AWS spinning based on queue.
- **Reasoning:** Safer to use manual registration for initial worker rollout.

### [M-09] Shadow Generation (A/B Blind Testing)
- **Description:** Silent background generation of experimental versions for comparison.
- **Reasoning:** Doubles GPU consumption per shadowed job.

### [M-10] Workflow Shadowing
- **Description:** Randomized production traffic redirected to experimental workflows.
- **Reasoning:** Risks introducing inconsistency into final output.

### [M-11] Metadata Schema Builder
- **Description:** UI for defining required keys per project.
- **Reasoning:** A fixed "Global Schema" is more stable for initial development.
