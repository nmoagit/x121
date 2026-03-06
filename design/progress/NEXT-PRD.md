# Next PRD To Implement

Auto-updated after each PRD completion. Check this file to know what to work on next.

## Current Status

**All 127 PRDs are complete.** The platform is feature-complete at the PRD level.

The remaining work is:
- **Pipeline integration** — wiring the Rust pipeline/worker crates to ComfyUI for live video generation
- **Deferred work** — porting `fix_metadata.py` (2,870 lines) from Python to native Rust (`core::metadata_transform`)
- **End-to-end testing** — integration testing across the full generation workflow

## Completed PRDs (127)

All PRDs from PRD-00 through PRD-126 are implemented. See [`PRD-STATUS.md`](./PRD-STATUS.md) for details on each.

| Phase | PRDs | Status |
|-------|------|--------|
| Phase -1 | Scaffolding | Done |
| Phase 0 | PRD-00, 02, 29 | Done |
| Phase 1 | PRD-01, 05, 06, 09, 10, 83 | Done |
| Phase 2 | PRD-03, 07, 14, 15, 17, 22, 47, 109, 111, 113, 116, 30, 32, 36, 37, 52, 110, 112, 117, 41, 42, 54, 85, 118 | Done |
| Phase 3 | PRD-04, 08, 11, 12, 28, 45, 13, 16, 20, 21, 66, 33, 35, 44, 53 | Done |
| Phase 4 | PRD-23, 46, 76, 48, 51, 60, 31, 34, 38 | Done |
| Phase 5 | PRD-24, 27, 39, 49, 43, 56, 79, 104, 114 | Done |
| Phase 6 | PRD-57, 25, 26, 58, 59, 61, 62, 69, 78 | Done |
| Phase 7 | PRD-63, 75, 77, 74, 64, 50, 70, 95, 115 | Done |
| Phase 8 | PRD-67, 88, 86, 107, 108, 18, 124, 125 | Done |
| Phase 9 | PRD-71, 91, 100, 68, 96, 101, 82, 65 | Done |
| Phase 10 | PRD-73, 94, 103, 102, 40, 84, 72, 92 | Done |
| Phase 11 | PRD-87, 90, 93, 97, 119, 80, 98, 19, 99, 106 | Done |
| Phase 12 | PRD-81, 55, 89, 105, 126 | Done |
| Standalone | PRD-120, 121, 122, 123 | Done |

## Deferred Work (Non-PRD)

| Item | Priority | Description |
|------|----------|-------------|
| Port fix_metadata.py to Rust | Medium | Port 2,870-line Python script to `core::metadata_transform`. Currently shells out to Python subprocess. |
| Pipeline end-to-end testing | High | Full generation loop with real ComfyUI instance — seed upload, workflow submission, output download, segment stitching |

---

*Last updated: 2026-03-06*
