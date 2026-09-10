---
id: auth.newcomer-signs-up-on-their-own
status: implemented
implemented_by:
  - ../../specs/auth/register.spec.md
  - ../../specs/auth/coach-approval.spec.md
  - ../../specs/auth/email-verification.spec.md
  - ../../specs/auth/password-recovery.spec.md
  - ../../specs/clubs/join-request.spec.md
---

# Newcomer signs up on their own

## Outcome

Anyone — a coach or a student — can create their own LevApp account from the login screen, on
web or on the iPhone app, without being invited by somebody who already has one. A student lands
in an empty app with one clear next step: connect with a coach. A coach lands in a waiting room
until the LevApp admin approves them — for now, every new coach is checked by hand — and then
picks their club: create one, or ask an existing club to let them in. Nobody has to find the web
app first, and nobody's login is created for them by someone else.

## Who This Is For

A coach who has heard of LevApp and wants to start using it today, with or without a club that
already exists in the app. A student who wants an account before, or independently of, their
coach adding them — including a student whose coach has *already* created a record for them
without their knowledge (that case is picked up in
[[players.coach-builds-roster]], "claiming").

## User Journey

1. On the login screen, the newcomer taps "Create account" and chooses whether they are a coach
   or a student.
2. They enter their name, a username, an email address and a password. The username is theirs
   to choose and must be free; the email is required (it is how they will recover the account
   later) and must not already belong to someone else.
3. **Everyone** first proves the email is theirs: a 6-digit code arrives in their inbox and they
   type it into the app (the phone offers to fill it in from the mail). A wrong address can be
   corrected on the spot, and a new code requested after a minute. Nothing else in the app opens
   until the code is in. Changing the email later in Settings runs the same step again, and
   Settings always shows whether the current address is verified.
4. **A coach** is then signed in but sees "Waiting for LevApp approval". The LevApp admin is told a
   coach is waiting (email, when configured, and a badge in the admin's Settings), can see whether
   the coach's email is verified, checks them, and approves or rejects. An approved coach gets an
   email in their language saying they can start; a rejected coach is signed out, sees on the
   login screen that their request was not approved and why, and can ask again with one tap — which
   puts them back in the admin's queue (decision 2026-09-09).
5. **An approved coach**, on their next app load, picks their club: either create a new one
   (name, optionally location), or search existing clubs by name and ask to join one. Creating
   is instant — they are a member of the new club and can start adding players and classes.
   Asking to join puts them in a second "waiting for approval" state, this time for that club: a
   coach already in it sees the request under Settings → Club and approves or declines it. While
   waiting, the coach can change their mind and create their own club instead.
6. **A student** is signed in immediately and sees the "Connect with a coach" screen: open the
   link or QR your coach gave you, or wait for your coach to add you. Their calendar, attendance
   and messages fill in as soon as a coach connection exists.
7. Either way, the login works right away — there is no separate activation email or link,
   because the person who set the password is the person who owns the account. What a coach can
   *do* with it waits for the admin.
8. **Later, locked out.** Whoever forgets their password or their username taps "Forgot your
   password?" on the login screen, types the email on the account, and gets one mail with their
   username and a 6-digit code that is good for 15 minutes and works once. Typing the code and a
   new password signs them straight in. The screen never says whether an email has an account.

## Business Rules

- Self-registration is open to both roles; the role is chosen at signup and cannot be changed
  from the form afterwards.
- A self-registered account is active immediately. The "inactive until activated" state is
  reserved for accounts created by someone else on the person's behalf (see
  [[auth.newcomer-creates-and-activates-an-account]]).
- Username and email must each be unique across the whole app. A username that looks like a
  system-generated placeholder is never accepted as a chosen one.
- Email is mandatory at self-signup, and it must be verified with a code before the person can
  go on; a coach-created player's email is not put through that step. It stays optional for
  players a coach creates.
- For now, every self-registered coach must be approved by the LevApp admin before they can
  create a club, join one, or touch any roster. A coach who arrives through a club's invitation
  link is trusted by that club and needs no admin approval. The gate can be switched off later
  without changing anyone's account.
- An approved coach always ends onboarding with either a club of their own or a pending request
  to join one — never with nothing. A coach whose request is pending has no working club until it
  is approved or they create one.
- Joining an existing club always needs a current member's approval; nobody can walk into a
  club's roster and message its students just by knowing the club's name.
- The signup form links to the Privacy Policy and Terms, on both platforms.
- The email on the account is the recovery channel for both the password and the username. A
  recovery request never confirms or denies that an email has an account.

## Success Metrics

- Not yet measured. Candidates: signups per week by role; median time from coach signup to admin
  decision; share of coach signups approved; share of approved coaches that create a club vs.
  request to join; median time from a join request to its decision.

## Out of Scope

- How a student, once registered, gets onto a coach's roster (QR, invite link, claim) — see
  [[players.coach-builds-roster]].
- Parental consent for minors — its own outcome, [[auth.minor-signs-up-with-a-guardians-consent]]
  (PAD-198): the same form gains a birth date and a country, and a minor's account waits for a
  guardian.
- Email verification. Not in v1 (decision 2026-09-06).
- Signing in and staying signed in — [[auth.coach-signs-in-and-stays-connected]].

## Notes

- Decision record: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`.
- OPEN: no rate limiting on signup, same class of gap as B-001/B-002 on login.
- OPEN: should a coach whose join request is declined be told why? v1 shows "declined" only.
- OPEN: the admin approval gate is explicitly "for now" (owner, 2026-09-06). Revisit once coach
  onboarding no longer needs a human check.
