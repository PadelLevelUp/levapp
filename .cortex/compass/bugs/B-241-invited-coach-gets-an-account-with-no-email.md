---
id: B-241
title: "A coach who joins by club invitation gets an active account with no email at all, never verified; a duplicate email on that path is a 500"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - clubs.coach-invitation
  - auth.email-verification
  - backend/padel_app/services/club_service.py
  - frontend/apps/web/src/pages/CoachInvitePage.tsx
  - frontend/apps/mobile/src/features/auth/CoachInviteScreen.tsx
  - frontend/packages/api/src/resources/invitations.ts
proposed_fix: "The new-user accept validates an email as sign-up does (409 field email when taken) and sends the first code after the commit, so the coach is pending. Clients declaring coach-invite-email must send one (400 EMAIL_REQUIRED); iOS 27/28, which cannot, keep the pre-PAD-477 accept (legacy path, to be retired)."
opened: 2026-10-02T11:23:48Z
---

# B-241: an invited coach has no email, so nothing can verify it

**Source:** PAD-477, found by Session-B during PAD-476 (2026-10-02). The duplicate-email 500 was found by
#495's independent review. Owner decision 2026-10-02, option 1: a coach who joins by invitation must confirm
their email ("yes they should").

**What happens (observed in source on `61edfeb1d`):**
- Invitations are created with no email. Web `ClubSection.tsx:132` and iOS `club-section.tsx:225` call
  `createCoachInvitation(club.id)`; `clubs.coach-invitation` rule 2 says the link is shared by hand.
- The accept form collects no email either. The shared payload type `invitations.ts:29-35` is
  `{name, username, password, birthDate}`; web `CoachInvitePage.tsx:111-116` and iOS
  `CoachInviteScreen.tsx:104-109` send exactly that.
- `accept_coach_invitation_service` stores `data.get("email") or invitation.email`, which is `None` from
  either client. The account is active, has no email, is never held for verification (`"unverified"`,
  `auth.email-verification` rule 8), cannot receive mail and cannot recover its password.
- When an email does arrive (an API caller), it is not validated, not lowercased and not checked for
  uniqueness. A taken one reaches the unique constraint as an IntegrityError, so the user gets a 500
  (rolled back cleanly since PAD-476).

**Root cause:** `auth.email-verification` rule 1 lists who must verify: self-signup and a self-service email
change. `clubs.coach-invitation` never asked for an email. No rule covered the invited coach (incomplete rule).

**Production read** (coordinator, read-only, 2026-10-02 11:22 UTC, the query below):
- coaches with an email neither verified nor required to verify: **0** (0 without email, 0 with);
- coaches in total: 3, all verified;
- `coach_invitations`: 1 accepted, 4 pending.

So no existing coach is in the no-email state today. The 4 pending invitations are the ones that will meet the
new form.

```sql
SELECT count(*) AS coaches_total_unverified_not_required,
       count(*) FILTER (WHERE u.email IS NULL OR btrim(u.email) = '') AS no_email,
       count(*) FILTER (WHERE u.email IS NOT NULL AND btrim(u.email) <> '') AS with_email,
       min(u.created_at) AS first_created, max(u.created_at) AS last_created
FROM coaches c JOIN users u ON u.id = c.user_id
WHERE u.email_verified_at IS NULL
  AND coalesce(u.email_verification_required, false) = false;
```

**The existing-coach branch of the accept** (an authenticated coach joins another club) has no client caller.
The survey found no screen for it, and `CoachInviteScreen`'s docstring only claims one exists. It is left
unchanged by decision; a server test pins what it does today.

### Change Plan

1. Spec: `clubs.coach-invitation` gains rule 9, and rule 4 says when the code is sent;
   `auth.email-verification` rule 1 lists the invitation accept. The wording goes to the coordinator before
   it is committed.
2. Backend: the new-user accept validates the email as sign-up does, before anything is written: 400
   when malformed, 409 `field: "email"` when taken. When the email is absent: 400 `EMAIL_REQUIRED` from a
   client declaring `coach-invite-email`, and from one that does not (iOS 27/28) the legacy accept
   without an email. After the unit commits, it runs `begin_verification(user)`.
   - **Decision change (coordinator, 2026-10-02):** a plain 400 for old builds was withdrawn. iOS 1.2.x
     opens the invite link in the app and shows its own generic error ("Algo correu mal") for any
     400 other than birthDate, so an invitee on a build released that morning would be stuck with no
     message that could reach them.
3. Clients, web and iOS together: a required email field on both accept forms and the shared payload type.
   400/409 `field: "email"` are mapped onto the field. A test on each client shows accept leads to
   `/verify-email`.
4. Tests: red-first for the 409, EMAIL_REQUIRED, pending state and code sent after commit (both ways); a
   server test of the existing-coach branch as it is.

### Resolution

- Spec: `clubs.coach-invitation` rule 9 (new) and rule 4 (the code goes out after the commit);
  `auth.email-verification` rule 1 lists the invitation accept.
- Backend: `club_service.accept_coach_invitation_service` (email check, legacy path,
  `begin_verification` after the unit); `registration_service.normalised_email` /
  `assert_email_free`, shared with sign-up and behaving the same there; capability
  `COACH_INVITE_EMAIL`.
- Clients, web and iOS: a required email field; the payload type gains `email`; email refusals land
  on the field; a pending account lands on `/verify-email`; both shells declare `coach-invite-email`.
- **Legacy path, to remove:** iOS 1.2.0 (27) and 1.2.1 (28) accept without an email (state
  `"unverified"`, no code). Remove it, with the token's gate, when no build older than the first
  declaring one is in use. Ask at each promotion's compat audit. The query above counts what it
  produces.
- **Follow-up (separate ticket, the coordinator files it):** a coach with no email (legacy-path
  accounts) is asked for one in Settings on a build that can. Today they cannot recover a password.
- **Noted, pre-existing (from #500's independent review), not fixed here:**
  - two accepts of the same invitation at once: there is no row lock on the invitation, so both
    could pass the pending check;
  - two accepts racing with the same email: the second meets the unique constraint as a 500, the
    same as two sign-ups racing.
- **#500 review round, applied:**
  - the accept is under sign-up's rate limiter (`register` scope);
  - an error body carries `code` only when there is one;
  - a failure in `begin_verification` after the commit answers with the session and is logged;
  - rule 9's legacy-path sentence now says what the code does;
  - four mutants that survived (code sent at the end of the unit, legacy path using the
    invitation's email, case-sensitive uniqueness, email checked before birthDate) are now red;
  - E2E `clubs/coach-invitation.spec.ts` US-CI-2 fills the email and completes the code.
