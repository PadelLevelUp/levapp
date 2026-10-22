---
id: B-601
title: "Mobile: the react-query cache survives logout, so the next account on the device reads the previous account's auth-me and data for up to 60 s"
type: incomplete-rule
severity: high
status: open
affects:
  - frontend/apps/mobile/src/auth/AuthContext.tsx
  - frontend/apps/mobile/app/settings.tsx
  - frontend/packages/hooks/src/queryDefaults.ts
proposed_fix: "Clear the query cache on sign-out (queryClient.clear() in logout, before router.replace('/login')) and on sign-in as a different user; unit test that a cached auth-me is gone after logout; check web."
opened: 2026-10-21T21:34:00Z
---

# B-601: the query cache survives logout (id unconfirmed, wave 16 range)

**Source:** Android nightly lane run 39666441295 (PR #746 shards, 2026-10-21). Flows `87`, `105` and
`128` failed on missing coach Settings rows (`settings-nav-calendar`, `settings-nav-notifications`,
`settings-evaluation-reminder`).

**What happened:**
- Each failure was a coach opening Settings shortly after a student session on the same device
  (flows 86, 113 and 116 ran just before).
- The screen tree held the student's section list, and flask.log shows no `/auth/me` refetch.

**Root cause:**
- `app/settings.tsx:160-164` takes `isCoach` from `useQuery(["auth-me"])`.
- The default staleTime is 60 s (`QUERY_STALE_TIME_MS`).
- `logout()` (`AuthContext.tsx:181-203`) never clears the query cache.
- Every cached query can be served to the next account within the window. That makes it a privacy
  issue on shared phones. iOS shares the code. Web is unverified.

**Ticket:** PAD-716 (assigned to wave 16 Session E).
