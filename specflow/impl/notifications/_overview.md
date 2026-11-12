# notifications — Notification Engine

## What this is

The notifications domain.

## What it covers

- `notifications.config` — implemented
- `notifications.reminders` — implemented
- `notifications.invitations` — implemented
- `notifications.semi-auto-approval` — draft
- `notifications.manual` — implemented
- `notifications.waiting-list` — implemented
- `notifications.activity` — implemented
- `notifications.toggle-class` — implemented
- `notifications.class-reminders-manual` — implemented
- `notifications.groups` — implemented
- `notifications.message-templates` — implemented
- `notifications.student-block-preferences` — implemented
- `notifications.request-alerts` — implemented (PAD-232): push + email for club join, claim and coach-approval requests, per-user opt-out
- `notifications.notification-sound` — implementing (PAD-680): a sound for a new message or system
  notification while the app is open, web and iOS, with one per-user switch
- `notifications.invite-simulation` — implemented — read-only dry run of the engine for a hypothetical
  vacancy, stage-tagged so it can explain who is invited and why; feeds `settings.tutorials`
- The redesigned engine (PAD-899, plan `docs/plans/invitation-engine-redesign.md`), all draft until
  it ships; the rules of `notifications.invitations` and `notifications.waiting-list` it replaces
  are marked in those specs:
  - `notifications.engine-spots` — spot types counted from capacity and the students going (D2, D3,
    D18, D19)
  - `notifications.engine-tiers` — gates, tiers and ordering read off the coach's settings (D12,
    D13, D15)
  - `notifications.engine-planning` — one planning run: cover, top up, X, M, D17, offers, never
    revoked (D1, D4, D5, D9, D10, D11, D16, D17, D20)
  - `notifications.engine-answers` — Yes within the offer, re-offer, "sorry", the last spot (D6, D7,
    D20)
  - `notifications.engine-timeline` — the session's timeline, quiet hours and the clock T (§8, D14)
  - `notifications.engine-settings` — X, M, T per tier and the scenario suite's coach rules, each
    defaulting to the plan
  - `notifications.engine-store` — the table store: each effect written once, each message sent once
    (PAD-916)
  - `constants.md` — the facts the engine and the scenario suite share

### Engine waves

One order across the six engine leaves; each leaf's Waves list names its criteria by these labels.
A criterion pinned by a scenario file passes once every wave before its own has landed; its own wave
is where its code goes.

1. **W1** — counts and shapes: spots' counts (`planner.py`); timing settings, the floor and Method B's
   parts (`settings.py`); the counting-until field on `effects.Invited` / `snapshot.Invitation`, with
   `store.py` and `adapters/new.py` (shared-module changes, agreed with their owners).
2. **W2** — tiers, gates and the basic run: tiers and ordering, cover and top-up, naming, one
   invitation per student, the window (`planner.py`); the snapshot's `busy_same_time` and `postponed`.
3. **W3** — answers: placement within the offer, refusals (`answers.py`).
4. **W4** — the clock: counting, quiet hours (`timeline.py`).
5. **W5** — D17 and M: hardest first, ideal tier, offers, budgets, D10, the tie rule (`planner.py`).
6. **W6** — sorry and re-offer, the last spot (`answers.py`, `planner.py`); `sorry` logged as `aviso`
   (`adapters/new.py`).
7. **W7** — timeline duties and coach surfaces: `last_invite_at` sides and `side_moved`, absences, the
   coach alert, per-tier and Method B timing, other-side tiers; the scenario pins of spots and tiers.
8. **W8** — the scenario suite's coach rules: automatic entry, side-bound lists, direct join; last, the
   defaults-are-the-plan run.
9. **Swap** — not in PAD-899: the simulation on the engine's evaluator, a table-backed store, tier
   criteria and the stored-config mapping.

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/notifications/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
