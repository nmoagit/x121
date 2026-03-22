# PRD-140: Character to Avatar Rename

## 1. Introduction / Overview

The platform currently uses inconsistent terminology for its primary content entity: "character" in the backend/database and "model" in the frontend UI. This PRD unifies all references to **"avatar"** across the entire stack — database tables, backend code, API endpoints, frontend components, routes, labels, and tooltips. Zero tolerance for legacy naming.

## 2. Related PRDs & Dependencies

### Depends On
- All existing PRDs that created character-related infrastructure (PRD-01, PRD-112, PRD-113, etc.)

### Extends
- Every feature that references characters or models

## 3. Goals

1. **Database**: All tables, columns, and constraints renamed from `character*` to `avatar*`
2. **Backend**: All Rust types, functions, modules, routes renamed from `character*` to `avatar*`
3. **API**: All endpoint paths renamed from `/characters/` to `/avatars/`
4. **Frontend**: All components, hooks, types, routes, labels renamed — "model" and "character" both become "avatar"
5. **Zero legacy references**: No remaining `character` or `model` (in avatar context) in the codebase

## 4. User Stories

- **As a user**, I want consistent terminology ("Avatar") throughout the entire platform.

## 5. Functional Requirements

### Phase 1: Database Migration

#### Requirement 1.1: Rename all character tables to avatar

**Acceptance Criteria:**
- [ ] 19 tables renamed via ALTER TABLE RENAME
- [ ] All `character_id` FK columns renamed to `avatar_id`
- [ ] All indexes renamed
- [ ] All triggers renamed
- [ ] Rollback migration provided

### Phase 2: Backend Rename

#### Requirement 2.1: Rename all backend code

**Acceptance Criteria:**
- [ ] All model files renamed and types updated (Character → Avatar)
- [ ] All repo files renamed and functions updated (CharacterRepo → AvatarRepo)
- [ ] All handler files renamed and functions updated
- [ ] All route files renamed and paths updated (/characters → /avatars)
- [ ] Core crate references updated
- [ ] Pipeline crate references updated
- [ ] `cargo check` passes

### Phase 3: Frontend Rename

#### Requirement 3.1: Rename all frontend code

**Acceptance Criteria:**
- [ ] All "character" references in types, hooks, components → "avatar"
- [ ] All "model" references (meaning character) in labels, tooltips → "Avatar"
- [ ] Route paths updated (/models, /characters → /avatars)
- [ ] URL parameters renamed (characterId → avatarId)
- [ ] Feature directory renamed (characters/ → avatars/)
- [ ] `npx tsc --noEmit` passes

## 6. Non-Goals

- Renaming the git repo
- Renaming Rust crate package names (x121-api, x121-core, etc.)
- Changing the database name

## 7. Technical Considerations

### Risk Mitigation
- Database rename via single migration with all ALTER TABLE RENAME statements
- Backend: file renames + sed-like find-and-replace, then fix compilation errors
- Frontend: directory rename + find-and-replace, then fix TypeScript errors
- Each phase committed separately for easy rollback

### Scope
- ~19 database tables
- ~200+ code files
- ~50 API endpoints
- ~100 frontend components/hooks

## 8. Version History

- **v1.0** (2026-03-22): Initial PRD creation
