---
id: auth.user-deletes-their-account
status: draft
implemented_by:
  - ../../specs/auth/account-deletion.spec.md
---

# User deletes their account

## Outcome

Anyone can delete their LevApp account from inside the app, and afterwards the account is really
gone: nobody can sign in with it, no notification reaches the person again, and they are no longer
booked into anything. What stays is what belongs to other people — the coach's record of past
classes and the other side of a conversation — shown under "Deleted user".

## Who This Is For

Students and coaches who want to leave (App Store guideline 5.1.1(v) requires in-app deletion), and
the coaches whose records must survive a student leaving.

## User Journey

1. From Settings → Account the person taps "Delete account"; the confirmation says exactly what is
   deleted and what is kept, and why.
2. On confirming, every session on every device ends and the person is signed out.
3. The account can no longer be used: no sign-in (app or legacy web), no password, no username that
   could be claimed or re-activated.
4. Pushes stop at once — the phone and browser registrations are removed.
5. A student is taken out of every class that has not started yet; the coach sees the free seat on
   their dashboard and decides whether to fill it. Waiting-list credits stop being spent and the
   automatic invitations never pick the account again.
6. The coach keeps their record of the classes that already happened — attendance, evaluations,
   notes, level history — and messages the person sent stay in the coach's conversation, all shown
   as "Deleted user".

## Business Rules

- Deletion is immediate and cannot be undone.
- Deletion removes the person from the future, never rewrites the past: what already happened is the
  coach's record and stays, anonymised.
- Nothing about a deleted account may reach the person again — no sign-in, push, reminder or
  invitation.
- Freeing a deleted student's seats is silent: no automatic invitations go out because of it; the
  coach decides.
- The confirmation copy on every platform states exactly what is deleted and what is kept.

## Success Metrics

Not yet measured.

## Out of Scope

- What happens to a deleting coach's own classes, roster and club (open item in the dev spec).
- Data export.

## Notes

Decision record: `.cortex/atlas/decisions/2026-09-10-account-deletion-keeps-coach-records.md` (owner
decision delivered by the coordinator, 2026-09-10), which also carries the privacy-policy checklist.
