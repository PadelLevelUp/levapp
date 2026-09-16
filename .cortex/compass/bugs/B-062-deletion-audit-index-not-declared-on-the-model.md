---
id: B-062
title: "deletion_audit index created by the migration but not declared on the model: the drift gate blocked the batch-3 backend deploy"
type: incomplete-rule
severity: high
status: resolved
affects:
  - backend/padel_app/models/deletion_audit.py
  - backend/migrations/versions/76395824b9cf_pad274_deletion_audit_and_cascades.py
  - .github/workflows/deploy-staging.yaml
proposed_fix: "Declare Index('ix_deletion_audit_entity', 'entity', 'entity_id') in DeletionAudit.__table_args__ so flask db check sees the schema the migration built; run flask db check on a migrated DB as a batch gate and in the Postgres backend-tests job (PAD-299)."
opened: 2026-09-11T18:33:00Z
---

# B-062 — deletion_audit index created by the migration but not declared on the model

**Source:** deploy-staging run 34633821427 for the batch-3 merge (#221, staging db51ca82d),
2026-09-11 18:33. Session E, batch 3.

**What happened:** PAD-274's migration (`76395824b9cf`) creates `ix_deletion_audit_entity` on
`deletion_audit (entity, entity_id)`. The `DeletionAudit` model declared no such index, so the
deploy's drift gate (`flask db check`, PAD-220) saw a schema the models do not describe and failed
with `New upgrade operations detected: remove_index ix_deletion_audit_entity`. The backend job was
skipped; the frontend job deployed; `sync-db` restarted the previous backend image. Staging stayed
healthy (200) on the #201 backend with the batch-3 frontend until the fix landed.

**Why nothing caught it before the deploy:** neither PR CI job (`pytest sqlite`, `pytest postgres,
real migrations`) runs `flask db check`; the batch's own gates (unit suites, four E2E shards, a data
dry run with upgrade / downgrade / upgrade) all exercised the migration and passed. Only the deploy
workflow runs the drift gate.

**Rule (incomplete):** every index, constraint or column a migration creates is declared on the
model, and `flask db check` on a migrated Postgres DB is part of the gate before a batch merges.

**Fix:** the index is declared in `DeletionAudit.__table_args__` (one line). Verified with
`flask db check` on a migrated shard DB ("No new upgrade operations detected") and the 17 PAD-274
tests. Follow-up PAD-299 adds `flask db check` to the Postgres backend-tests job so every PR is
re-checked; Session E's batch checklist gains the same step.
