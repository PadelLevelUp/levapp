# classes — Lessons & Instances

## What this is

The classes domain.

## What it covers

- `classes.create` — implemented
- `classes.edit` — implemented
- `classes.delete` — implemented
- `classes.instances` — implemented
- `classes.enrollment` — implemented
- `classes.instance-enrollment` — implemented
- `classes.coach-assignment` — implemented
- `classes.recurrence` — implemented
- `classes.detail-visibility` — implemented
- `classes.join-requests` — draft
- `classes.class-requests` — implemented (PAD-104: a student books a class in the coach's free time; PAD-357 adds people and a weekly recurrence)
- `classes.availability` — draft (PAD-357: the one free-slot computation — pure module in `packages/config` + `GET /app/availability` — shared by web and iOS)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/classes/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
