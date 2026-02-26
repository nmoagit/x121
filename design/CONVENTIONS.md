# X121 — Conventions & Technical Standards

Binding decisions for all implementation work. Read this before writing any code.

---

## 1. Repository Structure

```
x121/
├── Makefile                  # Convenience commands (make build, make dev, etc.)
├── .editorconfig             # Editor settings
│
├── apps/
│   ├── backend/              # Rust workspace
│   │   ├── Cargo.toml        # Workspace root
│   │   ├── Cargo.lock
│   │   ├── .cargo/config.toml
│   │   ├── rustfmt.toml
│   │   ├── clippy.toml
│   │   ├── rust-toolchain.toml
│   │   └── crates/
│   │       ├── api/          # HTTP server (Axum) — binary
│   │       ├── core/         # Domain types, business logic — library
│   │       ├── db/           # Database layer (SQLx, queries) — library
│   │       ├── events/       # Event bus — library
│   │       ├── pipeline/     # Video generation pipeline — library
│   │       ├── comfyui/      # ComfyUI WebSocket client — library
│   │       └── worker/       # GPU worker node — binary
│   │
│   ├── frontend/             # React frontend
│   │   ├── package.json
│   │   ├── pnpm-lock.yaml
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── app/          # App shell, routing, providers
│   │       ├── components/   # Shared UI components (design system)
│   │       │   ├── primitives/   # Button, Input, Select, etc.
│   │       │   ├── composite/    # Card, Modal, Table, etc.
│   │       │   ├── layout/       # Stack, Grid, Panel, etc.
│   │       │   └── domain/       # StatusBadge, ThumbnailCard, etc.
│   │       ├── features/     # Feature modules (1 per PRD or feature area)
│   │       │   ├── projects/
│   │       │   ├── characters/
│   │       │   ├── scenes/
│   │       │   ├── generation/
│   │       │   ├── review/
│   │       │   ├── dashboard/
│   │       │   └── admin/
│   │       ├── hooks/        # Shared custom hooks
│   │       ├── stores/       # Zustand stores
│   │       ├── lib/          # Utilities, API client, constants
│   │       └── tokens/       # Design tokens (CSS custom properties)
│   │
│   └── db/
│       └── migrations/       # SQL migrations (sqlx-cli format)
│
├── design/                   # Design documentation
├── scripts/                  # Dev & deployment scripts
└── docker/                   # Docker configs
```

### Rules

- Rust crates live in `apps/backend/crates/`. Never create Rust code outside this directory.
- Frontend code lives in `apps/frontend/`. Never create React code outside this directory.
- SQL migrations live in `apps/db/migrations/`.
- Feature modules in `apps/frontend/src/features/` are self-contained: each has its own components, hooks, and types. Shared code goes in the parent directories (`components/`, `hooks/`, `lib/`).
- No circular dependencies between crates. Dependency direction: `api` → `core`, `db`, `events`, `pipeline` → `comfyui`. Never the reverse.
- Use `make <target>` from the repo root for common commands (see `Makefile`).

---

## 2. Tech Stack

### Backend

| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| Language | Rust | Edition 2024 | Via `rust-toolchain.toml` |
| HTTP framework | Axum | 0.8.x | Latest stable |
| Async runtime | Tokio | 1.x | Full features |
| Database driver | SQLx | 0.8.x | Compile-time checked queries preferred |
| Serialization | serde + serde_json | 1.x | Derive macros everywhere |
| Error handling | thiserror | 2.x | For library crates |
| Logging | tracing + tracing-subscriber | 0.1.x | Structured logging |
| HTTP middleware | tower + tower-http | 0.5.x | CORS, compression, tracing |
| UUID | uuid | 1.x | v7 for time-sortable IDs |
| Date/time | chrono | 0.4.x | With serde feature |
| Validation | validator | 0.18.x | Derive-based request validation |
| Config | config | 0.14.x | Layered config (file + env) |
| Password hashing | argon2 | 0.5.x | For auth |
| JWT | jsonwebtoken | 9.x | For auth tokens |
| Vector similarity | pgvector | 0.4.x | For embeddings (PRD-20, PRD-76) |

### Frontend

| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| Framework | React | 19.x | Latest stable |
| Language | TypeScript | 5.x | Strict mode |
| Bundler | Vite | 6.x | With SWC |
| Styling | Tailwind CSS | 4.x | Using CSS custom properties for tokens |
| State management | Zustand | 5.x | Minimal, no boilerplate |
| Data fetching | TanStack Query | 5.x | Caching, invalidation, optimistic updates |
| Routing | TanStack Router | 1.x | Type-safe routing |
| Forms | React Hook Form + Zod | Latest | Validation via Zod schemas |
| Icons | Lucide React | Latest | Consistent icon set |
| Component docs | Storybook | 8.x | For design system |
| Linting | ESLint + Biome | Latest | Biome for formatting |

### Infrastructure

| Component | Choice | Notes |
|-----------|--------|-------|
| Database | PostgreSQL | 16+ with pgvector extension |
| Package manager | pnpm | For frontend workspace |
| Container | Docker Compose | Local dev environment |
| CI | GitHub Actions | Lint, test, build |

---

## 3. Rust Conventions

### Module Organization (per crate)

```
apps/backend/crates/api/src/
├── main.rs               # Entry point, server startup
├── lib.rs                # Public API of the crate
├── config.rs             # Configuration struct
├── routes/               # Route definitions (one file per resource)
│   ├── mod.rs
│   ├── projects.rs
│   ├── characters.rs
│   └── health.rs
├── handlers/             # Request handlers (one file per resource)
│   ├── mod.rs
│   ├── projects.rs
│   └── characters.rs
├── middleware/            # Tower middleware
│   ├── mod.rs
│   ├── auth.rs
│   └── request_id.rs
└── extractors/           # Custom Axum extractors
    ├── mod.rs
    └── auth.rs
```

### Naming

| Item | Convention | Example |
|------|-----------|---------|
| Crate names | `snake_case` | `x121_core` |
| Module files | `snake_case.rs` | `character_metadata.rs` |
| Structs | `PascalCase` | `Character`, `SceneType` |
| Enums | `PascalCase` with `PascalCase` variants | `JobStatus::InProgress` |
| Functions | `snake_case` | `find_by_project_id` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS` |
| Type aliases | `PascalCase` | `type DbId = i64;` |
| Trait names | `PascalCase`, adjective or verb | `Validatable`, `Renderable` |

### Types

```rust
/// All database IDs are i64 (PostgreSQL BIGSERIAL).
pub type DbId = i64;

/// All timestamps are UTC.
pub type Timestamp = chrono::DateTime<chrono::Utc>;
```

### Error Handling

Every crate defines its own error type using `thiserror`. The `api` crate maps all errors to HTTP responses.

```rust
// apps/backend/crates/core/src/error.rs
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("Entity not found: {entity} with id {id}")]
    NotFound { entity: &'static str, id: DbId },

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),
}

// apps/backend/crates/api/src/errors.rs — maps CoreError → HTTP response
impl IntoResponse for CoreError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            CoreError::NotFound { .. } => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            CoreError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR"),
            CoreError::Conflict(_) => (StatusCode::CONFLICT, "CONFLICT"),
            CoreError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
            CoreError::Forbidden(_) => (StatusCode::FORBIDDEN, "FORBIDDEN"),
        };
        (status, Json(ErrorResponse { code, message: self.to_string() })).into_response()
    }
}
```

### Handler Pattern

All handlers follow the same structure:

```rust
pub async fn list_characters(
    State(db): State<DbPool>,
    Query(params): Query<ListParams>,
    auth: AuthUser,                         // custom extractor
) -> Result<Json<ApiResponse<Vec<Character>>>, CoreError> {
    let characters = CharacterRepo::list(&db, &params).await?;
    Ok(Json(ApiResponse::ok(characters)))
}
```

### Testing

```rust
// Unit tests: same file, bottom
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_character_validation() { ... }
}

// Integration tests: apps/backend/crates/api/tests/
// Use a shared test harness with a real test database
#[tokio::test]
async fn test_create_character_endpoint() {
    let app = test_app().await;  // spins up test DB + server
    let resp = app.post("/api/v1/characters").json(&body).await;
    assert_eq!(resp.status(), 201);
}
```

### Imports

```rust
// Group imports in this order, separated by blank lines:
// 1. std
// 2. External crates
// 3. Workspace crates
// 4. Current crate modules

use std::sync::Arc;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use x121_core::types::DbId;
use x121_db::repos::CharacterRepo;

use crate::extractors::AuthUser;
```

---

## 4. Database Conventions

### Naming

| Item | Convention | Example |
|------|-----------|---------|
| Tables | `snake_case`, **plural** | `characters`, `scene_types`, `video_segments` |
| Columns | `snake_case` | `created_at`, `scene_type_id` |
| Primary keys | `id` (always) | `id BIGSERIAL PRIMARY KEY` |
| Foreign keys | `{singular_table}_id` | `character_id`, `scene_type_id` |
| FK constraints | `fk_{table}_{column}` | `fk_scenes_character_id` |
| Indexes | `idx_{table}_{column(s)}` | `idx_characters_project_id` |
| Unique constraints | `uq_{table}_{column(s)}` | `uq_characters_project_id_name` |
| Check constraints | `ck_{table}_{description}` | `ck_segments_sequence_positive` |
| Lookup/status tables | `{domain}_statuses` | `job_statuses`, `approval_statuses` |

### Standard Columns

Every table includes:

```sql
id          BIGSERIAL PRIMARY KEY,
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

The `updated_at` trigger is defined once in migration 000 and applied to each table:

```sql
-- In migration 000
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- In each table's migration
CREATE TRIGGER trg_characters_updated_at
    BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Foreign Keys

- Always create an index on FK columns (PostgreSQL doesn't auto-index FKs).
- Use `ON DELETE CASCADE` only for child-owns-parent relationships (segments → scene).
- Use `ON DELETE RESTRICT` for reference relationships (scenes → scene_type).
- Use `ON DELETE SET NULL` for optional references.

### Lookup/Status Tables

All statuses use lookup tables, never raw text columns:

```sql
CREATE TABLE job_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL           -- Human-readable display name
);

INSERT INTO job_statuses (name, label) VALUES
    ('queued', 'Queued'),
    ('running', 'Running'),
    ('completed', 'Completed'),
    ('failed', 'Failed');

-- Reference via FK
ALTER TABLE jobs ADD COLUMN status_id SMALLINT NOT NULL
    REFERENCES job_statuses(id) DEFAULT 1;
```

### JSONB Columns

For extensible/dynamic data (e.g., character settings, workflow parameters):

```sql
-- Use JSONB, never JSON
settings JSONB NOT NULL DEFAULT '{}'::jsonb

-- Always add a GIN index for queries
CREATE INDEX idx_characters_settings ON characters USING GIN (settings);
```

### Migrations

- Managed by `sqlx-cli`
- File naming: auto-generated timestamp prefix (`YYYYMMDDHHMMSS_description.sql`)
- Each migration is a single `.sql` file (not up/down pairs) — reversible migrations are handled by writing compensating migrations
- Migrations must be idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Never modify a migration that has been committed. Write a new migration instead.

```bash
# Create a new migration
sqlx migrate add -r create_characters_table --source apps/db/migrations/

# Run migrations
make migrate
# or: sqlx migrate run --source apps/db/migrations/

# Check migration status
sqlx migrate info --source apps/db/migrations/
```

### pgvector Index Strategy

For vector similarity search columns (PRD-20 image embeddings, PRD-76 similarity matching):

| Index Type | When to Use | Trade-offs |
|------------|-------------|------------|
| **HNSW** | < 1M vectors (default) | Better recall, no training step, higher memory |
| **IVFFlat** | > 1M vectors | Faster build, lower memory, requires training (`CREATE INDEX ... WITH (lists = N)`) |

```sql
-- HNSW index (default for most tables)
CREATE INDEX idx_images_embedding_vec ON images
    USING hnsw (embedding vector_cosine_ops);

-- IVFFlat index (for high-volume tables)
CREATE INDEX idx_frames_embedding_vec ON frames
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Important:** Create vector indexes *after* bulk data load, not in the initial table migration. Empty HNSW indexes are fine; empty IVFFlat indexes produce poor query plans.

---

## 5. API Conventions

### URL Structure

```
/api/v1/{resource}                  # Collection
/api/v1/{resource}/{id}             # Single entity
/api/v1/{resource}/{id}/{sub}       # Nested resource
/api/v1/{resource}/{id}/actions/{a} # Actions (non-CRUD)
```

Examples:
```
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/42
PATCH  /api/v1/projects/42
DELETE /api/v1/projects/42
GET    /api/v1/projects/42/characters
POST   /api/v1/projects/42/characters/15/actions/generate
```

### Request/Response Format

All responses use a consistent envelope:

```json
// Success (single entity)
{
  "data": { "id": 42, "name": "Project Alpha", ... }
}

// Success (collection)
{
  "data": [{ "id": 42, ... }, { "id": 43, ... }],
  "meta": {
    "total": 156,
    "page": 1,
    "per_page": 25,
    "total_pages": 7
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required",
    "details": [
      { "field": "name", "message": "cannot be empty" }
    ]
  }
}
```

Rust types for these:

```rust
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<PaginationMeta>,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<FieldError>>,
}

#[derive(Serialize)]
pub struct PaginationMeta {
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
    pub total_pages: i32,
}
```

### Pagination

Default: offset-based for simplicity. Cursor-based available for high-volume endpoints.

```
GET /api/v1/characters?page=2&per_page=25&sort=name&order=asc
```

| Parameter | Default | Max |
|-----------|---------|-----|
| `page` | 1 | — |
| `per_page` | 25 | 100 |
| `sort` | `created_at` | — |
| `order` | `desc` | — |

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH, action) |
| 201 | Created (POST) |
| 204 | No content (DELETE) |
| 400 | Bad request (malformed JSON, missing required params) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (valid token, insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (duplicate, version mismatch) |
| 422 | Validation error (well-formed but invalid data) |
| 429 | Rate limited |
| 500 | Internal server error (never expose internals) |

### Authentication

- JWT Bearer tokens in `Authorization: Bearer <token>` header
- Access tokens: short-lived (15 minutes)
- Refresh tokens: long-lived (7 days), stored httpOnly cookie
- API keys: `X-API-Key` header for service accounts (PRD-12)

---

## 6. Frontend Conventions

### File Naming

| Item | Convention | Example |
|------|-----------|---------|
| Components | `PascalCase.tsx` | `CharacterCard.tsx` |
| Hooks | `camelCase.ts` with `use` prefix | `useCharacters.ts` |
| Stores | `camelCase.ts` with `Store` suffix | `authStore.ts` |
| Utilities | `camelCase.ts` | `formatDuration.ts` |
| Types | `camelCase.ts` | `character.ts` (exports interfaces) |
| Test files | `*.test.ts(x)` | `CharacterCard.test.tsx` |
| CSS modules | `ComponentName.module.css` | Only when Tailwind insufficient |

### Component Structure

```tsx
// CharacterCard.tsx

// 1. Imports
import { type Character } from '@/lib/types/character';
import { Badge } from '@/components/primitives/Badge';

// 2. Types (exported if shared)
interface CharacterCardProps {
  character: Character;
  onSelect?: (id: number) => void;
}

// 3. Component (named export, never default)
export function CharacterCard({ character, onSelect }: CharacterCardProps) {
  return (
    <div className="...">
      ...
    </div>
  );
}
```

Rules:
- **Named exports only** — never `export default`
- **One component per file** — file name matches component name
- **Props interface in same file** — export if used elsewhere
- **No inline styles** — use Tailwind classes or design tokens
- **No `any` type** — use `unknown` and narrow, or define proper types

### Data Fetching

All API calls go through TanStack Query hooks:

```tsx
// apps/frontend/src/features/characters/hooks/useCharacters.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useCharacters(projectId: number) {
  return useQuery({
    queryKey: ['characters', { projectId }],
    queryFn: () => api.get(`/projects/${projectId}/characters`),
  });
}
```

Rules:
- Query keys follow the pattern: `[resource, filters]`
- All API calls use the shared `api` client (never raw `fetch`)
- Mutations use `useMutation` with appropriate `onSuccess` invalidation
- Loading and error states handled at the component level using `isPending` / `isError`

### State Management

| State Type | Where | Tool |
|------------|-------|------|
| Server state | TanStack Query cache | `useQuery` / `useMutation` |
| UI state (local) | Component | `useState` / `useReducer` |
| UI state (shared) | Zustand store | `useAuthStore`, `useLayoutStore` |
| URL state | TanStack Router | Search params, path params |
| Form state | React Hook Form | `useForm` + Zod validation |

**Never** duplicate server state in Zustand. TanStack Query is the source of truth for server data.

### Design Tokens

Tokens are CSS custom properties defined in `apps/frontend/src/tokens/`:

```css
/* tokens/colors.css */
:root {
  --color-surface-primary: #1a1a2e;
  --color-surface-secondary: #16213e;
  --color-text-primary: #e8e8e8;
  --color-text-muted: #8888a0;
  --color-action-primary: #0f3460;
  --color-action-danger: #e94560;
  /* ... */
}

[data-theme="light"] {
  --color-surface-primary: #ffffff;
  /* ... */
}
```

Consumed in Tailwind via `tailwind.config.ts`:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        surface: {
          primary: 'var(--color-surface-primary)',
          secondary: 'var(--color-surface-secondary)',
        },
        // ...
      },
    },
  },
};
```

**Never use raw hex/rgb values.** Always reference tokens via Tailwind classes (`bg-surface-primary`) or CSS variables (`var(--color-surface-primary)`).

### Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Always use `@/` imports. Never relative imports that go up more than one level (`../../` is forbidden, `../` is acceptable within a feature module).

---

## 7. Testing Strategy

### Backend (Rust)

| Test Type | Location | Database | Runs In |
|-----------|----------|----------|---------|
| Unit tests | Same file (`#[cfg(test)]`) | No (mocked) | `cargo test` |
| Integration tests | `apps/backend/crates/api/tests/` | Yes (test DB) | `make test` |
| DB tests | `apps/backend/crates/db/tests/` | Yes (test DB) | `make test` |

**Test database:** Each test run creates a temporary database from migrations. Use `sqlx::test` attribute or a shared test harness.

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_character(pool: PgPool) {
    let repo = CharacterRepo::new(&pool);
    let char = repo.create(&NewCharacter { name: "Jane", ... }).await.unwrap();
    assert_eq!(char.name, "Jane");
}
```

### Frontend (React)

| Test Type | Tool | Location |
|-----------|------|----------|
| Component tests | Vitest + Testing Library | `*.test.tsx` alongside component |
| Hook tests | Vitest + renderHook | `*.test.ts` alongside hook |
| E2E tests | Playwright | `e2e/` directory |

```tsx
// CharacterCard.test.tsx
import { render, screen } from '@testing-library/react';
import { CharacterCard } from './CharacterCard';

test('renders character name', () => {
  render(<CharacterCard character={mockCharacter} />);
  expect(screen.getByText('Jane Dough')).toBeInTheDocument();
});
```

### Test Naming

```
test_[unit]_[scenario]_[expected_result]

// Rust
test_character_validation_rejects_empty_name
test_list_characters_returns_paginated

// TypeScript
'renders character name'
'calls onSelect when clicked'
'shows loading skeleton when pending'
```

---

## 8. Configuration

### Environment Variables

```bash
# .env (local development — never committed)
DATABASE_URL=postgres://x121:x121@localhost:5432/x121
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-in-production
COMFYUI_WS_URL=ws://localhost:8188/ws
STORAGE_ROOT=/data/x121
RUST_LOG=x121_api=debug,tower_http=debug
```

### Layered Config

```
1. Default values (compiled in)
2. Config file (config/default.toml)
3. Environment-specific file (config/development.toml)
4. Environment variables (override everything)
```

---

## 9. Git Workflow

### Branch Naming

```
feat/prd-{number}-{short-description}   # Feature work
fix/{short-description}                  # Bug fixes
refactor/{short-description}             # Refactoring
chore/{short-description}                # Maintenance
```

Examples: `feat/prd-000-database-normalization`, `fix/character-validation-null-check`

### Commit Messages

Conventional commits. Never include AI attribution.

```
feat(db): add characters table with FK constraints

- Create characters table with project FK
- Add status lookup table
- Add updated_at trigger

Implements PRD-001 Phase 1
```

---

## 10. Dependency Direction

```
                    ┌──────────┐
                    │   api    │  ← HTTP server binary
                    └────┬─────┘
                         │ depends on
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │   core   │  │    db    │  │  events  │
    └──────────┘  └────┬─────┘  └──────────┘
          ▲            │              ▲
          │            │ depends on   │
          │            ▼              │
          │      ┌──────────┐        │
          └──────│ core     │────────┘
                 └──────────┘

    ┌──────────┐  ┌──────────┐
    │ pipeline │  │  worker  │  ← GPU worker binary
    └────┬─────┘  └────┬─────┘
         │             │
         ▼             ▼
    ┌──────────┐  ┌──────────┐
    │ comfyui  │  │ pipeline │
    └──────────┘  └──────────┘
```

- `core` depends on nothing (only std + serde + thiserror + chrono)
- `db` depends on `core` (for domain types)
- `events` depends on `core`
- `api` depends on `core`, `db`, `events`
- `pipeline` depends on `core`, `comfyui`
- `comfyui` depends on `core`
- `worker` depends on `core`, `pipeline`, `db`, `events`

**Never** create a dependency from `core` → anything. It is the leaf.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-19 | Initial conventions document |
