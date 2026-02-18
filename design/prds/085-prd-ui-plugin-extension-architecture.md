# PRD-085: UI Plugin / Extension Architecture

## 1. Introduction/Overview
PRD-77 provides pipeline-level extensibility (backend hooks). This PRD provides UI-level extensibility: a defined API for studio-built or third-party UI extensions that add custom panels, context menu actions, and metadata renderers without modifying core platform code. Studios have unique visualization needs and proprietary integrations (ShotGrid, ftrack) that the core platform cannot anticipate. A plugin system lets studios self-serve their UI requirements while the core platform stays focused on the universal workflow.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation), PRD-10 (Event Bus for event subscription), PRD-29 (Design System for consistent styling)
- **Depended on by:** PRD-89 (Dashboard Widget Customization)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Define an extension manifest format for declaring capabilities, permissions, and registered components.
- Support panel registration, menu item injection, and custom metadata renderers.
- Provide a sandboxed Extension API for read/write access to platform data.
- Enable hot reload during development and stable loading in production.

## 4. User Stories
- As an Admin, I want to install a ShotGrid integration extension so that our asset management workflow is seamlessly connected to this platform.
- As a Creator, I want a custom "Color Grading Preview" panel added by our studio's extension so that I can see how our LUT affects segments without leaving the platform.
- As an Admin, I want to review extension permissions before activation so that I understand what data each extension can access.
- As a Creator, I want custom context menu items on characters so that I can trigger studio-specific workflows (e.g., "Export to ShotGrid") with a right-click.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Extension Manifest
**Description:** Each extension is described by a `plugin.json` manifest.
**Acceptance Criteria:**
- [ ] Manifest declares: name, version, author, required API version, permissions, and registered components
- [ ] Permissions specify which data the extension can read/write
- [ ] Manifest validation runs on install — rejects invalid manifests with clear errors
- [ ] Version compatibility checking ensures extensions match the platform API version

#### Requirement 1.2: Panel Registration
**Description:** Extensions can register custom panels alongside native panels.
**Acceptance Criteria:**
- [ ] Registered panels appear in the panel management system (PRD-30)
- [ ] Panels render within a sandboxed iframe or shadow DOM
- [ ] Panels can be resized, moved, and hidden like native panels
- [ ] Panels receive platform context (current project, character, scene)

#### Requirement 1.3: Menu Item Injection
**Description:** Extensions can add context menu items to entities.
**Acceptance Criteria:**
- [ ] Menu items can be added to character, scene, and segment context menus
- [ ] Items are labeled and grouped under the extension name
- [ ] Clicking a menu item triggers the extension's registered handler
- [ ] Menu items respect the extension's declared permissions

#### Requirement 1.4: Custom Metadata Renderers
**Description:** Override default display of specific metadata fields.
**Acceptance Criteria:**
- [ ] Extensions can register renderers for specific metadata field names or types
- [ ] Custom renderers replace the default display in metadata views
- [ ] Renderers are sandboxed to prevent XSS
- [ ] Fallback to default rendering if the extension's renderer fails

#### Requirement 1.5: Extension API
**Description:** Sandboxed JavaScript API for platform data access.
**Acceptance Criteria:**
- [ ] API provides read/write access to projects, characters, scenes, segments, and metadata
- [ ] Access is scoped by the extension's declared permissions
- [ ] Event subscription allows reacting to platform events (PRD-10)
- [ ] API is versioned to allow backward compatibility

#### Requirement 1.6: Extension Manager
**Description:** Admin UI for installing, enabling/disabling, and configuring extensions.
**Acceptance Criteria:**
- [ ] Install extensions from a local file or URL
- [ ] Enable/disable extensions without uninstalling
- [ ] Per-extension settings UI generated from the manifest
- [ ] Permission review before activation

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Hot Reload for Development
**Description:** Extensions reload without a full platform restart during development.
**Acceptance Criteria:**
- [ ] File watcher detects changes to extension source files
- [ ] Extension reloads in place without losing platform state

## 6. Non-Goals (Out of Scope)
- Pipeline-level hooks/extensibility (covered by PRD-77)
- Backend plugin system (this is UI-only)
- Extension marketplace or distribution system

## 7. Design Considerations
- Extension panels should be visually consistent with native panels (using PRD-29 design tokens).
- The extension manager should be a clear, admin-accessible settings section.
- Permission descriptions should be human-readable: "This extension can read character metadata and write tags."

## 8. Technical Considerations
- **Stack:** React for panel rendering, iframe/shadow DOM for sandboxing, message passing for Extension API
- **Existing Code to Reuse:** PRD-29 design tokens, PRD-30 panel management
- **New Infrastructure Needed:** Extension loader, manifest parser, sandbox runtime, Extension API bridge
- **Database Changes:** `extensions` table (id, name, version, manifest, enabled, settings)
- **API Changes:** CRUD /admin/extensions, internal message passing API for extension communication

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Extension installation completes in <10 seconds
- Extension panels render within 500ms of activation
- Sandboxing prevents extensions from accessing data outside their declared permissions
- Production extensions load without errors on 99.9% of platform starts

## 11. Open Questions
- Should extensions use iframe isolation or shadow DOM (security vs. performance tradeoff)?
- What is the maximum number of concurrent extensions the system should support?
- Should extension API calls count against rate limiting?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
