# PRD-137: Output Format Profile Management

## 1. Introduction/Overview

Output format profiles define how video deliverables are encoded for export (resolution, codec, container, bitrate, framerate). Currently, profiles are managed inline within the project Delivery tab with no concept of a platform-wide default. This creates friction: admins must remember profile names, projects don't auto-select sensible defaults, and there's no centralized place to manage profiles across the platform.

This PRD introduces a dedicated admin page for output format profile CRUD, a default profile mechanism (platform-level with project-level override), and seed profiles for common configurations.

## 2. Related PRDs & Dependencies

- **Depends on:** PRD-039 (Scene Assembler & Delivery Packaging) — profiles table and CRUD API already exist
- **Depends on:** PRD-110 (Platform Settings) — project-level override uses existing settings infrastructure
- **Extends:** PRD-112 (Project Hub) — project Delivery tab ExportPanel auto-selects default

## 3. Goals

1. Centralize output format profile management in a single admin page
2. Allow admins to designate one profile as the platform-wide default
3. Allow projects to override the platform default with a project-specific default
4. Auto-select the appropriate default in the ExportPanel to reduce friction
5. Seed common profiles on migration so the system is usable out of the box

## 4. User Stories

- As an **admin**, I want to manage all output format profiles from one page so I don't have to navigate into individual projects.
- As an **admin**, I want to set a default profile so that new exports use a sensible format without manual selection.
- As a **project manager**, I want my project to use a different default profile than the platform default so I can tailor exports to client requirements.
- As a **user starting an export**, I want the format dropdown to auto-select the right default so I can start exports faster.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Admin Output Format Profiles Page

**Description:** A new admin page at `/admin/output-profiles` that lists all output format profiles and provides full CRUD operations.

**Acceptance Criteria:**
- [ ] Page is accessible at `/admin/output-profiles` behind `AdminGuard`
- [ ] Page is listed in admin navigation
- [ ] Displays all profiles in a table with columns: name, resolution, codec, container, bitrate, framerate, default badge
- [ ] Create button opens inline form with fields: name, resolution, codec, container, bitrate_kbps, framerate
- [ ] Edit button on each row opens inline form pre-filled with current values
- [ ] Delete button with confirmation removes the profile
- [ ] Reuses existing `useOutputFormatProfiles`, `useCreateProfile`, `useUpdateProfile`, `useDeleteProfile` hooks

#### Requirement 1.2: Default Profile Flag

**Description:** Add an `is_default` column to the `output_format_profiles` table. Only one profile can be the default at any time.

**Acceptance Criteria:**
- [ ] Migration adds `is_default BOOLEAN NOT NULL DEFAULT false` to `output_format_profiles`
- [ ] Unique partial index ensures at most one row has `is_default = true`
- [ ] Backend model (`OutputFormatProfile`) includes `is_default: bool`
- [ ] Frontend type (`OutputFormatProfile`) includes `is_default: boolean`
- [ ] Setting a profile as default clears the flag on the previous default (single transaction)
- [ ] API: `PUT /output-format-profiles/{id}/set-default` endpoint (or handled via existing update)

#### Requirement 1.3: Admin UI Default Selection

**Description:** The admin page allows setting and clearing the default profile.

**Acceptance Criteria:**
- [ ] Each profile row shows a "Default" badge if `is_default` is true
- [ ] A "Set as Default" action is available on non-default profiles
- [ ] The current default profile is visually distinct (badge, highlight, or star icon)
- [ ] Only one profile can be default — setting a new default clears the old one automatically

#### Requirement 1.4: Project-Level Default Override

**Description:** Projects can override the platform default with a project-specific default profile.

**Acceptance Criteria:**
- [ ] `projects` table gets a `default_format_profile_id BIGINT REFERENCES output_format_profiles(id)` column (nullable)
- [ ] Project Settings tab includes a "Default Output Profile" dropdown showing all profiles plus "Use platform default"
- [ ] When set, the project's default takes precedence over the platform default in ExportPanel
- [ ] When cleared (set to null), the project falls back to the platform default

#### Requirement 1.5: ExportPanel Auto-Selection

**Description:** The ExportPanel dropdown auto-selects the appropriate default profile.

**Acceptance Criteria:**
- [ ] On load, ExportPanel selects the project-level default if set
- [ ] Falls back to the platform default (`is_default = true`) if no project override
- [ ] Falls back to the first profile alphabetically if no default exists at all
- [ ] User can still manually change the selection

#### Requirement 1.6: Seed Profiles Migration

**Description:** The migration seeds common output format profiles so the system works out of the box.

**Acceptance Criteria:**
- [ ] Seeds at least: "1080p H.264" (1920x1080, h264, mp4, 8000 kbps, 30fps), "720p H.264" (1280x720, h264, mp4, 5000 kbps, 30fps), "4K H.264" (3840x2160, h264, mp4, 20000 kbps, 30fps)
- [ ] "1080p H.264" is seeded as the default (`is_default = true`)
- [ ] Seed is idempotent (uses `ON CONFLICT DO NOTHING` or checks existence)

#### Requirement 1.7: Remove FormatProfileManager from Project Delivery Tab

**Description:** Profile management moves to admin; the project Delivery tab only shows the export workflow.

**Acceptance Criteria:**
- [ ] `FormatProfileManager` component removed from `ProjectDeliveryTab`
- [ ] Project Delivery tab retains: ValidationReport, ExportPanel, DeliveryDestinationManager, status table, logs, export history
- [ ] ExportPanel profile dropdown still shows all available profiles for selection

## 6. Non-Goals (Out of Scope)

- Per-user profile preferences
- Profile versioning or history
- Profile import/export between instances
- Codec-specific advanced settings (CRF, preset, tune) — `extra_ffmpeg_args` covers this already
- Usage statistics per profile

## 7. Design Considerations

- **Admin page layout:** Follow existing admin page patterns (e.g. `/admin/api-keys`, `/admin/settings`) — table with inline create/edit forms
- **Default badge:** Use existing `Badge` component with `variant="info"` and text "Default"
- **Project settings integration:** Add the profile dropdown to the existing Project Settings tab (`ProjectConfigTab`)
- **Navigation:** Add "Output Profiles" to the admin navigation section

## 8. Technical Considerations

### Existing Code to Reuse
- `FormatProfileManager` component — adapt for admin page (currently in `features/delivery/`)
- `useOutputFormatProfiles`, `useCreateProfile`, `useUpdateProfile`, `useDeleteProfile` hooks
- Backend CRUD handlers in `delivery.rs` — already fully functional
- `OutputFormatProfileRepo` — has `create`, `find_by_id`, `list_all`, `update`, `delete`
- Admin route pattern and `AdminGuard` from `router.tsx`

### New Infrastructure Needed
- Admin page component at `app/pages/OutputProfilesPage.tsx`
- Admin navigation entry
- `set_default` repo method (clear old + set new in transaction)
- Project settings UI addition for default profile dropdown

### Database Changes
- Migration: `ALTER TABLE output_format_profiles ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false`
- Migration: `CREATE UNIQUE INDEX uq_output_format_profiles_default ON output_format_profiles (is_default) WHERE is_default = true`
- Migration: `ALTER TABLE projects ADD COLUMN default_format_profile_id BIGINT REFERENCES output_format_profiles(id) ON DELETE SET NULL`
- Migration: Seed 3 standard profiles with "1080p H.264" as default

### API Changes
- `PUT /output-format-profiles/{id}/set-default` — new endpoint to set default (clears previous)
- `GET /output-format-profiles` — response now includes `is_default` field
- `GET /projects/{id}` — response now includes `default_format_profile_id`
- `PUT /projects/{id}` — accepts `default_format_profile_id` for update

## 9. Success Metrics

- Admin can manage all profiles from `/admin/output-profiles` without navigating to project pages
- ExportPanel auto-selects the correct default on load (platform or project-level)
- New installations have usable seed profiles immediately
- Zero manual profile selection needed for standard 1080p exports

## 10. Open Questions

None — all questions resolved during PRD creation.

## 11. Version History

- **v1.0** (2026-03-19): Initial PRD creation
