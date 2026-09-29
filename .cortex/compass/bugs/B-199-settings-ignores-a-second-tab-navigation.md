---
id: B-199
title: "Web Settings ignores ?tab= after it is mounted: the avatar menu's My connections shows the wrong section"
type: missing-criterion
severity: low
status: resolved
affects:
  - settings.role-scope
  - frontend/apps/web/src/pages/SettingsPage.tsx
proposed_fix: "Follow every navigation to /settings (location.key) through requestTab."
opened: 2026-09-25T14:12:40Z
resolved: 2026-09-25T14:12:40Z
---

# B-199: the avatar menu's "As minhas ligações" opens generic Settings

**Source:** PAD-447 (founder report, desktop, 2026-09-24). The avatar menu's "As minhas ligações" opened the generic Settings page instead of My connections. The id comes from Session-D's range B-196–200.

**What happens:** `SettingsPage` reads `?tab=` once, in its `useState` initializer. The menu navigates with `navigate("/settings?tab=connections")`. From another page that mounts Settings and works. From inside Settings (for example after choosing "Definições" from the same menu) the page stays mounted and the section never changes. The reverse is broken too: "Definições" from inside My connections stays on My connections.

## Evidence
- A new E2E `my-connections.spec.ts` "PAD-447" (isolated stack, staging): Settings via the menu, then My connections via the menu. The URL becomes `/settings?tab=connections`, but `blocked-users` is not found (line 47): red. The first version of the test hit the reverse (after "Definições", `blocked-users` stayed visible).
- The existing PAD-287 test covered only a student arriving from another page, which is why it never saw this.

## Diagnostic tree
1. Dev spec `settings.role-scope`, rule 2 (the menu offers `/settings?tab=connections`). Correct.
2. Criterion: none covered arriving while Settings is already open. **Missing criterion.**

### Resolution
- **Spec:** rule 2 addition, plus two criteria (landing from inside Settings; the unsaved-edit question still asked).
- **Code:** `SettingsPage` follows `location.key`. Each later navigation re-reads `?tab=` (none means Preferences) and goes through `requestTab`, so rule 3's question still guards an unsaved edit. The first render is skipped, because the initial state already read the URL.
- **Tests:**
  - "PAD-447" E2E: red on staging, green on the fix. It needed a rerun alone: under a load average of about 600 the first run hit the 180 s test budget.
  - `unsaved-edits.spec.ts` "PAD-447": the menu with an unsaved edit asks. A mutant that calls `setTab` directly (skipping `requestTab`) turns it red.
- **iOS:** no menu item. The initials open Settings, where the section is in the list (role-scope rule 2), so there is no iOS change.
