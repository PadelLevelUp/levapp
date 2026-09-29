---
id: B-223
title: "iOS student dashboard: rows appearing above \"Your record\" after the first layout collapsed its four tiles to empty strips"
type: missing-criterion
severity: high
status: resolved
affects:
  - dashboard.blocks
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
opened: 2026-09-29T16:02:24Z
resolved: 2026-09-29T16:02:24Z
proposed_fix: "The card inside each KPI tile grows from its content (grow) instead of taking flex-1 (flexBasis 0%)."
---

# B-223: the student's record tiles collapsed when rows appeared above them (PAD-438)

**Source:** the owner's report (a student's iPhone, 24/09): the "O TEU REGISTO" cards showed as empty white rectangles stacked together, with the "AVALIAÇÕES / Ver todas" header over them. It was intermittent and frequent. Reproduced by Session-B on the iOS 26.5 simulator.

**What happens:** on iOS, when a block above "Your record" grows or mounts AFTER the dashboard's first layout, the KPI tiles collapse. Examples: a class the coach just added showing up after a refresh, a claim-request banner whose query resolves after the dashboard, a new ask. Each card becomes a 30 px strip (its padding and border) with 0 px text, and the heading below moves up over it. When the page above shrinks again, the block reports its full height, but the cards stay drawn collapsed over an empty gap.

**What should happen:** the four tiles keep their label, number and context at full height, whatever changes above them.

**Root cause (reproduced):** each tile is a `flex-1` cell in a `flex-row`. The card inside it was also `flex-1`, which css-interop 0.2.6 compiles to `{flexGrow: 1, flexShrink: 1, flexBasis: "0%"}`, inside a column cell whose height comes only from the row. The coach's `Stat` cards sit in the row directly and were never reported. Rule 3a stated the design, but no criterion covered a layout change above the record. A Yoga 3.2.1 model without Fabric did NOT reproduce it (it modelled a sibling growing, with fixed text measures), so it is not predictive here.

**Evidence** (simulator F2F33A0A, iOS 26.5, D's debug client; JS from staging aa13a5b2; a scratch onLayout logger, never committed; the frames and screenshots are in the session's local handoff folder):

| | rows appear above | nothing above changes |
|---|---|---|
| old card (`flex-1`) | collapsed 6/6 (claim banner 3/3, coach adds a class + refresh 3/3) | healthy (first open, tab return ×3, pull-to-refresh ×3, cold launch ×3) |
| new card (`grow`) | healthy 5/5 | healthy |

- Frames, old card:
  - healthy: block 230 px, rows and cards 99, value text 28;
  - on the insert, in one pass: block 32 (banner) or 131 (class), rows and wrappers 0, cards 30, texts 0.
- Native hierarchy in the bad state: the collapsed tiles drop out of it. That is what flow 116 asserts.
- Flow 116 (committed): red 3/3 on the old card (`dashboard-kpi-attended` never visible; the screenshot is the owner's picture), green 3/3 on the new one.
- `kpi-tiles.layout.test.tsx`: red on the old card, green on the new one.

### Change plan
- Spec: `dashboard.blocks` rule 3a clause (PAD-438, B-223) and the criterion "The student's record keeps its layout when rows appear above it".
- Code: `KpiTiles` card `flex-1` becomes `grow` (flexGrow, basis auto). Equal heights in a row are kept.
- Tests: `kpi-tiles.layout.test.tsx` (structure pin) and Maestro flow 116 (the trigger end to end).
- iOS only: web lays the grid out in the browser, where it never collapsed.

### Resolution
- Spec: `.specflow/specs/dashboard/blocks.spec.md` rule 3a clause and the criterion above.
- Tests: `frontend/apps/mobile/src/features/dashboard/kpi-tiles.layout.test.tsx`; `.maestro/flows/116-student-record-keeps-its-layout.yaml` with `scripts/record-layout-{setup,insert,teardown}.js`.
- Code: `frontend/apps/mobile/src/features/dashboard/blocks.tsx` (`KpiTiles`).
- Not verified: a Release build and the owner's device (text size, build); the simulator ran a debug client.
- Resolved: 2026-09-29T16:02:24Z
