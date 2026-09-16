---
id: auth.newcomer-creates-and-activates-an-account
status: implemented
implemented_by:
  - ../../specs/auth/activate.spec.md
  - ../../specs/auth/mobile-universal-links.spec.md
  - ../../specs/auth/mobile-account-creation.spec.md
  - ../../specs/auth/account-profiles.spec.md
---

# Newcomer creates and activates an account

## Outcome

A person whose account was created *for them* — by a coach, a teammate or an invite flow — gets a
working, sign-in-ready account: it starts inactive and only becomes usable once the person themselves
sets a password and (where relevant) chooses their own username. This create-then-activate pattern
is the plumbing behind every "someone else created my account" story. Creating one's own account is a
different journey — [[auth.newcomer-signs-up-on-their-own]] — and is active from the start.

## Who This Is For

Anyone completing an account that already exists in inactive form (created ahead of time by a coach,
a teammate or an invite flow) via the generic activation link.

## User Journey

1. A basic account record is created by someone else — name, and a placeholder username — landing in
   an "inactive" state that can't yet sign in.
2. The person receives (or navigates to) an activation link tied to that account, `/register/:userId`.
3. They set their password and confirm/update their name on that page; if the account was still
   carrying a system-generated placeholder username, the form leaves the username field empty so
   they choose their own rather than being nudged into keeping an internal-looking value.
4. On submit, the account flips to "active" and they can now sign in normally (see
   [[auth.coach-signs-in-and-stays-connected]]).

## Business Rules

- An account created on someone's behalf always starts inactive — nobody can sign in with it until it's
  been activated. (A self-registered account is the exception: it is active from the start, see
  [[auth.newcomer-signs-up-on-their-own]].)
- Only an inactive account can be activated; the activation link is specific to that one account
  and carries a secret only the coach's own app can produce — knowing (or guessing) an account's
  number is never enough to complete it, and a link shared without its secret does not work.
- The account's username must end up unique across the whole app once activation is complete.
- The activation form never reveals a system-generated placeholder username to the person completing
  it — it shows a blank field for them to fill in themselves, so they never keep an internal-looking
  login by accident. If they'd already chosen a real username earlier, that one is shown back to them.

## Success Metrics

Not yet measured. No signup-completion-rate or activation-funnel dashboard exists in the codebase.

## Out of Scope

- Creating your own account from the login screen — [[auth.newcomer-signs-up-on-their-own]].
- What happens after activation — signing in and staying signed in — see
  [[auth.coach-signs-in-and-stays-connected]].
- The player-specific invite-and-complete-profile flow, which is its own outcome with its own
  accept endpoint and username rules — see the players domain's
  `players.coach-builds-roster` (`players.invite-completion`).
- The coach-to-coach club invitation accept flow — see `clubs.coach-runs-a-club-and-its-team`.

## Notes

- 2026-09-06: `auth.register` moved out of this outcome. It had described a direct-signup
  endpoint that never existed (B-023); it is rewritten as the self-service signup under
  `auth.newcomer-signs-up-on-their-own`. What remains here is the activation half only.
