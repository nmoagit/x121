# PRD-064: Failure Pattern Tracking & Insights

## 1. Introduction/Overview
Quality gate data (PRD-49) is valuable for individual segments, but the real value is in aggregate patterns. Without pattern tracking, the same failures repeat across creators and projects. This PRD turns failure data into institutional knowledge by correlating quality gate failures with generation parameters to surface recurring patterns, with actionable alerts and root cause linking.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-17 (Asset Registry), PRD-41 (Performance Dashboard), PRD-49 (Quality Gates)
- **Depended on by:** PRD-71 (Smart Auto-Retry)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Correlate quality failures with workflow/model/LoRA/character/segment-position combinations.
- Surface failure heatmaps and trends to identify problematic configurations.
- Provide actionable alerts when historically problematic combinations are used.
- Link discovered fixes to failure patterns for institutional learning.

## 4. User Stories
- As a Creator, I want to see which LoRA/character combinations have high failure rates so that I avoid known bad configurations.
- As a Creator, I want a warning when I'm about to use a historically problematic combination so that I can consider alternatives.
- As an Admin, I want failure trend tracking so that I can see if a model update improved or degraded quality.
- As a Creator, I want to record fixes for recurring issues so that the next person doesn't hit the same problem.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Failure Correlation
**Description:** Track which parameter combinations produce failures.
**Acceptance Criteria:**
- [ ] Correlate failures with: workflow, model, LoRA, character, scene type, segment position
- [ ] Surface patterns: "LoRA X + Character Y fails at segment 6+"
- [ ] Statistical significance: only surface patterns with enough data points

#### Requirement 1.2: Failure Heatmap
**Description:** Visual matrix of failure rates.
**Acceptance Criteria:**
- [ ] Matrix views: scene type x character, LoRA x segment position
- [ ] Color-coded cells: green (low failure) to red (high failure)
- [ ] Clickable cells to see specific failures

#### Requirement 1.3: Trend Tracking
**Description:** Monitor failure rates over time.
**Acceptance Criteria:**
- [ ] Detect regressions after model/workflow updates
- [ ] Detect improvements from configuration changes
- [ ] Time-series chart of failure rates

#### Requirement 1.4: Actionable Alerts
**Description:** Warn before using problematic combinations.
**Acceptance Criteria:**
- [ ] Alert on scene configuration when a known-bad combination is used
- [ ] Suggest alternatives: "Consider using LoRA Y instead"
- [ ] Alert severity based on historical failure rate

#### Requirement 1.5: Root Cause Linking
**Description:** Record fixes and link to failure patterns.
**Acceptance Criteria:**
- [ ] When a fix is found, record it in PRD-17 compatibility notes
- [ ] Link the fix to the failure pattern
- [ ] Future alerts for the same pattern include the known fix

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Predictive Failure Analysis
**Description:** Predict likely failures before generation starts.
**Acceptance Criteria:**
- [ ] Use historical data to estimate failure probability for a new job

## 6. Non-Goals (Out of Scope)
- Individual segment quality assessment (covered by PRD-49)
- Custom QA rulesets (covered by PRD-91)

## 7. Design Considerations
- Heatmaps should be interactive with drill-down capability.
- Alerts should be non-blocking but prominent.

## 8. Technical Considerations
- **Stack:** Rust for correlation analysis, React for heatmap visualization
- **Existing Code to Reuse:** PRD-49 quality data, PRD-17 asset data
- **New Infrastructure Needed:** Pattern correlation engine, trend analyzer, alert service
- **Database Changes:** `failure_patterns` table, `pattern_fixes` table
- **API Changes:** GET /analytics/failure-patterns, GET /analytics/failure-heatmap

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Pattern detection identifies recurring failures within 24 hours of accumulating sufficient data
- Actionable alerts reduce repeat failures by >30%
- Root cause linking captures fixes for >50% of identified patterns

## 11. Open Questions
- What minimum sample size constitutes a statistically significant pattern?
- Should pattern alerts be per-user or global?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
