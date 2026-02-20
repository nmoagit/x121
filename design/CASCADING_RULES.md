# Cascading Rules — ON DELETE / ON UPDATE Reference

Decision guide for choosing the correct referential action on every foreign key in the Trulience schema.

---

## Decision Table

| Relationship Type | ON DELETE | ON UPDATE | Example |
|-------------------|-----------|-----------|---------|
| **Parent owns children** — child cannot exist without parent | `CASCADE` | `CASCADE` | scenes → project, segments → scene |
| **Lookup/status reference** — referenced row should never be deleted while in use | `RESTRICT` | `CASCADE` | jobs.status_id → job_statuses |
| **Optional reference** — link can be cleared without deleting the referencing row | `SET NULL` | `CASCADE` | jobs.assigned_worker_id → workers |
| **Audit/history reference** — keep the referencing row even if referenced row is deleted | `SET NULL` | `CASCADE` | audit_logs.user_id → users |

---

## Decision Tree

```
Is the FK column nullable?
├── YES → SET NULL (clearing the reference is safe)
└── NO → Is the child meaningless without the parent?
    ├── YES → CASCADE (delete children with parent)
    └── NO → RESTRICT (prevent deletion while referenced)
```

---

## Rules

1. **Every FK must specify ON DELETE explicitly.** Never rely on the default (`NO ACTION`). Explicit rules prevent accidental data loss and make intent clear in migrations.

2. **ON UPDATE is always CASCADE.** If a PK changes (rare with BIGSERIAL), FKs should follow. This is a safety net, not a design pattern.

3. **CASCADE deletes require application-level confirmation.** When a user deletes a project (which cascades to scenes → segments → jobs), the API must show a confirmation dialog listing what will be affected. Never cascade silently.

4. **RESTRICT on lookup tables.** Status and type lookup tables should never have rows deleted while any entity references them. Use RESTRICT to enforce this at the database level.

5. **SET NULL for optional associations.** If a worker goes offline and is removed, jobs should retain their history but lose the worker reference. Use SET NULL with a nullable FK column.

---

## Platform-Specific Decisions

| FK Relationship | ON DELETE | Rationale |
|----------------|-----------|-----------|
| `scenes.project_id → projects` | CASCADE | Scene belongs to project, meaningless alone |
| `segments.scene_id → scenes` | CASCADE | Segment belongs to scene |
| `jobs.status_id → job_statuses` | RESTRICT | Cannot delete a status while jobs reference it |
| `jobs.worker_id → workers` | SET NULL | Worker can be decommissioned |
| `characters.project_id → projects` | CASCADE | Character belongs to project |
| `scenes.scene_type_id → scene_types` | RESTRICT | Cannot delete a type while scenes use it |
| `users.role_id → roles` | RESTRICT | Cannot delete a role while users hold it |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-20 | Initial cascading rules document (PRD-00) |
