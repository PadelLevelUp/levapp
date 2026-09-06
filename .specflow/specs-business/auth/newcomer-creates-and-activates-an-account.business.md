---
id: auth.newcomer-creates-and-activates-an-account
status: implemented
implemented_by:
  - ../../specs/auth/register.spec.md
  - ../../specs/auth/activate.spec.md
  - ../../specs/auth/mobile-universal-links.spec.md
  - ../../specs/auth/mobile-account-creation.spec.md
---

# Newcomer creates and activates an account

## Outcome

A new person gets a working, sign-in-ready account: the account is created in an inactive state first,
and only becomes usable once the person themselves sets a password and (where relevant) chooses their
own username. This two-step create-then-activate pattern is the shared plumbing behind every "someone
new joins the app" story — direct signup, and the account half of a coach- or player-invite link.

## Who This Is For

Anyone setting up an account for the first time: a coach signing up directly, or anyone completing an
account that already exists in inactive form (created ahead of time by a teammate or by an invite
flow) via the generic activation link.

## User Journey

1. A basic account record is created — name, username, password — landing in an "inactive" state
   that can't yet sign in.
2. The person receives (or navigates to) an activation link tied to that account, `/register/:userId`.
3. They set their password and confirm/update their name on that page; if the account was still
   carrying a system-generated placeholder username, the form leaves the username field empty so
   they choose their own rather than being nudged into keeping an internal-looking value.
4. On submit, the account flips to "active" and they can now sign in normally (see
   [[auth.coach-signs-in-and-stays-connected]]).

## Business Rules

- A brand-new account always starts inactive — nobody can sign in with it until it's been activated.
- Only an inactive account can be activated; the activation link is specific to that one account.
- The account's username must end up unique across the whole app once activation is complete.
- The activation form never reveals a system-generated placeholder username to the person completing
  it — it shows a blank field for them to fill in themselves, so they never keep an internal-looking
  login by accident. If they'd already chosen a real username earlier, that one is shown back to them.

## Success Metrics

Not yet measured. No signup-completion-rate or activation-funnel dashboard exists in the codebase.

## Out of Scope

- What happens after activation — signing in and staying signed in — see
  [[auth.coach-signs-in-and-stays-connected]].
- The player-specific invite-and-complete-profile flow, which is its own outcome with its own
  accept endpoint and username rules — see the players domain's
  `players.coach-builds-roster` (`players.invite-completion`).
- The coach-to-coach club invitation accept flow — see `clubs.coach-runs-a-club-and-its-team`.

## Notes

OPEN: it isn't fully clear from the dev specs alone who walks this exact generic register→activate
path end to end today versus the more specific invite flows (player invite, coach-club invite) that
each have their own accept endpoints. Treating `auth.register` + `auth.activate` as the shared
underlying primitive rather than a user-facing funnel of its own.
