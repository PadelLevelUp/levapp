# Developer specs

## What this is

The developer spec tree — the implementation contract for LevApp. Each leaf spec defines one
behaviour with entities, rules, and Given/When/Then acceptance criteria.

## What it covers

15 domains, 91 leaf specs (1 deprecated), migrated 2026-09-03 from the legacy `specs/` tree (one file per domain).

## Why it's grouped this way

One folder per product domain (auth, players, classes, …) so every behaviour has exactly one home
and cross-domain dependencies stay explicit in `depends_on`. Capability sub-folders are introduced
only when a domain outgrows a flat list.
