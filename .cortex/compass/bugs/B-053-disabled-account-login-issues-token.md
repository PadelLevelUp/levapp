---
id: B-053
title: "Login signs in a disabled account: POST /api/auth/login issues a token and the legacy /auth/login opens a session"
type: incomplete-rule
severity: high
status: fixed
affects:
  - auth.login
  - backend/padel_app/modules/api_auth.py
  - backend/padel_app/modules/auth.py
proposed_fix: "After the credentials check, refuse status=disabled: keep PAD-233's 403 COACH_REJECTED for a rejected coach, answer 401 ACCOUNT_DISABLED for any other disabled account, and make the legacy login refuse every disabled account."
opened: 2026-09-10T00:00:00Z
resolved: 2026-09-10T00:00:00Z
---

# B-053 — Login signs in a disabled account

**Root cause.** Neither login route reads `users.status`. `status = disabled` is what account
deletion (App Store 5.1.1(v), `delete_account_service`), a guardian's withdrawal (PAD-198) and a
coach rejection (PAD-233) all rely on. With the right password, `POST /api/auth/login` still issued
an access token. The JWT blocklist loader refused that token on the next request, so the app
bounced, but a caller got a signed token for a deleted account. The legacy server-rendered
`/auth/login` called `login_user` and opened a Flask-Login session with no check at all.
Confirmed on staging 96560cc6 by Session C (relayed by the coordinator, 2026-09-10).

**Fix (2026-09-10).** `auth.login` rule 12. Wrong credentials are still the ordinary 401 first, so
nothing leaks to a guesser. A rejected coach keeps PAD-233's 403 `COACH_REJECTED` with the reason,
because that answer drives their re-application button. Any other disabled account, of either role,
gets 401 `{"error": "ACCOUNT_DISABLED"}` and no token. The legacy login refuses every disabled
account, rejected coaches included since it has no re-application flow, with HTTP 401 and no
session. Tests: `backend/padel_app/tests/test_disabled_login.py`.
