---
id: B-034
title: "Anyone can activate, rename and set the password of any inactive account by its sequential id"
type: incomplete-rule
severity: critical
status: triaged
affects:
  - auth.activate
  - backend/padel_app/modules/frontend_api.py
  - backend/padel_app/services/user_service.py
  - frontend/apps/web/src/pages/RegisterPage.tsx
  - frontend/apps/mobile/src/features/auth/RegisterScreen.tsx
proposed_fix: "The activation link carries a per-account HMAC secret (`?t=`); both routes require it, the GET returns only the five form fields, the POST refuses a non-inactive account and writes only name/username/email/phone/password."
opened: 2026-09-10T01:20:00Z
---

# B-034 — Anyone can activate, rename and set the password of any inactive account by its sequential id

**Source:** data-model audit 2026-09-02, finding C1 (`.cortex/archive/documents/data-model-audit-2026-09-02/extracted/findings.md`), re-verified on `origin/staging` 58e7ab0 on 2026-09-10 (PAD-254).

**What happens:** `POST /api/app/activate/user/<id>` (`backend/padel_app/modules/frontend_api.py:567`) has no JWT, no token and no status check. The body goes through `User.get_edit_form()`, so name, username, email, phone, password and status are all writable. User ids are sequential. `GET /api/app/register/user/<id>` (`:553`) hands back any user's name, username, email and phone to anyone. `tests/test_frontend_api_authz.py` allow-lists the write as public.

**What should happen:** only the person holding the link the coach shared can complete that one account, and only while it is still inactive. The id alone opens nothing.

**Root cause:** Type 2, incomplete rule. `auth.activate` rule 1 says the account must be `inactive` but nothing in the code checks it, and no rule ever said what makes the link "specific to that one account" (the business spec's words). The implementation took the id as the secret. `create_incomplete_player_service` already mints a 256-bit `PlayerInvitation` token for the other player path; the older `/register/:userId` path never got one.

**Evidence:**
1. `frontend_api.py:553-572`: neither route is decorated, neither reads a token.
2. `user_service.py:52-63`: `activate_user_service` sets `status = active` and feeds the whole body to the edit form.
3. `grep -rn "register/" frontend/apps/web/src` — `PlayerHeader.tsx:64` builds `${origin}/register/${player.userId}`; iOS `web-links.ts:48` builds the same.
4. `test_frontend_api_authz.py:445` lists `/api/app/activate/user/<user_id>` under `public_writes`.

**Affected specs:**
- Dev: `.specflow/specs/auth/activate.spec.md`
- Business: `.specflow/specs-business/auth/newcomer-creates-and-activates-an-account.business.md`

### Change Plan

**Spec to modify:** `.specflow/specs/auth/activate.spec.md`
**Change type:** Add rules + acceptance criteria

**Add these rules:**
- The activation link is `/register/<userId>?t=<token>`; the token is an HMAC-SHA256 of `activate:<userId>:<createdAt>` under `SECRET_KEY`, surfaced to the owning coach only, as `activationToken` on the roster payload while the player is inactive.
- Both API routes require the token; a missing or wrong token is 404, indistinguishable from an unknown id.
- The GET returns only `{id, name, username, email, phone, isActive}` while inactive and `{isActive: true}` once active.
- The POST is 410 unless the account is inactive, and writes exactly name, username, email, phone, password.
- Web and iOS read `t` from the link and show the invalid-link state without a request when it is missing.

**Then:**
1. Backend tests for every new rule (`test_pad254_activation_token.py`), watched red first.
2. Implement token helper, service guards, narrowed payloads, roster `activationToken`.
3. Web + iOS: link builders carry the token, activation screens require it.
4. Playwright: the PAD-105 journey follows the real link; a new test pins that the bare id is invalid.
5. Regression: backend suite, web/mobile/packages unit suites, tsc, Playwright.

### Resolution

_Pending._
