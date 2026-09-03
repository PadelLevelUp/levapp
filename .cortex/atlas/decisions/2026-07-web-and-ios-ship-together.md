---
id: decision.2026-07-web-and-ios-ship-together
title: Web and iOS ship together
date: 2026-07-10T00:00:00Z
compass_rules:
  - R-024
---

# Web and iOS ship together

In July 2026, after the mobile app reached feature parity (the `feature/mobile-web-parity` work),
the owner made parity the default: anything added to the web app is added to the iOS app in the
same ticket unless there is a structural reason (a capability iOS lacks, an authoring surface no
coach would use on a phone). Two tickets — `attendance.history` (PAD-114) and the Presences tab
(PAD-140) — shipped web-only without a recorded decision, which is the failure mode the rule
exists to stop. See `frontend/CLAUDE.md` for the porting checklist.
