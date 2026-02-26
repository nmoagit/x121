# PRD-110: Admin Platform Settings Panel

## 1. Introduction/Overview

Platform configuration is currently managed through environment variables in `.env` files, requiring server restarts and direct filesystem access to change settings like `DATA_DIR`, `STORAGE_ROOT`, `COMFYUI_WS_URL`, JWT expiry times, and CORS origins. This is fragile, opaque, and inaccessible to non-technical admins.

The Admin Platform Settings Panel provides a web UI where admins can view, edit, and persist platform-wide settings in the database. Environment variables serve as initial defaults — once a setting is saved via the UI, the database value takes precedence. Settings are organized into logical categories (Storage, ComfyUI, Authentication, System) and include validation, audit logging, and safe-restart hints when changes require a process restart to take effect.

## 2. Related PRDs & Dependencies

- **Depends on:** PRD-00 (Data Model — core schema with `set_updated_at` trigger), PRD-02 (Auth — admin role, JWT middleware)
- **Extends:** PRD-44 (Config Export — exports/imports config snapshots; the settings panel provides live editing of individual values)
- **Related:** PRD-48 (External Storage — `STORAGE_ROOT` / `DATA_DIR` settings), PRD-74 (Project Config Templates — per-project config; this PRD is platform-wide)
- **Part:** Admin & Infrastructure

## 3. Goals

- Allow admins to view and edit all platform settings through the web UI without touching `.env` files.
- Persist settings in the database with env vars as fallback defaults.
- Organize settings into logical categories with clear labels and descriptions.
- Validate setting values before saving (type, format, range).
- Show which settings differ from their env-var defaults.
- Flag settings that require a server restart to take effect.
- Provide an audit trail of setting changes (who, when, old value, new value).

## 4. User Stories

- As an Admin, I want to change `DATA_DIR` from the web UI so that I don't need SSH access or a restart to point storage at a new volume.
- As an Admin, I want to see all platform settings in one place, organized by category, so that I can understand the current configuration at a glance.
- As an Admin, I want to know which settings have been overridden from their defaults so that I can tell what was customized.
- As an Admin, I want validation feedback when I enter an invalid value (e.g., a malformed URL for `COMFYUI_WS_URL`) so that I don't break the system.
- As an Admin, I want to see a warning when a setting requires a restart to take effect so that I know the change isn't immediate.
- As an Admin, I want to see who last changed a setting and when, so that I can audit configuration changes.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Settings Database Table
**Description:** A `platform_settings` table persists all admin-configured settings as key-value pairs with metadata.

**Acceptance Criteria:**
- [ ] Table `platform_settings` with columns: `id BIGSERIAL PK`, `key TEXT UNIQUE NOT NULL`, `value TEXT NOT NULL`, `category TEXT NOT NULL`, `updated_by BIGINT REFERENCES users(id)`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- [ ] `set_updated_at` trigger applied
- [ ] Unique index on `key`
- [ ] Index on `category` for filtered queries

#### Requirement 1.2: Settings Registry (Backend)
**Description:** A Rust registry that defines all known settings with their metadata: key, category, label, description, data type, default value source (env var name), validation rules, and whether a restart is required.

**Acceptance Criteria:**
- [ ] Registry defined as a static data structure in `x121_core`
- [ ] Each entry specifies: `key`, `category`, `label`, `description`, `value_type` (string, url, path, integer, boolean, duration, comma-separated list), `env_var` (the env var this falls back to), `default_value` (hardcoded fallback), `requires_restart` (bool), `sensitive` (bool — masks display), `validation` (optional regex or range)
- [ ] Registry covers at minimum: `DATA_DIR`, `STORAGE_ROOT`, `COMFYUI_WS_URL`, `HOST`, `PORT`, `CORS_ORIGINS`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `RUST_LOG`
- [ ] `JWT_SECRET` is explicitly excluded from the registry (env-only, see Non-Goals)
- [ ] Categories: `storage`, `comfyui`, `authentication`, `system`

#### Requirement 1.3: Settings Resolution Logic
**Description:** When the application reads a setting, it checks the database first, then falls back to the env var, then to the hardcoded default.

**Acceptance Criteria:**
- [ ] `SettingsService` in `x121_core` provides `get(key) -> Option<String>` that checks DB → env → default
- [ ] Settings are cached in memory with a configurable TTL (default 60s) to avoid per-request DB queries
- [ ] Cache can be invalidated explicitly (e.g., after an admin saves a new value)
- [ ] Existing code that reads `std::env::var("DATA_DIR")` etc. is migrated to use `SettingsService`

#### Requirement 1.4: Admin API Endpoints
**Description:** RESTful endpoints for listing, reading, and updating platform settings. Admin-only.

**Acceptance Criteria:**
- [ ] `GET /api/v1/admin/settings` — returns all settings grouped by category; each entry includes `key`, `category`, `label`, `description`, `value` (current resolved value), `source` ("database" | "env" | "default"), `value_type`, `requires_restart`, `sensitive` (value masked if true), `updated_at`, `updated_by`
- [ ] `GET /api/v1/admin/settings/:key` — returns a single setting with full detail
- [ ] `PATCH /api/v1/admin/settings/:key` — updates the value; body: `{ "value": "..." }`; validates against registry rules; returns updated setting; records audit log entry
- [ ] `DELETE /api/v1/admin/settings/:key` — resets to default (deletes the DB row so env/default takes over); returns the setting with `source` updated
- [ ] All endpoints require `RequireAdmin` middleware
- [ ] Standard API envelope: `{ data: ... }` / `{ error: ... }`

#### Requirement 1.5: Settings Panel UI
**Description:** A React page in the admin section showing all settings organized by category tabs or sections.

**Acceptance Criteria:**
- [ ] Page accessible at `/admin/settings` in the app shell
- [ ] Navigation item added to Admin group in sidebar
- [ ] Settings grouped by category with tab navigation or collapsible sections
- [ ] Each setting displays: label, description, current value (editable input), source badge ("Database", "Env Default", "Default"), and a "restart required" warning icon if applicable
- [ ] Sensitive settings (e.g., `JWT_SECRET`) show masked value with a reveal toggle
- [ ] Inline edit: clicking a value field enters edit mode; Save/Cancel buttons appear
- [ ] Validation feedback shown inline on invalid values
- [ ] "Reset to Default" button per setting that calls `DELETE` endpoint
- [ ] Success/error toast notifications on save
- [ ] Loading states and error handling

#### Requirement 1.6: Persistent Restart Banner
**Description:** When one or more settings flagged `requires_restart` are changed, a persistent banner appears at the top of the settings page listing the affected settings and advising the admin to restart.

**Acceptance Criteria:**
- [ ] Banner appears immediately after saving a restart-required setting
- [ ] Banner lists all settings with pending restarts (there may be multiple)
- [ ] Banner persists across page navigations within the settings panel (stored in server state or fetched via API)
- [ ] Banner is dismissible but reappears on next visit if restart has not occurred
- [ ] Banner automatically clears after the server restarts (detected via a boot timestamp comparison)
- [ ] `GET /api/v1/admin/settings` response includes a `pending_restart` boolean and `pending_restart_keys` array

#### Requirement 1.7: Connection Test for URL Settings
**Description:** URL-type settings (e.g., `COMFYUI_WS_URL`) have a "Test Connection" button that verifies connectivity from the backend.

**Acceptance Criteria:**
- [ ] "Test" button rendered next to settings with `value_type` of `url` or `ws_url`
- [ ] `POST /api/v1/admin/settings/:key/actions/test` — backend attempts a connection (HTTP HEAD for URLs, WebSocket handshake for WS URLs) with a 5-second timeout
- [ ] Returns `{ data: { reachable: true/false, latency_ms: number, error?: string } }`
- [ ] UI shows success (green check + latency) or failure (red X + error message) inline next to the setting
- [ ] Test can be run on the current saved value or on a not-yet-saved draft value (passed in request body)
- [ ] Admin-only endpoint

#### Requirement 1.8: Audit Trail for Setting Changes
**Description:** Every setting change is recorded for accountability.

**Acceptance Criteria:**
- [ ] Each `PATCH` or `DELETE` on a setting creates an entry in the existing `audit_logs` table (from PRD-55) with: `action` = "setting_updated" or "setting_reset", `entity_type` = "platform_setting", `entity_id` = setting key, `changes` JSONB containing `{ old_value, new_value }`, `user_id` from auth
- [ ] Sensitive setting values are redacted in audit logs (`"***"` instead of actual value)
- [ ] Audit entries visible in the existing Audit Log Viewer (PRD-55)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Settings Diff / History View
**Description:** A per-setting history view showing all past values with timestamps and who changed them, rendered as a timeline.

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Bulk Import/Export Integration
**Description:** Integration with PRD-44 (Config Export) to allow exporting/importing settings as part of the config snapshot, enabling environment cloning.

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** Restart Trigger
**Description:** For settings flagged `requires_restart`, provide a "Restart Server" button that triggers a graceful restart via a management endpoint.

## 6. Non-Goals (Out of Scope)

- **Per-project settings** — This PRD covers platform-wide settings only. Per-project configuration is handled by PRD-74.
- **User-level preferences** — User preferences (theme, sidebar state, etc.) are managed client-side or in user profile settings, not here.
- **`DATABASE_URL` editing** — The database connection string cannot be edited through the UI (chicken-and-egg: the app needs the DB to read the setting).
- **Real-time setting propagation to worker nodes** — Workers read their own config; this PRD covers the API server settings only.
- **`JWT_SECRET` editing** — `JWT_SECRET` is env-only and not editable through the UI. Changing it invalidates all active sessions, making it too dangerous for casual UI editing. It does not appear in the settings panel at all.
- **Secrets management integration** — No Vault/KMS integration in MVP. Sensitive values are stored as plaintext in the DB (same security posture as `.env` files).

## 7. Design Considerations

- **UI Layout:** Follow the existing admin page pattern (e.g., `HardwareDashboard`, `AuditLogViewer`) — page header with icon, description, then content area.
- **Category Tabs:** Use existing `Tabs` composite component if available, or horizontal pill/badge-style tabs matching the design system.
- **Setting Row:** Each setting renders as a card or table row with: icon for category, label (bold), description (muted), value input, source badge, action buttons.
- **Reuse:** Leverage existing `Card`, `Badge`, `Input`, `Button`, `Spinner`, `toast` from the design system. Use `useForm` (React Hook Form) for inline editing with Zod validation.
- **Responsive:** Single-column on mobile, table-style layout on desktop.

## 8. Technical Considerations

### Existing Code to Reuse
- **`RequireAdmin` middleware** — Admin-only endpoint protection
- **`AppState`** — Shared application state (add `SettingsService` to it)
- **`DataResponse` / `AppError`** — Standard API response types
- **`audit_logs` table** (PRD-55) — Audit logging infrastructure
- **`config_export` handlers** (PRD-44) — Related admin config endpoints
- **Design system primitives** — `Card`, `Badge`, `Input`, `Button`, `Tabs`, `Spinner`, `toast`
- **`useAuthStore`** — Role checking for admin access
- **TanStack Query hooks pattern** — `useQuery` / `useMutation` with `queryClient.invalidateQueries`

### New Infrastructure Needed
- `platform_settings` migration
- `x121_core::settings` module — registry definition, `SettingsService` with cache
- `x121_db::repositories::PlatformSettingRepo` — CRUD for `platform_settings` table
- `apps/backend/crates/api/src/handlers/platform_settings.rs` — API handlers
- `apps/frontend/src/features/settings/` — Settings panel feature module (components, hooks, types)
- Route and nav entry at `/admin/settings`

### Database Changes
- New table: `platform_settings` (see Requirement 1.1)
- No changes to existing tables

### API Changes
- New endpoints: `GET/PATCH/DELETE /api/v1/admin/settings[/:key]` (Req 1.4), `POST /api/v1/admin/settings/:key/actions/test` (Req 1.7)
- No changes to existing endpoints

### MVP Implementation
- Settings stored as `TEXT` in DB — the backend parses to the correct type using the registry's `value_type`
- In-memory cache using `tokio::sync::RwLock<HashMap<String, CachedSetting>>` with TTL
- Existing `std::env::var()` calls migrated incrementally (not all at once — start with `DATA_DIR`, `STORAGE_ROOT`, `COMFYUI_WS_URL`)

### Post-MVP Enhancements
- Redis-backed cache for multi-instance deployments
- WebSocket push for real-time setting updates across browser tabs

## 9. Success Metrics

- Admin can change `DATA_DIR` through the UI and the system uses the new value without editing `.env`.
- All platform settings are visible in one organized panel.
- Invalid values are rejected with clear error messages.
- Setting changes appear in the audit log.
- No regressions in existing functionality that reads env vars.

## 10. Open Questions

All questions resolved — see v1.1 notes.

## 11. Version History

- **v1.0** (2026-02-24): Initial PRD creation
- **v1.1** (2026-02-24): Resolved open questions — (1) persistent restart banner (Req 1.6), (2) connection test moved to MVP (Req 1.7), (3) JWT_SECRET excluded from settings (env-only, added to Non-Goals)
