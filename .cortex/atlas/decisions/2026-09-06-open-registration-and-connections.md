---
id: decision.2026-09-06-open-registration-and-connections
title: Anyone can register; connections are made by QR, invite, claim and username — not by pending requests
date: 2026-09-06T00:00:00Z
compass_rules: []
related_specs:
  - auth.register
  - auth.coach-approval
  - clubs.join-request
  - players.join-token
  - players.claim
  - players.invite-completion
  - messaging.conversations
  - messaging.block-and-report
  - auth.newcomer-signs-up-on-their-own
  - players.coach-builds-roster
  - messaging.student-reaches-out-and-stays-safe
supersedes: []
sources: []
---

# Anyone can register; connections are made by QR, invite, claim and username

On 2026-09-06 the owner reframed how people get into LevApp. Until now every account was created
by someone else: a coach creates a student (with or without an invite link), and a coach account
is created by another coach's club invitation or by hand in the backend. The owner's new stance:

> Users register on their own and then create connections with coaches and other students. A
> coach adds a student by invite or by showing a QR code. Coaches keep creating students and
> using them even when there is no user. The invite keeps working. There must be a way to
> connect a coach-created student to an existing user, if the student registered without the
> coach knowing. Students can message other students if they have their username, and a student
> who receives a message from an unknown person can block and report them.

Three earlier Discord asks were on the table for the same ground (Linear PAD-138, PAD-137,
PAD-127 — https://linear.app/padellevelup/issue/PAD-138 etc.): PAD-138 (self-service student
sign-up, coach association out of scope), PAD-137 (coach↔student and student↔student links via
username, as *pending requests* accepted by the other side), and PAD-127 (a coach cannot add
another coach's student; proposes a coach-scoped QR join token). This decision settles all three.

## What was chosen

1. **Self-registration for both roles, active immediately.** Whoever sets their own password
   is active on the spot; the inactive→activate step stays for accounts created *by someone
   else*. Email is required at self-signup — password recovery (PAD-139) and parental consent
   (PAD-198) both need it — while coach-created players keep email optional.
2. **A coach picks a club at signup: create one, or ask to join an existing one.** Creating is
   immediate. Joining an existing club is a *request* that a current member of that club
   approves. Alternative considered: let any coach join any club by name. Rejected because
   club membership is what scopes a coach's messaging reach (`_messageable_target_ids_for`) and
   roster visibility; a stranger joining "Padel Academy" would be able to message every student
   in it.
3. **Roster growth is student-initiated, from something the coach hands over.** The coach
   shows a QR (a reusable, rotatable, 7-day join token bound to the coach and their current
   club) or shares the same URL as a link. The student, signed in, redeems it. No coach approval
   step: the coach produced the token, the student scanned it — consent is on both sides. A
   leaked token is bounded by expiry, rotation and the coach's existing "remove from roster".
   This is PAD-127's proposal, adopted as written.
4. **Claiming, not duplicating.** A coach-created player is a User with a placeholder username
   and no password. When the real person turns out to already have an account, the two are
   *merged* — every row pointing at the placeholder is re-pointed at the real account, the
   placeholder is disabled — so the coach's level history, attendance and chat thread survive.
   Two triggers: the student opens the invite link while signed in ("I already have an
   account"), or the coach asks by exact username and the student accepts. Alternative
   considered: keep both records and link them. Rejected because every roster, attendance and
   eligibility query keys on `players.id`; two ids for one person is the duplicate problem
   PAD-127 describes, with an extra join.
5. **Student-to-student messaging is direct, by exact username, with block and report as the
   safety net.** This *replaces* PAD-137's pending-request model for student↔student. The
   owner's framing — "if they have their username" — is a reachability rule, not a friendship
   graph: knowing the username is the consent signal, and the receiving side gets an
   unknown-sender banner with Block and Report. Students are never listable or searchable.
   Block/report already exist in the backend and both clients (App Store readiness, phase 3)
   but were never specced; `messaging.block-and-report` pins them and adds the banner.
6. **Coach↔student "connection requests" by username survive only as the claim request**
   (item 4). A coach who wants a *new* student on the roster uses the QR or the invite.

7. **Coaches are approved by the LevApp admin, for now.** Added by the owner the same day: a
   self-registered coach signs in but is held at a "waiting for approval" screen until a
   superadmin approves them; only then do they pick or create a club. The club step therefore
   moves from the signup form to a post-approval onboarding screen — otherwise a rejected
   signup could leave a fake club behind that every later coach would find in search.
   Coaches who arrive through a club invitation are trusted by that club and skip the gate.
   Built behind `COACH_APPROVAL_REQUIRED` so it can be switched off without a data change.
   Alternative considered: hold the coach as `inactive` (cannot sign in) until approved.
   Rejected because the login would fail with "invalid credentials" and the coach would have no
   way to learn they are waiting.

## What this supersedes

- PAD-137's pending-request model is superseded for student↔student (item 5) and for
  coach→student roster additions (item 3). The ticket's "Conexões" tab becomes the student's
  "Connect" surface: redeem a link, see pending claim requests.
- `players.add-existing` (draft, never built) is deprecated in favour of `players.join-token`
  and `players.claim`.
- `auth.register` is corrected: `POST /api/auth/register` never existed as a JSON route (only
  the legacy server-rendered `/auth/register` template). The leaf is rewritten as the
  self-service signup and its status set to `draft` (bug B-019).

## Left open, on purpose

- No email verification at signup in v1. Revisit with PAD-139.
- No in-app QR *scanner* on iOS in v1: the system camera opens the universal link (PAD-184
  landed 2026-09-06). Adding a scanner means a camera-permission string and App Store metadata.
- No push notification for a pending club join request or claim request in v1; both are
  surfaced in-app (Settings → Club, Settings → Account, dashboard banner).
- Whether a coach should be told when someone joins via QR beyond the roster updating.
