---
id: B-217
title: "Maestro goto-seeded-monday depended on the calendar's remembered view mode (a Mês run left no next-week control)"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/mobile/.maestro/subflows/goto-seeded-monday.yaml
proposed_fix: "When calendar-next-week is not on screen (a leftover Mês), the subflow switches to the week view itself."
opened: 2026-09-26T11:23:37Z
resolved: 2026-09-26T11:23:37Z
---

# B-217: goto-seeded-monday depended on the remembered view mode

**Source:** Session-B while running flows 03 and 115 for PAD-463 (2026-09-26).

**What happens:** flow 03 failed twice in `goto-seeded-monday` with "Tap on id: calendar-next-week... FAILED" when it ran after flow 32 (Mês). The calendar keeps its view mode across launches, and in Mês or Semana the day strip's `calendar-next-week` isn't there. Fourteen flows use the subflow: 03, 04, 05, 14, 15, 16, 21, 31, 52, 53, 93, 94, 96 and 117.

**Root cause (observed):** a scratch flow showed `calendar-next-week` missing, then visible again after tapping `calendar-view-day`; flow 03 then passed. The subflow assumed the day view, which holds only when `config.yaml`'s order runs it before any view-switching flow. Type 7, the test.

### Resolution
- When `calendar-next-week` is not on screen (Mês), the subflow switches to the week view, the one the view-switching flows restore (flow 117's note). It's conditional: a first version tapped Dia every time and broke flow 31, which picks Semana itself and expects its grid afterwards. Every role sees the view control, so the student flow (14) is covered.
- Verified on the simulator (see the PR): with Mês left over, the old subflow fails and the new one passes.
- Resolved: 2026-09-26T11:23:37Z
