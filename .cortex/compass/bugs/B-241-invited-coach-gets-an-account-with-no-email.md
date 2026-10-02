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
proposed_fix: "The new-user accept requires an email (sign-up's validation; 400 EMAIL_REQUIRED with the update message for builds that send none; 409 field email for a taken one) and sends the first verification code after the account is committed, so the coach is 'pending' and both clients hold them on Verify your email."
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
   `EMAIL_REQUIRED` with the update message when absent, 400 when malformed, 409 `field: "email"` when
   taken. After the unit commits, it runs `begin_verification(user)`.
3. Clients, web and iOS together: a required email field on both accept forms and the shared payload type.
   400/409 `field: "email"` are mapped onto the field. A test on each client shows accept leads to
   `/verify-email`.
4. Tests: red-first for the 409, EMAIL_REQUIRED, pending state and code sent after commit (both ways); a
   server test of the existing-coach branch as it is.

### Resolution

(Filled in when the PR lands.)
