# PRD-005: ComfyUI WebSocket Bridge

## 1. Introduction/Overview
The ComfyUI WebSocket Bridge provides real-time bidirectional communication between the Rust backend and ComfyUI instances. It enables live state synchronization, progress reporting, and the interactive debugging capabilities that allow users to monitor and control generation in real time. This bridge is the critical link between the platform's orchestration layer and the actual AI generation engine.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation for WebSocket infrastructure)
- **Depended on by:** PRD-07, PRD-24, PRD-33, PRD-34
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Establish reliable WebSocket connections to one or more ComfyUI instances.
- Synchronize generation state (progress, node execution, errors) from ComfyUI to the platform in real time.
- Enable bidirectional control: submit workflows, receive progress, send interrupt signals.
- Handle connection failures gracefully with automatic reconnection.

## 4. User Stories
- As a Creator, I want to see real-time progress bars for my generation jobs so that I know how far along each segment is.
- As a Creator, I want to pause or cancel a running generation from the platform UI so that I don't need to interact with ComfyUI directly.
- As an Admin, I want the bridge to automatically reconnect if a ComfyUI instance restarts so that generation resumes without manual intervention.
- As a Creator, I want to see which ComfyUI node is currently executing so that I understand where time is being spent.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: WebSocket Connection Management
**Description:** Establish and maintain WebSocket connections to configured ComfyUI instances.
**Acceptance Criteria:**
- [ ] Connects to ComfyUI WebSocket endpoint on startup
- [ ] Supports multiple ComfyUI instances (one connection per instance)
- [ ] Automatic reconnection with exponential backoff on connection loss
- [ ] Connection health status exposed to PRD-80 (System Health Page)

#### Requirement 1.2: Progress Synchronization
**Description:** Receive and relay generation progress from ComfyUI to the platform's event system.
**Acceptance Criteria:**
- [ ] Node-level execution progress is received and parsed
- [ ] Overall workflow progress percentage is calculated and emitted
- [ ] Progress events are forwarded to PRD-10 (Event Bus) for UI consumption
- [ ] Preview images (intermediate outputs) are captured and made available

#### Requirement 1.3: Workflow Submission
**Description:** Submit ComfyUI workflow JSON to the appropriate instance for execution.
**Acceptance Criteria:**
- [ ] Workflows are submitted via the ComfyUI API with all required parameters
- [ ] Submission includes a unique job ID for tracking
- [ ] The bridge maps platform job IDs to ComfyUI execution IDs
- [ ] Submission failures return clear error messages

#### Requirement 1.4: Interrupt & Cancel
**Description:** Send interrupt signals to ComfyUI to stop running workflows.
**Acceptance Criteria:**
- [ ] Cancel requests are forwarded to ComfyUI immediately
- [ ] The bridge confirms cancellation was received and the job stopped
- [ ] Partial outputs from cancelled jobs are preserved if available

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Intermediate Latent Viewing
**Description:** Capture and display intermediate latent images from ComfyUI during generation.
**Acceptance Criteria:**
- [ ] Latent previews are captured at configurable intervals during generation
- [ ] Previews are displayed in the Interactive Debugger (PRD-34)

## 6. Non-Goals (Out of Scope)
- ComfyUI installation or configuration (external dependency)
- Workflow design or editing (covered by PRD-33)
- Job scheduling and queue management (covered by PRD-08)
- Worker pool management (covered by PRD-46)

## 7. Design Considerations
- Connection status indicators should be visible in the admin/system UI.
- Progress bars should update smoothly without flickering.
- Network latency between the backend and ComfyUI instances should be accounted for in UI responsiveness expectations.

## 8. Technical Considerations
- **Stack:** Rust (tokio-tungstenite for WebSocket client), ComfyUI API
- **Existing Code to Reuse:** PRD-02 WebSocket infrastructure
- **New Infrastructure Needed:** ComfyUI client module, connection pool/manager, message parser
- **Database Changes:** Connection configuration table (comfyui_instances: url, status, last_connected)
- **API Changes:** Internal APIs for workflow submission and progress relay; no direct user-facing endpoints

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- WebSocket connections stay alive with <1% unexpected disconnection rate
- Progress updates reach the UI within 200ms of ComfyUI emitting them
- Automatic reconnection succeeds within 30 seconds of ComfyUI restart
- Cancel requests are acknowledged by ComfyUI within 2 seconds

## 11. Open Questions
- Should the bridge maintain a persistent connection or connect on-demand per job?
- How should the bridge handle ComfyUI version differences in the WebSocket protocol?
- Should intermediate outputs (preview images) be stored temporarily or streamed directly?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
