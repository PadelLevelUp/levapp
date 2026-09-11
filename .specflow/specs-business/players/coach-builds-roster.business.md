---
id: players.coach-builds-roster
status: draft
implemented_by:
  - ../../specs/players/create.spec.md
  - ../../specs/players/duplicate-name-check.spec.md
  - ../../specs/players/add-existing.spec.md
  - ../../specs/players/invite-completion.spec.md
  - ../../specs/players/join-token.spec.md
  - ../../specs/players/claim.spec.md
---

# Coach builds their roster

## Outcome

A coach gets new students onto their roster four ways, and never ends up with two records for one
person: they fill in the basics themselves (the student may never log in — that is fine), they hand
the student a one-time invite link to finish their own profile, they show a QR code (or share its
link) that any student with an account can scan to join, or — when a student turns out to have
registered on their own already — they link the record they created to that account so nothing the
coach entered is lost. The coach is warned, without being blocked, if a name looks like it might
already be on the roster.

## Who This Is For

Coaches adding students to their roster, and the students themselves when they're the ones completing
the invite-link half of the journey.

## User Journey

1. A coach opens "new player" and enters what they know — name, and optionally level, side preference,
   email. They never enter a username; that's the student's own credential to choose later.
2. As they type the name, if it matches a player already on their roster (case-insensitive, exact
   match), a quiet warning appears under the field — but the "Create" button stays enabled, because two
   real students can genuinely share a name.
3. On save, the student gets a real account, associated with the coach and the coach's club, sitting
   inactive until the student sets their own credentials.
4. Instead of (or in addition to) filling in every detail, the coach can create a "pending" player with
   just a name and generate a one-time invite link. The student opens it, chooses their own username
   and password, and fills in the rest — completing their own profile turns the account active and
   signs them in.
5. If the level field is opened and the coach hasn't defined any levels yet, the form says so plainly
   and points them to Settings rather than showing an empty, broken-looking dropdown.
6. A coach who wants to add students who already have accounts — their own class, or a student
   who plays with another coach — opens "Add by QR" on the Players tab. The screen shows a QR code
   and the same link as text. A student scans it with their phone camera (or opens the link),
   signs in or creates an account if needed, sees "Join {coach} at {club}?", and confirms. They
   appear on the coach's roster immediately, with no level yet, so the coach's "missing level"
   filter picks them up. The QR stays valid for a week and serves the whole class; the coach can
   regenerate it at any time, which retires the old one. The code is not kept once it is shown:
   opening "Add by QR" again while it is live says until when it works and how many students
   joined, and showing a QR again means generating a new one.
7. A student who received a coach-created record *and* had registered on their own — before the
   coach knew, or after — does not end up as two people. If they open the invite link while signed
   in, the page offers "link this to my account"; the coach's record (level, attendance, notes,
   chat history) is folded into the student's real account. The coach can also start this from the
   player's page — "Link to existing account", by exact username — and the student accepts or
   declines from their own app.
8. A student the coach created and who never registers keeps working exactly as today: they can be
   enrolled, marked present, evaluated and reminded. Having a login is never a precondition for
   being on a roster.

## Business Rules

- A coach never sets a student's username — not at creation, not afterward. The student picks it
  themselves when they activate or complete their profile.
- A newly created player starts as an inactive account until the student completes it (directly via
  the activation link, or via the invite-completion form).
- Duplicate-name detection is a warning, never a block: it compares names case-insensitively and
  exactly, and always leaves the coach free to proceed.
- An invite link for profile completion is single-use and expires after 7 days, following the same
  pattern as club invitations.
- A username chosen at profile completion must be unique across the whole app; a taken one is
  rejected.
- The level field must always give the coach a clear path forward — either real options to pick from,
  or an explicit nudge to go define some — never a silently empty control.
- A join QR/link is reusable and coach-scoped: one code, many students, seven days, retired when the
  coach regenerates it. Redeeming it needs a signed-in student account and asks for confirmation;
  the coach is not asked again, because showing the code was the coach's consent.
- Only an account that has never been activated (no password, placeholder username) can be claimed;
  claiming folds the coach's record into the student's account and retires the placeholder. The
  student's own name and username win; the coach's level, side and notes are kept.
- A student with an account can only be reached, added or linked by something they do — scan,
  open a link, accept a request. A coach never attaches a registered student to a roster
  unilaterally.

## Success Metrics

Not yet measured. No roster-growth, duplicate-warning-override-rate, or invite-completion-rate
dashboard exists in the codebase.

## Out of Scope

- Self-registration itself (how a student gets an account with no coach involved) — see
  `auth.newcomer-signs-up-on-their-own`.
- Editing a player's details after creation, or removing them from the roster — see
  [[players.coach-edits-player-details]].
- Browsing, searching, or viewing a player once they're on the roster — see
  [[players.coach-browses-and-reviews-roster]].
- The account-activation mechanics themselves (setting a password, flipping inactive→active) — see
  `auth.newcomer-creates-and-activates-an-account`.

## Notes

- Decision record: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`
  (items 3 and 4). `players.add-existing` is deprecated in favour of `players.join-token` and
  `players.claim`; the consent and discovery questions it left open are answered by making the
  student the actor.
- OPEN: whether the coach should get a message when someone joins via QR, beyond the roster
  updating. v1: no.
- OPEN (PAD-269, 2026-09-10): the owner has yet to confirm "generate a new code" in place of
  showing the live one again. The coordinator decided it for now, so the reopen screen stays minimal.
