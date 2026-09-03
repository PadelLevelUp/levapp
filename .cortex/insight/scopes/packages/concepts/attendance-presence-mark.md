---
name: attendance-presence-mark
---

# attendance-presence-mark

The shared model for what a coach records about a player's attendance: the backend stores two columns (`status`: present/absent, `justification`: justified/unjustified), but every UI presents it as one three-way choice (`PresenceMark`). This concept spans the config-level mapping/precedence logic and the API endpoints that read/write it, and is why `attendance.ts` and `absence_history` deliberately share one backend resolver differing only in which `Presence.status` is selected.

**Implementing files:**
- `frontend/packages/config/src/presence-status.ts` — `toMark`/`fromMark` mapping, `effectiveMark` precedence (coach edit > stored > prefill), `undecidedCount`.
- `frontend/packages/api/src/resources/presences.ts` — `confirmClassPresences`/`validateClassPresences` (recording IS validating — no separate validate call), `unvalidateClass`, presence stats/trend/pending-validation reads.
- `frontend/packages/api/src/resources/attendance.ts` — the PAD-114/PAD-141 attended/missed history reads built on the same underlying presence rows.

**Related concepts:** none within this scope.
