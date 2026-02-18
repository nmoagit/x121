# PRD-002: Backend Foundation (Rust/Axum)

## 1. Introduction/Overview
The backend foundation provides the high-performance async server that powers the entire platform. Built on Rust with Axum, SQLx (PostgreSQL), and Tokio, it serves as the orchestration layer for WebSocket management, API routing, database access, and background task coordination. Every service, API endpoint, and real-time communication channel depends on this foundation being fast, reliable, and well-structured.

## 2. Related PRDs & Dependencies
- **Depends on:** None (foundational infrastructure)
- **Depended on by:** PRD-03, PRD-05, PRD-07, PRD-09, PRD-10, PRD-11, PRD-12, PRD-46
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Establish the Rust/Axum server as the central backend with async I/O via Tokio.
- Configure SQLx connection pooling for PostgreSQL with health checks and retry logic.
- Define the routing architecture, middleware pipeline, and error handling patterns.
- Provide WebSocket infrastructure for real-time features.
- Set up structured logging, configuration management, and graceful shutdown.

## 4. User Stories
- As an Admin, I want the backend to handle hundreds of concurrent WebSocket connections without degradation so that real-time features remain responsive during peak usage.
- As a Creator, I want API responses to be consistently fast (sub-100ms for reads) so that the UI feels responsive.
- As an Admin, I want structured logging with request tracing so that I can diagnose issues quickly.
- As a Creator, I want the server to gracefully handle errors and return clear error messages so that I understand what went wrong.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Axum HTTP Server
**Description:** Set up the Axum web framework with Tokio async runtime, routing, and middleware.
**Acceptance Criteria:**
- [ ] Axum server starts and listens on a configurable port
- [ ] Routes are organized by feature module (auth, projects, characters, scenes, etc.)
- [ ] Request/response logging middleware captures method, path, status, and duration
- [ ] CORS configuration supports the frontend origin

#### Requirement 1.2: SQLx PostgreSQL Connection Pool
**Description:** Configure a managed connection pool for PostgreSQL using SQLx with compile-time query checking.
**Acceptance Criteria:**
- [ ] Connection pool size is configurable via environment variables
- [ ] Health check queries run periodically to detect stale connections
- [ ] All database queries use SQLx compile-time verification
- [ ] Connection failures produce clear error logs with retry behavior

#### Requirement 1.3: WebSocket Infrastructure
**Description:** Provide WebSocket upgrade handling and connection management for real-time features.
**Acceptance Criteria:**
- [ ] WebSocket endpoints support upgrade from HTTP
- [ ] Connection registry tracks active WebSocket connections per user
- [ ] Heartbeat/ping-pong mechanism detects dead connections
- [ ] Graceful disconnection cleanup releases associated resources

#### Requirement 1.4: Error Handling & Response Format
**Description:** Unified error handling that translates internal errors into consistent JSON API responses.
**Acceptance Criteria:**
- [ ] All errors return a consistent JSON structure: `{ error: string, code: string, details?: object }`
- [ ] Database constraint violations are translated to user-friendly messages
- [ ] Panic recovery middleware prevents server crashes from individual request failures
- [ ] 500 errors log full stack traces but return sanitized messages to clients

#### Requirement 1.5: Configuration Management
**Description:** Externalized configuration via environment variables and config files.
**Acceptance Criteria:**
- [ ] All configurable values (port, database URL, CORS origins, log level) are environment-variable-driven
- [ ] A `.env.example` file documents all required and optional variables
- [ ] Configuration validation runs at startup and fails fast on missing required values

#### Requirement 1.6: Graceful Shutdown
**Description:** The server handles SIGTERM/SIGINT by draining active connections before exiting.
**Acceptance Criteria:**
- [ ] Active HTTP requests complete before shutdown (configurable timeout)
- [ ] WebSocket connections receive a close frame before termination
- [ ] Background tasks receive cancellation signals
- [ ] Database connection pool is cleanly drained

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Request Rate Limiting
**Description:** Global and per-endpoint rate limiting middleware.
**Acceptance Criteria:**
- [ ] Configurable rate limits per endpoint and per IP/user
- [ ] Rate limit headers (X-RateLimit-Remaining, Retry-After) included in responses

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Request Tracing (OpenTelemetry)
**Description:** Distributed tracing for request lifecycle visibility.
**Acceptance Criteria:**
- [ ] Each request gets a unique trace ID propagated through all internal calls
- [ ] Traces are exportable to an observability backend (Jaeger, Zipkin)

## 6. Non-Goals (Out of Scope)
- Authentication and authorization logic (covered by PRD-03)
- Specific API endpoint implementations (covered by individual feature PRDs)
- ComfyUI WebSocket bridge specifics (covered by PRD-05)
- Frontend build and serving (separate concern)

## 7. Design Considerations
- The backend is headless — it serves JSON APIs and WebSocket connections only. The frontend is a separate SPA.
- API versioning strategy should be established early (URL prefix `/api/v1/` recommended).

## 8. Technical Considerations
- **Stack:** Rust, Axum, Tokio, SQLx, PostgreSQL, serde for JSON serialization
- **Existing Code to Reuse:** None (foundational)
- **New Infrastructure Needed:** Rust project structure, Cargo workspace, CI pipeline for Rust builds
- **Database Changes:** None directly (PRD-00 handles schema)
- **API Changes:** Establishes the API framework; all endpoints defined by downstream PRDs

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Server handles 500+ concurrent WebSocket connections with <50ms latency overhead
- API read endpoints respond in <100ms at the 95th percentile
- Zero unhandled panics in production (all recovered by middleware)
- Startup time under 5 seconds including database connection pool initialization

## 11. Open Questions
- Should we use a Cargo workspace with multiple crates (e.g., `api`, `domain`, `infrastructure`) or a single crate with modules?
- What is the deployment target (Docker, bare metal, systemd)?
- Should we adopt tower middleware ecosystem or build custom middleware?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
