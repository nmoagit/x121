# Extra Work & Architectural Deviation Analysis

This report documents the significant features, architectural shifts, and UX refinements implemented in the Trulience platform that expanded upon or deviated from the initial 132 PRDs.

## 1. Architectural & Infrastructure Extensions
*   **4-Level Inheritance Hierarchy:** While PRD-111 and PRD-112 scoped a 3-level settings merge (Catalogue → Project → Character), the implementation introduced a **"Group"** layer. This layer sits between Project and Character, allowing settings, prompt fragments, and video configurations to be applied to batches of characters simultaneously.
*   **Unified Cloud & ComfyUI Orchestration:** This went beyond PRD-114 and PRD-130 by fully automating the lifecycle from pod provisioning to SSH startup and WebSocket registration. The "PodOrchestrator" was unified with the database-driven provider registry, eliminating manual configuration steps previously required.
*   **Universal Soft Delete:** Implemented a pervasive `deleted_at` pattern across all major tables (projects, characters, scenes, etc.), ensuring data recovery and auditability that exceeded the original "Trash" scope in PRD-109.

## 2. Generation Pipeline Enhancements
*   **Scene Type Track Configuration:** Introduced `scene_type_track_configs` to allow different workflows and prompt templates for each track (e.g., "clothed" vs. "topless") within a single scene concept. This added a layer of granularity not detailed in PRD-023 or PRD-111.
*   **7-Layer Prompt Resolution Engine:** The resolution logic was expanded to include a complex fallback chain: Workflow Default → Scene Type Default → Full Text Override (Project/Group/Character) → Placeholder Substitution → Fragments (Project → Group → Character).
*   **Artifact Storage System:** Implemented first-class support for intermediate pipeline outputs via `scene_video_version_artifact`. This allows the storage and UI display of "rough cuts" or preview passes leading up to the final video (PRD-127 extension).

## 3. Data & Ingest Refinements
*   **Enhanced Import Validation ("Xena/Anna" Check):** Added client-side logic to extract character name hints from filenames during drag-and-drop. The system now warns users if a dropped file (e.g., `anna_clothed.png`) doesn't match the target character (e.g., "Xena") per PRD-126.
*   **Deliverable Ignore System:** Implemented a persistent "ignore" state for missing deliverables. This allows PMs to clean up readiness reports by marking specific missing items as "intentionally skipped" for certain characters.
*   **Unicode/UTF-8 Stabilization:** Fixed critical encoding bugs in bulk metadata uploads, ensuring full support for non-Latin characters (CJK, Cyrillic, etc.) and handling Byte Order Marks (BOM) in JSON files.

## 4. UI & UX Polish
*   **Terminology Shift:** A platform-wide refactor renamed "Catalog" to **"Catalogue"** (UK spelling) across all frontend features, including the Scene Catalogue, Widget Catalogue, and Configuration IO (Commit `a3e69fa`).
*   **Breadcrumb Auto-Scroll:** Implemented intelligent navigation where clicking a group name in a breadcrumb not only navigates to the project page but also automatically scrolls to and expands that specific group section.
*   **Design Demos:** Added a suite of "Design Demo" pages (`FileListDemoPage.tsx`, etc.) and a "Design Demos" sidebar group to allow developers to preview UI components in isolation.
*   **Header Consolidation:** Refactored the Character Detail page to eliminate redundant "Overview" cards, merging all vital status info (Avatar, Readiness, Embedding Status) into a single, high-density header.

## Summary of Impact
This extra work has shifted the platform from a "flat" character-management tool toward a **hierarchical production workstation**. The addition of the Group layer and the sophisticated artifact handling system provides the operational depth required for large-scale studio productions that the original PRDs only touched upon.
