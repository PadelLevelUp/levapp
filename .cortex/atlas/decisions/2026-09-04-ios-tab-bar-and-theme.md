---
id: decision.2026-09-04-ios-tab-bar-and-theme
title: Coach tab bar goes to six, iOS stays light-only
date: 2026-09-04T00:00:00Z
---

# Coach tab bar goes to six, iOS stays light-only

PAD-171 filed two open product questions from the PAD-152 parity audit's section 10, explicitly
to avoid the failure mode where a deferral is made verbally and never recorded — `found_issues.md`
#7 had already deferred seven notification-engine sub-panels without writing it down, and the
PAD-152 audit had to rediscover and re-argue it. The owner decided both on 2026-09-04.

## 1. The coach tab bar has seven destinations — Settings comes off it

`apps/mobile/app/(tabs)/_layout.tsx` renders seven tabs for a coach (Dashboard, Calendar, Players,
Presences, Messages, Training, Settings) on a 390pt bar, tighter than the six-tab layout it was
originally tuned for. Web has the same problem as a bottom nav on the commonest phone width
(`AppLayout.tsx:293`, measured 428px of content in a 390px viewport).

**Decision:** Settings leaves the bottom bar / bottom nav on **both** platforms. It is reached
from the account avatar in the header instead — iOS already renders `AccountAvatar` there
(`apps/mobile/app/(tabs)/_layout.tsx`), so this is a no-op for iOS beyond removing the redundant
tab. Web adds the avatar entry point in PAD-183 (this wave, alongside fixing the overflow). iOS
dropped the tab in PAD-193, taking the coach bar from seven destinations to six — matching the
six-tab layout the label sizing was originally tuned for (the sizing was therefore kept, not
relaxed). Two things the "no-op for iOS" phrasing above under-counted: `AccountAvatar` was
decorative and had to become a control, and it was rendered only on the Dashboard header, so it
moved into `screenOptions` to appear on every tab — otherwise Settings would have been reachable
from one tab only. The screen itself moved out of the tab group to `apps/mobile/app/settings.tsx`
and is pushed onto the root stack (the `/settings` route, deep links and the drill-in sections are
unchanged; the push also gives it a native back button).

No dev spec governs the main app's tab-bar/sidebar structure as a capability (it isn't a domain in
`.specflow/specs/`), so this decision is recorded here rather than in a leaf spec. The nearest
spec touchpoints are `settings.role-scope` (which already discusses how Settings is reached) and
its business counterpart — both carry a pointer back to this file.

## 2. iOS has no dark theme — recorded as an intentional divergence

`apps/mobile/tailwind.config.js` hardcodes `colors: nativewindTheme("light")`; web has a working
dark palette (`darkMode: ["class"]`, fixed by PAD-57). An iPhone set to dark mode still gets the
light app.

**Decision:** light-only on iOS, recorded as an intentional divergence (`[DIV]`). Web keeps dark
mode. Revisit only on user demand — building it properly would mean every hardcoded
`lightTheme.*` reference in `apps/mobile` becoming scheme-aware, which is real scope, not a
toggle flip.

## Why record it here

Neither decision has a natural home in `.specflow/specs/` — there is no `navigation` or `theme`
domain — so treating this as unmapped and letting it live only in a closed Linear ticket is
exactly how PAD-171 predicted a future audit would have to rediscover it. This file is that
record; the settings specs above link to it for anyone reading Settings-adjacent specs who
wonders why the tab bar and the theme toggle behave the way they do.
