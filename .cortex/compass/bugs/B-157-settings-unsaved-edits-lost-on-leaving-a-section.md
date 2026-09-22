---
id: B-157
title: "Leaving a Settings section silently dropped its unsaved edits (web and iOS)"
type: missing-criterion
severity: low
status: open
affects:
  - settings.unsaved-edits
  - frontend/apps/web/src/pages/SettingsPage.tsx
  - frontend/apps/mobile/app/settings.tsx
proposed_fix: "Each explicit-save section reports whether it differs from its last loaded/saved value; the page asks 'Descartar alterações?' before switching tab (web) or leaving via the back row (iOS); web adds beforeunload while any section is unsaved."
opened: 2026-09-21T21:13:53Z
---

# B-157 — an unsaved Settings edit vanished when the user moved to another section

**Source:** Session D, read from the code while looking for a no-timing repro of PAD-392 (B-155),
2026-09-21; filed as PAD-394. Id reserved by Session D that day and cited in B-155.

**What happens:** both shells show ONE Settings section at a time. Web renders each tab
conditionally (`SettingsPage.tsx` `{activeTab === "…" && …}`, :472–762 at staging `8dc17185d`);
iOS renders `renderSection(openId)` and its back row sets `openId` to null (`app/settings.tsx`
:246, :259). Leaving a section unmounts it, and a section with an explicit Save keeps its edits in
local state — so the edits are discarded with no warning and nothing on return.

**Reach (verified by reading, 2026-09-22):** explicit-save sections on both shells — profile,
coach levels, seasons, working hours, student notification blocks; web also message templates.
Save-on-change sections (language, theme, request alerts, notification engine / auto-invite) lose
nothing. No section warned; no `beforeunload`/`useBlocker` anywhere in Settings.

**Why it matters:** to the user it is indistinguishable from B-155 (a late load undoing an edit):
"my edit silently disappeared".

**Missing criterion:** no spec said what leaving a section with unsaved edits should do. Decided
(PAD-394, coordinator for the owner): **warn, not hold** — new leaf `settings.unsaved-edits`.

**Limits kept:** leaving Settings itself through app navigation still drops edits (web
`BrowserRouter` has no blocker; iOS stack back/swipe pops the screen) — named in the leaf's rule 6.
