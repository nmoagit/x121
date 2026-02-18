# Task List: User Identity & RBAC

**PRD Reference:** `design/prds/003-prd-user-identity-rbac.md`
**Scope:** Implement JWT-based authentication, three-role RBAC (Admin, Creator, Reviewer), user management, password security with Argon2id, and role-enforcing middleware for the Axum API.

## Overview

This PRD adds authentication and authorization on top of the PRD-002 backend foundation. We create the `users`, `roles`, and `user_sessions` tables, implement JWT token generation/validation with access+refresh token pairs, build Argon2id password hashing, and wire RBAC middleware into the Axum router so every protected endpoint checks the user's role before executing. The "Creator has final approval" workflow is enforced by the permission model, not by special-casing logic.

### What Already Exists
- PRD-000: Database with migration framework, status lookup tables, `DbId = i64`
- PRD-002: Axum server with middleware stack, `AppState`, `AppError`, request logging, CORS
- PRD-002: `src/error.rs` with `Unauthorized` and `Forbidden` variants

### What We're Building
1. Database tables: `roles`, `users`, `user_sessions`
2. Argon2id password hashing module
3. JWT token generation and validation (access + refresh tokens)
4. Auth middleware that extracts and validates JWT from `Authorization` header
5. RBAC middleware that checks user role against endpoint requirements
6. Auth API endpoints: login, refresh, logout
7. Admin user management API endpoints
8. React login page and auth context (frontend)

### Key Design Decisions
1. **Single role per user** — Each user has exactly one role. Multi-role is deferred to post-MVP fine-grained permissions.
2. **Refresh token rotation** — Each refresh generates a new refresh token and invalidates the old one, preventing token reuse attacks.
3. **Middleware-level enforcement** — Role checks happen before the handler runs. Handlers never need to check permissions themselves.
4. **Argon2id** — Industry-standard memory-hard hashing. Resistant to GPU and ASIC attacks.

---

## Phase 1: Database Schema

### Task 1.1: Create Roles Lookup Table
**File:** `migrations/20260218200001_create_roles_table.sql`

Create the roles lookup table following PRD-000 conventions.

```sql
CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO roles (name, description) VALUES
    ('admin', 'Full access — user management, system configuration, all permissions'),
    ('creator', 'Project and character management, generation, final approval'),
    ('reviewer', 'View content, flag issues, add review notes, suggest rejections');
```

**Acceptance Criteria:**
- [ ] `roles` table with `id BIGSERIAL PRIMARY KEY`, `name TEXT NOT NULL UNIQUE`
- [ ] Three seed roles: admin, creator, reviewer
- [ ] `updated_at` trigger attached
- [ ] Migration applies cleanly

### Task 1.2: Create Users Table
**File:** `migrations/20260218200002_create_users_table.sql`

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `users` table with `password_hash TEXT NOT NULL` (never stores plaintext)
- [ ] `role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT`
- [ ] `is_active BOOLEAN NOT NULL DEFAULT true` for soft-delete
- [ ] `failed_login_count` and `locked_until` for brute-force protection
- [ ] Unique constraints on `username` and `email`
- [ ] FK index on `role_id`

### Task 1.3: Create User Sessions Table
**File:** `migrations/20260218200003_create_user_sessions_table.sql`

Track refresh tokens for rotation and revocation.

```sql
CREATE TABLE user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_refresh_token_hash ON user_sessions(refresh_token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE is_revoked = false;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_sessions` with `refresh_token_hash TEXT NOT NULL` (hash, not plaintext token)
- [ ] `user_id` cascades on delete (deleting user removes sessions)
- [ ] `is_revoked BOOLEAN` for token rotation
- [ ] Partial index on `expires_at` for active sessions
- [ ] `user_agent` and `ip_address` for audit purposes

---

## Phase 2: Password Security

### Task 2.1: Argon2id Hashing Module
**File:** `src/auth/password.rs`

Implement password hashing and verification using Argon2id.

```rust
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
    Argon2,
};

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed = PasswordHash::new(hash)?;
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}

pub fn validate_password_strength(password: &str, min_length: usize) -> Result<(), String> {
    if password.len() < min_length {
        return Err(format!("Password must be at least {} characters", min_length));
    }
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `hash_password` returns Argon2id hash string with random salt
- [ ] `verify_password` returns `true` for correct password, `false` for wrong
- [ ] `validate_password_strength` enforces minimum length (configurable, default 12)
- [ ] `argon2` crate added to `Cargo.toml`
- [ ] Unit tests: hash and verify round-trip, wrong password fails, strength validation

### Task 2.2: Password Hashing Tests
**File:** `src/auth/password.rs` (test module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = "test_password_123";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
    }

    #[test]
    fn test_wrong_password_fails() {
        let hash = hash_password("correct_password").unwrap();
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_password_too_short() {
        let result = validate_password_strength("short", 12);
        assert!(result.is_err());
    }

    #[test]
    fn test_password_meets_minimum() {
        let result = validate_password_strength("long_enough_password", 12);
        assert!(result.is_ok());
    }
}
```

**Acceptance Criteria:**
- [ ] Tests cover: hash/verify round-trip, wrong password rejection, strength validation
- [ ] All tests pass with `cargo test`

---

## Phase 3: JWT Token Management

### Task 3.1: JWT Configuration
**File:** `src/auth/jwt.rs`

Implement JWT token generation and validation.

```rust
use jsonwebtoken::{encode, decode, Header, EncodingKey, DecodingKey, Validation, Algorithm};
use serde::{Serialize, Deserialize};
use crate::types::DbId;
use chrono::{Utc, Duration};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: DbId,         // user_id
    pub role: String,      // role name
    pub exp: i64,          // expiration timestamp
    pub iat: i64,          // issued at
    pub jti: String,       // unique token ID
}

pub struct JwtConfig {
    pub secret: String,
    pub access_token_expiry_mins: i64,
    pub refresh_token_expiry_days: i64,
}

impl JwtConfig {
    pub fn from_env() -> Self {
        Self {
            secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            access_token_expiry_mins: std::env::var("JWT_ACCESS_EXPIRY_MINS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(15),
            refresh_token_expiry_days: std::env::var("JWT_REFRESH_EXPIRY_DAYS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(7),
        }
    }
}

pub fn generate_access_token(
    user_id: DbId,
    role: &str,
    config: &JwtConfig,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        role: role.to_string(),
        exp: (now + Duration::minutes(config.access_token_expiry_mins)).timestamp(),
        iat: now.timestamp(),
        jti: uuid::Uuid::new_v4().to_string(),
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(config.secret.as_bytes()))
}

pub fn validate_token(token: &str, config: &JwtConfig) -> Result<Claims, jsonwebtoken::errors::Error> {
    let validation = Validation::new(Algorithm::HS256);
    let token_data = decode::<Claims>(token, &DecodingKey::from_secret(config.secret.as_bytes()), &validation)?;
    Ok(token_data.claims)
}
```

**Acceptance Criteria:**
- [ ] `generate_access_token` creates JWT with user_id, role, expiry
- [ ] `validate_token` decodes and validates signature, expiry
- [ ] `JWT_SECRET` required env var (panic on startup if missing)
- [ ] Access token expiry: configurable, default 15 minutes
- [ ] Refresh token expiry: configurable, default 7 days
- [ ] `jsonwebtoken` crate added to `Cargo.toml`

### Task 3.2: Refresh Token Generation
**File:** `src/auth/jwt.rs`

Generate opaque refresh tokens (not JWT) stored hashed in the database.

```rust
use sha2::{Sha256, Digest};

pub fn generate_refresh_token() -> (String, String) {
    let token = uuid::Uuid::new_v4().to_string();
    let hash = hash_refresh_token(&token);
    (token, hash)
}

pub fn hash_refresh_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

**Acceptance Criteria:**
- [ ] Refresh token is a random UUID (opaque, not JWT)
- [ ] Only the SHA-256 hash is stored in the database
- [ ] `sha2` crate added to `Cargo.toml`
- [ ] Function returns both the plaintext token (for client) and the hash (for DB)

---

## Phase 4: Auth Middleware

### Task 4.1: JWT Extraction Middleware
**File:** `src/middleware/auth.rs`

Axum middleware/extractor that reads JWT from Authorization header and populates request state.

```rust
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use crate::app_state::AppState;
use crate::auth::jwt::{validate_token, Claims};
use crate::error::AppError;

/// Extracts and validates JWT claims from the Authorization header.
pub struct AuthUser {
    pub user_id: DbId,
    pub role: String,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers.get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized("Missing Authorization header".to_string()))?;

        let token = auth_header.strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized("Invalid Authorization format".to_string()))?;

        let claims = validate_token(token, &state.config.jwt)
            .map_err(|_| AppError::Unauthorized("Invalid or expired token".to_string()))?;

        Ok(AuthUser {
            user_id: claims.sub,
            role: claims.role,
        })
    }
}
```

**Acceptance Criteria:**
- [ ] `AuthUser` extractor reads `Authorization: Bearer <token>` header
- [ ] Missing header returns 401 with clear message
- [ ] Invalid/expired token returns 401
- [ ] Validated claims are available to handlers as `AuthUser`
- [ ] No database query needed for JWT validation (stateless)

### Task 4.2: Role-Based Access Control Extractor
**File:** `src/middleware/rbac.rs`

Create role-checking extractors for each permission level.

```rust
use crate::error::AppError;
use crate::middleware::auth::AuthUser;

/// Requires Admin role
pub struct RequireAdmin(pub AuthUser);

#[axum::async_trait]
impl<S> FromRequestParts<S> for RequireAdmin
where
    S: Send + Sync,
    AuthUser: FromRequestParts<S, Rejection = AppError>,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err(AppError::Forbidden("Admin role required".to_string()));
        }
        Ok(RequireAdmin(user))
    }
}

/// Requires Creator or Admin role
pub struct RequireCreator(pub AuthUser);

/// Requires any authenticated role (Admin, Creator, or Reviewer)
pub struct RequireAuth(pub AuthUser);
```

**Acceptance Criteria:**
- [ ] `RequireAdmin` — only admin role passes
- [ ] `RequireCreator` — admin or creator role passes
- [ ] `RequireAuth` — any authenticated user passes
- [ ] Wrong role returns 403 Forbidden with message
- [ ] Extractors compose: `RequireAdmin` first validates JWT, then checks role

---

## Phase 5: Auth API Endpoints

### Task 5.1: Login Endpoint
**File:** `src/api/handlers/auth.rs`

Implement the login endpoint.

```rust
#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Serialize)]
pub struct UserInfo {
    pub id: DbId,
    pub username: String,
    pub email: String,
    pub role: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // 1. Find user by username
    // 2. Check is_active
    // 3. Check locked_until
    // 4. Verify password
    // 5. On failure: increment failed_login_count, lock if threshold reached
    // 6. On success: reset failed_login_count, generate tokens, create session
    // 7. Return tokens and user info
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/login` accepts `{username, password}`
- [ ] Returns access token, refresh token, expiry, and user info
- [ ] Inactive users cannot log in (403)
- [ ] Locked users cannot log in until `locked_until` expires (429)
- [ ] Failed login increments counter; locks after configurable threshold (default 5)
- [ ] Successful login resets failed login counter and updates `last_login_at`

### Task 5.2: Token Refresh Endpoint
**File:** `src/api/handlers/auth.rs`

```rust
#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(input): Json<RefreshRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // 1. Hash the provided refresh token
    // 2. Find matching active session
    // 3. Verify not expired and not revoked
    // 4. Revoke old refresh token
    // 5. Generate new access + refresh tokens
    // 6. Create new session record
    // 7. Return new tokens
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/refresh` accepts `{refresh_token}`
- [ ] Old refresh token is revoked (rotation)
- [ ] New access and refresh tokens generated
- [ ] Expired or revoked refresh token returns 401
- [ ] Session record updated with new token hash

### Task 5.3: Logout Endpoint
**File:** `src/api/handlers/auth.rs`

```rust
pub async fn logout(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, AppError> {
    // Revoke all sessions for this user
    // Return 204 No Content
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/logout` revokes all active sessions for the user
- [ ] Requires valid access token
- [ ] Returns 204 No Content on success

### Task 5.4: Auth Routes Registration
**File:** `src/api/routes.rs` (update)

Register auth endpoints in the router.

```rust
pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth_routes())
        // ... other routes
}

fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", axum::routing::post(handlers::auth::login))
        .route("/refresh", axum::routing::post(handlers::auth::refresh))
        .route("/logout", axum::routing::post(handlers::auth::logout))
}
```

**Acceptance Criteria:**
- [ ] `/api/v1/auth/login` — public (no auth required)
- [ ] `/api/v1/auth/refresh` — public (uses refresh token, not JWT)
- [ ] `/api/v1/auth/logout` — requires valid JWT
- [ ] Routes registered in the main router

---

## Phase 6: User Management API (Admin)

### Task 6.1: User Repository
**File:** `src/repositories/user_repo.rs`

CRUD operations for users.

```rust
pub struct UserRepo;

impl UserRepo {
    pub async fn create(pool: &PgPool, input: &CreateUser) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (username, email, password_hash, role_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, email, password_hash, role_id, is_active,
                       last_login_at, failed_login_count, locked_until, created_at, updated_at"
        )
        .bind(&input.username)
        .bind(&input.email)
        .bind(&input.password_hash)
        .bind(input.role_id)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, username, email, password_hash, role_id, is_active,
                    last_login_at, failed_login_count, locked_until, created_at, updated_at
             FROM users WHERE username = $1"
        )
        .bind(username)
        .fetch_optional(pool)
        .await
    }

    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE users SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
```

**Acceptance Criteria:**
- [ ] `create`, `find_by_id`, `find_by_username`, `find_by_email`, `list`, `update`, `deactivate`
- [ ] Explicit column lists (no `SELECT *`)
- [ ] `password_hash` column included for auth but never exposed in API responses

### Task 6.2: Admin User Management Handlers
**File:** `src/api/handlers/admin.rs`

```rust
pub async fn create_user(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    // 1. Validate password strength
    // 2. Hash password
    // 3. Create user
    // 4. Return user info (without password_hash)
}

pub async fn list_users(
    RequireAdmin(_): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    // Return all users without password_hash
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/users` — create user (Admin only)
- [ ] `GET /api/v1/admin/users` — list all users (Admin only)
- [ ] `GET /api/v1/admin/users/:id` — get user details (Admin only)
- [ ] `PUT /api/v1/admin/users/:id` — update user role/info (Admin only)
- [ ] `DELETE /api/v1/admin/users/:id` — deactivate user (Admin only, soft-delete)
- [ ] `POST /api/v1/admin/users/:id/reset-password` — trigger password reset (Admin only)
- [ ] `password_hash` is never included in any response

---

## Phase 7: Frontend Auth Integration

### Task 7.1: React Auth Context
**File:** `frontend/src/contexts/AuthContext.tsx`

Create the React authentication context and provider.

```typescript
interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'creator' | 'reviewer';
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] `AuthContext` stores user info, tokens, loading state
- [ ] `login()` calls `/api/v1/auth/login` and stores tokens
- [ ] `logout()` calls `/api/v1/auth/logout` and clears state
- [ ] `refreshToken()` silently refreshes before access token expires
- [ ] Tokens stored in memory (not localStorage) for security
- [ ] Auth state persists across page refreshes via refresh token

### Task 7.2: Login Page Component
**File:** `frontend/src/pages/LoginPage.tsx`

```typescript
const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  // Clean form with username, password, submit button
};
```

**Acceptance Criteria:**
- [ ] Login form with username and password fields
- [ ] Error message display for failed login
- [ ] Redirect to dashboard on successful login
- [ ] Loading state during authentication
- [ ] Form validation (non-empty fields)

### Task 7.3: Protected Route Wrapper
**File:** `frontend/src/components/ProtectedRoute.tsx`

```typescript
interface ProtectedRouteProps {
  requiredRole?: 'admin' | 'creator' | 'reviewer';
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole, children }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <AccessDenied />;
  }

  return <>{children}</>;
};
```

**Acceptance Criteria:**
- [ ] Redirects to `/login` if not authenticated
- [ ] Shows access denied if role insufficient
- [ ] Admin bypasses role checks (has all permissions)
- [ ] Loading spinner while auth state is resolving

### Task 7.4: API Client with Auth Headers
**File:** `frontend/src/lib/api.ts`

Create an API client that automatically attaches JWT and handles token refresh.

```typescript
const api = axios.create({
  baseURL: '/api/v1',
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      await refreshToken();
      return api(error.config);
    }
    return Promise.reject(error);
  }
);
```

**Acceptance Criteria:**
- [ ] Automatically attaches `Authorization: Bearer <token>` to all requests
- [ ] 401 responses trigger silent token refresh and retry
- [ ] If refresh fails, redirects to login page
- [ ] Concurrent requests during refresh are queued (not all individually refreshing)

---

## Phase 8: Integration Tests

### Task 8.1: Auth Flow Tests
**File:** `tests/auth_tests.rs`

```rust
#[tokio::test]
async fn test_login_success() {
    // Create user, login, verify tokens returned
}

#[tokio::test]
async fn test_login_wrong_password() {
    // Login with wrong password, verify 401
}

#[tokio::test]
async fn test_token_refresh() {
    // Login, use refresh token, verify new tokens
}

#[tokio::test]
async fn test_rbac_admin_only() {
    // Login as creator, access admin endpoint, verify 403
}

#[tokio::test]
async fn test_account_lockout() {
    // Fail login 5 times, verify locked
}
```

**Acceptance Criteria:**
- [ ] Test: successful login returns tokens
- [ ] Test: wrong password returns 401
- [ ] Test: refresh token rotation works
- [ ] Test: expired access token returns 401
- [ ] Test: admin endpoint returns 403 for non-admin
- [ ] Test: account locks after threshold failures
- [ ] Test: deactivated user cannot login

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218200001_create_roles_table.sql` | Roles lookup table |
| `migrations/20260218200002_create_users_table.sql` | Users table |
| `migrations/20260218200003_create_user_sessions_table.sql` | Refresh token sessions |
| `src/auth/mod.rs` | Auth module barrel file |
| `src/auth/password.rs` | Argon2id hashing and verification |
| `src/auth/jwt.rs` | JWT generation and validation |
| `src/middleware/auth.rs` | `AuthUser` extractor from JWT |
| `src/middleware/rbac.rs` | `RequireAdmin`, `RequireCreator`, `RequireAuth` extractors |
| `src/models/user.rs` | User and session model structs |
| `src/repositories/user_repo.rs` | User CRUD operations |
| `src/repositories/session_repo.rs` | Session CRUD for refresh tokens |
| `src/api/handlers/auth.rs` | Login, refresh, logout handlers |
| `src/api/handlers/admin.rs` | Admin user management handlers |
| `frontend/src/contexts/AuthContext.tsx` | React auth state management |
| `frontend/src/pages/LoginPage.tsx` | Login page UI |
| `frontend/src/components/ProtectedRoute.tsx` | Route guard component |
| `frontend/src/lib/api.ts` | API client with auth interceptors |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `trigger_set_updated_at()`, `DbId = i64`
- PRD-002: Axum server, `AppState`, `AppError` (Unauthorized, Forbidden variants), middleware stack
- PRD-002: Request logging (auth failures will be logged)

### New Infrastructure Needed
- `jsonwebtoken` crate for JWT
- `argon2` crate for password hashing
- `sha2` crate for refresh token hashing
- `uuid` crate (likely already added by PRD-002)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.3
2. Phase 2: Password Security — Tasks 2.1–2.2
3. Phase 3: JWT Token Management — Tasks 3.1–3.2
4. Phase 4: Auth Middleware — Tasks 4.1–4.2
5. Phase 5: Auth API Endpoints — Tasks 5.1–5.4

**MVP Success Criteria:**
- Login returns JWT access + refresh tokens
- Protected endpoints reject requests without valid JWT
- Role-based endpoints reject wrong roles with 403
- Password stored only as Argon2id hash
- Account locks after 5 failed attempts

### Post-MVP Enhancements
1. Phase 6: User Management API — Tasks 6.1–6.2
2. Phase 7: Frontend Auth Integration — Tasks 7.1–7.4
3. Phase 8: Integration Tests — Task 8.1

---

## Notes

1. **JWT secret:** The `JWT_SECRET` environment variable must be a strong random string (at least 32 characters). It must be identical across all backend instances.
2. **Token storage (frontend):** Access tokens are kept in memory only. Refresh tokens use httpOnly cookies for XSS protection in a future enhancement; for MVP they are stored in memory and sent in request bodies.
3. **Account lockout:** Lockout duration is configurable (default 15 minutes). After lockout expires, the counter resets on next successful login.
4. **Seed admin user:** The first deployment should create an initial admin user via a migration or bootstrap script. Credentials should be environment-variable-driven.
5. **Password reset flow:** For MVP, only admin-initiated resets are supported. Self-service password reset (email-based) is a post-MVP feature.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
