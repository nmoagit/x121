# Task List: UI Plugin / Extension Architecture

**PRD Reference:** `design/prds/085-prd-ui-plugin-extension-architecture.md`
**Scope:** Build a defined API for studio-built or third-party UI extensions that add custom panels, context menu actions, and metadata renderers without modifying core platform code.

## Overview

PRD-77 provides pipeline-level extensibility via backend hooks. This PRD provides UI-level extensibility: a plugin system that lets studios add custom panels, inject context menu items, and override metadata renderers. Extensions declare their capabilities and permissions in a `plugin.json` manifest, render within sandboxed iframes or shadow DOM, and communicate with the platform via a versioned Extension API. An Extension Manager lets admins install, enable/disable, and configure extensions.

### What Already Exists
- PRD-02 Backend Foundation
- PRD-10 Event Bus for event subscription
- PRD-29 Design System for consistent styling
- PRD-30 Panel Management System

### What We're Building
1. Database table for installed extensions
2. Extension manifest parser and validator
3. Sandboxed panel rendering (iframe/shadow DOM)
4. Context menu injection system
5. Custom metadata renderer registration
6. Versioned Extension API with permission scoping
7. Extension Manager admin UI
8. API endpoints for extension management

### Key Design Decisions
1. **iframe sandboxing** -- Extensions render in iframes for security isolation. The Extension API uses `postMessage` for communication.
2. **Manifest-driven** -- All extension capabilities declared in `plugin.json`. No runtime capability discovery.
3. **Permission-scoped API** -- Extensions can only access data their manifest declares. Violations are blocked at the API bridge.
4. **Design tokens for consistency** -- Extensions receive platform design tokens (colors, fonts, spacing) to match the native look.

---

## Phase 1: Database Schema

### Task 1.1: Extensions Table
**File:** `migrations/YYYYMMDDHHMMSS_create_extensions.sql`

```sql
CREATE TABLE extensions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    author TEXT,
    description TEXT,
    manifest_json JSONB NOT NULL,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT false,
    source_path TEXT NOT NULL,         -- file path or URL to extension bundle
    api_version TEXT NOT NULL,         -- required platform API version
    installed_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_extensions_name ON extensions(name);
CREATE INDEX idx_extensions_installed_by ON extensions(installed_by);
CREATE INDEX idx_extensions_enabled ON extensions(enabled) WHERE enabled = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON extensions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique name constraint prevents duplicate installations
- [ ] Manifest stored as JSONB for querying
- [ ] Settings per extension for runtime configuration
- [ ] `enabled` flag with partial index for fast active-extension queries

---

## Phase 2: Rust Backend

### Task 2.1: Manifest Parser & Validator
**File:** `src/services/extension_manifest.rs`

```rust
pub struct ExtensionManifest {
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub api_version: String,
    pub permissions: Vec<Permission>,
    pub panels: Vec<PanelRegistration>,
    pub menu_items: Vec<MenuItemRegistration>,
    pub metadata_renderers: Vec<MetadataRendererRegistration>,
    pub settings_schema: Option<serde_json::Value>,
}

pub struct Permission {
    pub resource: String,              // "projects", "characters", "scenes", "metadata"
    pub access: String,                // "read", "write"
}
```

**Acceptance Criteria:**
- [ ] Parses `plugin.json` manifest format
- [ ] Validates required fields (name, version, api_version)
- [ ] Validates permission declarations against known resources
- [ ] Checks API version compatibility with current platform
- [ ] Rejects invalid manifests with clear error messages

### Task 2.2: Extension Loader
**File:** `src/services/extension_loader.rs`

Load extension bundles from local files or URLs.

**Acceptance Criteria:**
- [ ] Loads extension from a local file path (ZIP containing plugin.json + bundle)
- [ ] Loads extension from a URL (downloads and installs)
- [ ] Validates bundle structure: plugin.json required, entry point JS file
- [ ] Stores bundle files in a managed directory

### Task 2.3: Permission Enforcement
**File:** `src/services/extension_permissions.rs`

Enforce permission scoping for Extension API calls.

**Acceptance Criteria:**
- [ ] Each API call from an extension includes the extension ID
- [ ] Permission check verifies the extension has declared access to the requested resource
- [ ] Read vs. write access enforced separately
- [ ] Violations return 403 with descriptive message
- [ ] Violations logged for admin review

### Task 2.4: Extension API Bridge (Backend)
**File:** `src/routes/extension_api.rs`

Backend endpoints that extension iframes call via the API bridge.

```
GET  /extension-api/projects           -- Read projects (scoped by permission)
GET  /extension-api/characters/:id     -- Read character data
POST /extension-api/metadata/:entity_type/:id -- Write metadata
POST /extension-api/events/subscribe   -- Subscribe to events
```

**Acceptance Criteria:**
- [ ] All routes require extension authentication (extension ID + session token)
- [ ] Permission enforcement on every request
- [ ] Response format matches the Extension API specification
- [ ] API versioned to allow backward compatibility
- [ ] Event subscription relays PRD-10 events to the extension

---

## Phase 3: API Endpoints

### Task 3.1: Extension Management Routes
**File:** `src/routes/extensions.rs`

```
GET    /admin/extensions               -- List installed extensions
POST   /admin/extensions               -- Install a new extension
PUT    /admin/extensions/:id           -- Update extension settings
DELETE /admin/extensions/:id           -- Uninstall extension
POST   /admin/extensions/:id/enable    -- Enable extension
POST   /admin/extensions/:id/disable   -- Disable extension
```

**Acceptance Criteria:**
- [ ] Install validates manifest and checks API compatibility
- [ ] Enable/disable without uninstalling
- [ ] Update settings applies per-extension configuration
- [ ] Uninstall removes extension files and database record
- [ ] Admin-only access

### Task 3.2: Extension Registry Route
**File:** `src/routes/extensions.rs`

```
GET /extensions/registry               -- Active extensions and their registrations
```

**Acceptance Criteria:**
- [ ] Returns all enabled extensions with their registered panels, menu items, renderers
- [ ] Called by the frontend on startup to configure extension integration
- [ ] Cached for performance (invalidated on extension enable/disable)

---

## Phase 4: React Frontend -- Extension Runtime

### Task 4.1: Extension Sandbox Container
**File:** `frontend/src/components/extensions/ExtensionSandbox.tsx`

Iframe-based sandbox for rendering extension panels.

```tsx
interface ExtensionSandboxProps {
    extensionId: string;
    entryPoint: string;
    context: PlatformContext;
    permissions: Permission[];
}
```

**Acceptance Criteria:**
- [ ] Renders extension in an iframe with `sandbox` attribute
- [ ] Passes platform context (current project, character, scene) via postMessage
- [ ] Passes design tokens (colors, fonts) for consistent styling
- [ ] Handles iframe communication errors gracefully

### Task 4.2: Extension API Client (Frontend Bridge)
**File:** `frontend/src/services/extensionApiBridge.ts`

Client-side bridge that handles postMessage communication between iframes and the platform.

```typescript
class ExtensionApiBridge {
    private iframe: HTMLIFrameElement;
    private extensionId: string;

    handleMessage(event: MessageEvent) {
        // Validate origin
        // Route API calls to backend via fetch
        // Return results to iframe via postMessage
    }
}
```

**Acceptance Criteria:**
- [ ] Validates message origin to prevent cross-origin attacks
- [ ] Routes API calls from iframe to backend Extension API endpoints
- [ ] Enforces permission scoping on the client side (defense in depth)
- [ ] Handles event subscription and delivery

### Task 4.3: Panel Registration Integration
**File:** `frontend/src/components/extensions/ExtensionPanelIntegration.tsx`

Register extension panels in the PRD-30 panel management system.

**Acceptance Criteria:**
- [ ] Extension panels appear alongside native panels
- [ ] Panels are resizable, movable, and hideable like native panels
- [ ] Panel receives platform context (current project/character/scene)
- [ ] Fallback: if extension fails to load, show error state

### Task 4.4: Context Menu Injection
**File:** `frontend/src/components/extensions/ContextMenuInjection.tsx`

Inject extension menu items into entity context menus.

**Acceptance Criteria:**
- [ ] Extension items added to character, scene, segment context menus
- [ ] Items grouped under the extension name
- [ ] Click triggers the extension's registered handler
- [ ] Items respect declared permissions (hidden if permission not granted)

### Task 4.5: Custom Metadata Renderer
**File:** `frontend/src/components/extensions/MetadataRendererOverride.tsx`

Allow extensions to override default metadata field display.

**Acceptance Criteria:**
- [ ] Extensions register renderers for specific metadata field names
- [ ] Custom renderers replace default display in metadata views
- [ ] Rendered in iframe for sandboxing (prevents XSS)
- [ ] Fallback to default rendering on error

### Task 4.6: Extension Manager UI
**File:** `frontend/src/pages/ExtensionManager.tsx`

Admin page for managing extensions.

**Acceptance Criteria:**
- [ ] List installed extensions with name, version, status (enabled/disabled)
- [ ] Install from file upload or URL
- [ ] Permission review before enabling
- [ ] Per-extension settings form (auto-generated from settings_schema)
- [ ] Enable/disable toggle
- [ ] Uninstall with confirmation

---

## Phase 5: Testing

### Task 5.1: Manifest Validation Tests
**File:** `tests/extension_manifest_test.rs`

**Acceptance Criteria:**
- [ ] Test valid manifest parses correctly
- [ ] Test missing required fields are rejected
- [ ] Test invalid permissions are rejected
- [ ] Test API version incompatibility is detected

### Task 5.2: Permission Enforcement Tests
**File:** `tests/extension_permissions_test.rs`

**Acceptance Criteria:**
- [ ] Test extension can access declared resources
- [ ] Test extension cannot access undeclared resources
- [ ] Test read-only permission blocks write operations
- [ ] Test violations are logged

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_extensions.sql` | Extension storage table |
| `src/services/extension_manifest.rs` | Manifest parser and validator |
| `src/services/extension_loader.rs` | Extension bundle loader |
| `src/services/extension_permissions.rs` | Permission enforcement |
| `src/routes/extension_api.rs` | Extension API bridge endpoints |
| `src/routes/extensions.rs` | Extension management API |
| `frontend/src/components/extensions/ExtensionSandbox.tsx` | Iframe sandbox |
| `frontend/src/services/extensionApiBridge.ts` | PostMessage bridge |
| `frontend/src/components/extensions/ExtensionPanelIntegration.tsx` | Panel registration |
| `frontend/src/components/extensions/ContextMenuInjection.tsx` | Menu injection |
| `frontend/src/components/extensions/MetadataRendererOverride.tsx` | Custom renderers |
| `frontend/src/pages/ExtensionManager.tsx` | Admin management UI |

## Dependencies

### Upstream PRDs
- PRD-02: Backend Foundation, PRD-10: Event Bus, PRD-29: Design System

### Downstream PRDs
- PRD-89: Dashboard Widget Customization (extension widgets)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)
4. Phase 4: React Frontend (Tasks 4.1-4.6)

**MVP Success Criteria:**
- Extension installation completes in <10 seconds
- Extension panels render within 500ms of activation
- Sandboxing prevents unauthorized data access
- Production extensions load without errors on 99.9% of starts

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.2)
2. Hot reload for development (PRD Requirement 2.1)

## Notes

1. **Iframe vs. Shadow DOM** -- The open question about iframe vs. shadow DOM: start with iframe for maximum security isolation. Shadow DOM can be considered for performance-sensitive extensions later.
2. **Extension bundle format** -- ZIP containing: `plugin.json` (manifest), `index.js` (entry point), and any static assets. Keep bundles small (<5MB).
3. **Design token delivery** -- Pass CSS custom properties to the iframe via a style injection. Extensions use `var(--trulience-primary-color)` etc.
4. **Rate limiting** -- Extension API calls should be rate-limited per extension to prevent abuse. Default: 100 requests/minute.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-085
