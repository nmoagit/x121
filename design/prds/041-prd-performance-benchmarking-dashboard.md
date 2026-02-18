# PRD-041: Performance & Benchmarking Dashboard

## 1. Introduction/Overview
Admins need to identify "expensive" or "low-quality" workflows to optimize resource allocation. This PRD provides a performance dashboard reporting on time-per-frame, VRAM peaks, likeness scores, and other generation quality metrics — enabling data-driven decisions about which workflows, scene types, and parameters deliver the best quality-to-cost ratio.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for metric collection)
- **Depended on by:** PRD-61 (Cost Estimation uses performance data), PRD-64 (Failure Pattern Tracking), PRD-73 (Production Reporting aggregates)
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Report time-per-frame, GPU time, and VRAM peaks per workflow and scene type.
- Track likeness scores and quality metrics trends over time.
- Enable comparison of performance across different workflows, parameters, and workers.
- Help Admins identify optimization opportunities and resource bottlenecks.

## 4. User Stories
- As an Admin, I want time-per-frame reports per workflow so that I can identify which workflows are most expensive.
- As an Admin, I want VRAM peak tracking so that I can right-size worker GPU allocation.
- As a Creator, I want likeness score trends so that I can see if my parameter tuning is improving quality over time.
- As an Admin, I want worker comparison so that I can identify underperforming hardware.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Generation Performance Metrics
**Description:** Core performance data collection and display.
**Acceptance Criteria:**
- [ ] Time-per-frame for each generation job
- [ ] Total GPU time per scene, per character, per project
- [ ] VRAM peak usage per job with alerts when approaching worker limits
- [ ] Pipeline stage breakdown: which nodes consume the most time

#### Requirement 1.2: Quality Metrics Dashboard
**Description:** Quality trends visualization.
**Acceptance Criteria:**
- [ ] Likeness score distribution per workflow
- [ ] Face confidence, motion quality, and boundary SSIM trends over time
- [ ] Correlation between parameters and quality outcomes
- [ ] Top/bottom performers: best and worst generating configurations

#### Requirement 1.3: Workflow Comparison
**Description:** Side-by-side workflow performance comparison.
**Acceptance Criteria:**
- [ ] Compare two or more workflows on speed, quality, and resource usage
- [ ] Highlight trade-offs: "Workflow A is 20% slower but produces 15% higher likeness scores"
- [ ] Historical comparison: same workflow over time (before/after parameter changes)

#### Requirement 1.4: Worker Benchmarking
**Description:** Per-worker performance comparison.
**Acceptance Criteria:**
- [ ] Same job type across different workers: speed comparison
- [ ] Worker utilization: percentage of time generating vs. idle
- [ ] Hardware efficiency ranking

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Predictive Performance
**Description:** Estimate generation time before job submission.
**Acceptance Criteria:**
- [ ] Based on historical data, predict: "This job will take approximately 45 minutes on Worker 2"
- [ ] Confidence interval based on historical variance

## 6. Non-Goals (Out of Scope)
- Cost and resource estimation before generation (covered by PRD-61)
- Production reporting for management (covered by PRD-73)
- GPU hardware monitoring (covered by PRD-06)

## 7. Design Considerations
- Dashboard should use clear, readable charts (not dense data tables).
- Key metrics should have configurable alert thresholds.
- Time-series data should support zoom and date range selection.

## 8. Technical Considerations
- **Stack:** React with charting library (e.g., Recharts, D3), Rust for metric aggregation
- **Existing Code to Reuse:** PRD-10 event bus for metric collection, PRD-06 hardware monitoring data
- **New Infrastructure Needed:** Metric aggregation engine, time-series storage, charting components, benchmark comparison tool
- **Database Changes:** `performance_metrics` table (job_id, workflow_id, worker_id, time_per_frame, gpu_time, vram_peak, quality_scores_json, created_at)
- **API Changes:** GET /performance/overview, GET /performance/workflow/:id, GET /performance/worker/:id, GET /performance/comparison?workflows=id1,id2

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Metric collection adds <1% overhead to generation time
- Dashboard loads in <3 seconds with 30 days of data
- Performance comparisons correctly identify the faster/better workflow in >95% of cases

## 11. Open Questions
- How long should raw per-job metrics be retained before aggregation?
- Should the dashboard support custom metric definitions for studio-specific measurements?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
