---
id: B-725
title: "A PAD-782 test minted its invite link at a pinned 30 Oct but accepted it on the real clock, so it failed on every branch from 6 Nov, when the 7-day link expired in real time"
type: test-defect
severity: medium
status: resolved
affects:
  - auth.password-recovery
  - players.invite-completion
  - backend/padel_app/tests/test_pad782_passwordless_recovery_help_mail.py
  - backend/padel_app/services/player_invitation_service.py
  - R-023
proposed_fix: "Pin the clock to T0 around the accept call, and read the invitation clock through utcnow_naive() (R-023) so the pin reaches the expiry check."
opened: 2026-11-10T20:05:00Z
resolved: 2026-11-10T20:30:00Z
---

# B-725: the PAD-782 fresh-link test expired on the real clock

**Source:** Linear PAD-852 (coordinator, 2026-11-10). The failure blocked the backend CI on every branch.

**What happened:** `test_the_fresh_link_completes_the_account` asked for recovery at a pinned
`T0 = 2026-10-30 10:00`, which minted an invitation expiring at `T0 + 7 days` (6 Nov 10:00). It then
accepted the link through the HTTP route, which takes no `now`. The expiry check read the real
clock, so from 2026-11-06 the accept answered 410 `{'error': 'Invitation is expired'}`.

**What should happen:** the test checks rule 5b's fresh link at one instant. The link must be valid
at that instant, on any date.

**Root cause:** the test mixed a pinned instant (the mint) with the real clock (the accept), so it
was a test-defect. Pinning alone could not fix it: `player_invitation_service.py` read
`datetime.utcnow()` directly, which `pin_clock` cannot reach, at line 46 (`expires_at` for a recovery
link), line 87 (`expires_at` for a new incomplete player) and line 101 (the expiry check). R-023
already requires `expires_at` to be written and compared with `utcnow_naive()`.

**Evidence:** on origin/staging `f86ff4007`, the file failed 1 of 14 on the real clock
(2026-11-10). A 2x2 with the genuine clock faked to 2027-01-01 (`utcnow_naive()` = 2027-01-01
10:00, shown in the pytest header) gave: fixed service + fixed test 14 passed; fixed service +
staging test, staging service + fixed test, and staging both each 1 failed with the same 410. Both
halves are needed.

### Resolution
- **Spec:** none. players.invite-completion rule 7 and auth.password-recovery rule 5b are right.
- **Code:** the three sites now read `utcnow_naive()`. Production gets the same instant, so behaviour
  is unchanged.
- **Test:** `pin_clock(monkeypatch, T0)` before the accept call. A grep of the accept path (route,
  service, registration validators) finds no direct `datetime.utcnow()`, `datetime.now()` or
  `date.today()` left. The access token's issue time is the one other clock on the path, and nothing
  compares it with the invitation.
- Resolved: 2026-11-10 (PAD-852).
