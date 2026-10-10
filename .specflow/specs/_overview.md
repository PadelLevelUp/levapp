# Developer specs

## What this is

The developer spec tree — the implementation contract for LevApp. Each leaf spec defines one
behaviour with entities, rules, and Given/When/Then acceptance criteria.

## What it covers

19 domains, 136 leaf specs (recounted 2026-10-10, when `client/` was added for the query-cache policy, PAD-586/PAD-592, after `admin.phone-console` PAD-572; `admin/` added 2026-10-06 for the staff console, PAD-530 — the earlier "16 domains, 92 leaves" dated from the migration; `mobile/` added 2026-09-11 for the Android runtime, PAD-298), migrated 2026-09-03 from the legacy `specs/` tree (one file per domain).

## Why it's grouped this way

One folder per product domain (auth, players, classes, …) so every behaviour has exactly one home
and cross-domain dependencies stay explicit in `depends_on`. Capability sub-folders are introduced
only when a domain outgrows a flat list.
