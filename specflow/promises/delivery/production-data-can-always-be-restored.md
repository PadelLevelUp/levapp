---
id: P-DELIVERY-8
title: "Production data can always be restored from a backup"
status: draft
---
# Production data can always be restored from a backup

## Outcome

Every night the production server copies its databases to a bucket, and the owner can prove at any time that the newest copy restores. A backup that fails says so instead of leaving a half-written copy (owner decision 2026-11-10).

- Each database is copied every night, and old copies are removed after the retention period.
- A failed backup is reported to the owner and leaves nothing partial behind.
- The newest copy can be restored into a scratch database and checked on demand.
- Deploying the server installs the nightly job; a deploy that cannot leave it installed fails.

It does not promise a backup of anything outside the databases, or restoring into production itself, which the owner does by hand.
