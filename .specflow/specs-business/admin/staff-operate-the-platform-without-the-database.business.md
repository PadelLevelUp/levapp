---
id: admin.staff-operate-the-platform-without-the-database
status: draft
implemented_by:
  - ../../specs/admin/approvals-and-users.spec.md
  - ../../specs/admin/clubs-and-switches.spec.md
  - ../../specs/admin/engine-health.spec.md
  - ../../specs/admin/commercial-groundwork.spec.md
---

# Staff operate the platform without the database

## Outcome

Everything LevApp's team does to run the platform day to day is a screen in one staff console:
approving a new coach, finding a user and helping them, fixing a club's courts or links, turning a
platform switch on or off, and checking that the invitation engine is healthy. Today several of
these mean a hand-written database query or the generic data browser, which is slow, easy to get
wrong and leaves no record. With the console, routine operations take a minute, need no database
access, and cannot be done by accident from the coach app.

## Who This Is For

LevApp's staff: the owner, operators who run the platform day to day, and support staff who only
need to look. Indirectly every coach and student, who get faster approvals and faster help.

## User Journey

1. A staff member opens the console and signs in with their company Google account.
2. A new coach has asked to join: the staff member sees them in the approvals list and approves or
   rejects them. The coach is told exactly as they are today (email, push notification) and the
   CRM is updated.
3. A user writes to support: the staff member searches for them, sees their account at a glance,
   resends their verification email, or disables a misbehaving account. When the staff member needs
   to see what the user sees, they open a read-only view of the user's app that cannot change
   anything.
4. A club has the wrong courts, or a coach is linked to the wrong club: the staff member corrects it.
5. Something misbehaves in production: the staff member switches the affected feature off for
   everyone, or switches off the coach-approval gate, and switches it back on later.
6. Every morning, or after a release, the staff member opens the engine health page and sees
   whether invitations are flowing, whether any reminders or messages failed, and which version
   each environment runs.
7. Later, once pricing is decided, the staff member puts a coach on a plan (a trial, a
   complimentary plan or a manual arrangement) and the coach's app shows what that plan includes.

## Business Rules

1. Approving or rejecting a coach in the console has exactly the effect it has today: the same
   status change, the same email and push notification to the coach, the same CRM update.
2. The old Admin section inside the coach app's Settings disappears from the web and the iPhone
   app in the same release that adds approvals to the console.
3. Support staff can look at everything the console shows and change nothing.
4. Only the owner can give or take away a staff role.
5. Seeing a user's app "as them" is read-only, never shows their private messages, and is recorded
   every time it is used.
6. The engine health page only reads. Nothing on it can start, stop or retry the engine.
7. Plans and what they include are recorded before any payment exists. Charging money is a later
   decision that depends on the finance questionnaire.

## Success Metrics

- No routine operation (approval, user help, club fix, switch) needs a database query after the
  console ships.
- A pending coach is decided within one working day.
- After a release, the team can tell from one page whether the engine is healthy and which version
  each environment runs.

## Out of Scope

- Charging coaches, invoices and payment providers (a later decision).
- Editing a user's classes, players or evaluations on their behalf.
- A phone version of the console.

## Notes

- Linear: PAD-530 (epic); PAD-532 approvals and users, PAD-533 clubs and switches, PAD-534 engine
  health, PAD-535 plans (blocked by PAD-536, the finance questionnaire, and PAD-472).
- Owner decisions 2026-10-06.
- OPEN: whether the generic data browser (today's `/editor`, staging and local only) moves into the
  console or is retired once the console covers routine operations.
