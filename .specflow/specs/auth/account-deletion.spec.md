---
id: auth.account-deletion
status: implementing
depends_on: [auth.login, auth.logout, auth.push-subscription, classes.instance-enrollment, notifications.invitations, notifications.waiting-list]
implements: ../../specs-business/auth/user-deletes-their-account.business.md
governed_by: []
---

# auth.account-deletion

### Intent
`DELETE /api/auth/me` deletes the calling account (App Store 5.1.1(v)). Before PAD-268 it only
disabled the user and scrubbed contact fields: the username and password hash survived, a deleted
student stayed enrolled in every future class and kept getting reminders, standing waiting-list
credits kept being spent, device tokens and push subscriptions kept receiving pushes, and the legacy
session login still let a disabled user in (audit M10). This leaf states the full cascade.

### Rules
1. **Per-user, both roles.** `DELETE /api/auth/me` acts on the JWT's own user (`settings.role-scope`
   rule 8) and answers `200 {"message": "Account deleted"}`.
2. **The account itself is gone.** `status` → `disabled`; `name` → `"Deleted user"`; `email`, `phone`,
   `generated_code`, `user_image_id`, `abbreviation` and the email-verification code fields → null;
   `username` → a fresh `deleted-<16 hex>` (never the `pending-` placeholder prefix, so the record can
   never be claimed — `players.claim`); `password` → the hash of a random secret nobody holds (never
   null, so `auth.activate` cannot re-open it). The row is kept so authorship and history still resolve.
3. **Every session ends.** Any JWT of a disabled user is rejected (the blocklist loader in
   `padel_app/auth.py`), and the legacy session `/login` refuses a disabled account.
4. **Pushes stop.** Every `device_tokens` and `push_subscriptions` row of the user is deleted.
5. **Their own social state goes.** `blocked_users` rows where they are the blocker or the blocked, and
   their `calendar_blocks`, are deleted.
6. **A student leaves the future, silently.** For a deleting student:
   - their enrolment (`player_in_lesson_instance`) and presence in every instance that has not started
     are deleted;
   - their series enrolment (`player_in_lesson`) is deleted for every lesson that still has an
     occurrence ahead (a non-recurring lesson not yet started, or a recurring one whose recurrence has
     not ended) — so no future virtual occurrence lists them;
   - no vacancy is opened and nobody is invited because of it (owner decision 2026-09-10); the coach's
     dashboard needs-you queue already surfaces the empty seat;
   - reminders stop as a consequence: they go to an instance's enrolled players;
   - every standing waiting-list entry is deactivated with its per-class entries
     (`_deactivate_standing_entry`), and every other active waiting-list entry is deactivated, so no
     credit is spent and no placement picks them.
7. **The engine never picks a deleted account.** In invitation candidate selection a `disabled`
   account is always an `inactive_account` verdict — never invited, never counted in a round —
   whether or not `restrictions.excludeUnpaidSubscription` is on (that setting still governs
   `inactive` accounts; `notifications.config` rule 7c).
8. **The coach's records are kept.** Past attendance (presences of classes that already started),
   evaluations, coach notes, level history, the roster row (`coach_in_player`) and the messages the
   person sent all stay, shown under "Deleted user". They are the coach's and the counterpart's
   records, not the deleted person's account.
9. **The copy says exactly this** on web and iOS (`settings.account.deleteAccountDescription`,
   `settings.account.deleteDialogDescription`, pt and en): what is deleted, what is kept and why.
10. **A deleting coach** gets rules 1–5 and 8; their classes, roster and club are left untouched
    (see Open items).

### Acceptance Criteria

#### The account cannot be used again
- **Given** a student who deletes their account
- **Then** their username starts with `deleted-`, their password matches nothing they knew, and their
  contact fields are empty
- **And** their existing JWTs are rejected and the legacy session login refuses them

#### Pushes stop
- **Given** a user with a device token and a web-push subscription
- **When** they delete their account
- **Then** both rows are gone

#### A deleted student leaves every future class, and only future ones
- **Given** a student enrolled in a class tomorrow, in a recurring series, and with a presence in a
  class last week
- **When** they delete their account
- **Then** they are no longer enrolled in tomorrow's class or the series, and tomorrow's presence is gone
- **And** last week's presence is still there
- **And** no vacancy was opened and no invitation was sent

#### Waiting-list credits stop being spent
- **Given** a student with an active standing waiting-list entry and its per-class entries
- **When** they delete their account
- **Then** the standing entry and its per-class entries are inactive

#### A deleted student on a roster consumes no invite round
- **Given** a coach with `excludeUnpaidSubscription` off and a vacancy whose candidates include a
  deleted student
- **When** the engine selects the next round
- **Then** the deleted student is an `inactive_account` verdict and is not invited

#### The coach keeps their records
- **Given** a deleted student with past attendance, an evaluation and a message to their coach
- **Then** those rows still exist and show "Deleted user"

### Open items
- A deleting **coach**'s classes, roster and club are untouched; what should happen to them (hand
  over, cancel, keep) is an owner decision.
- **Vacancy path alternative** (not chosen, 2026-09-10): run each freed seat through the student
  cancellation path (`_free_spot_for_declining_player`), opening a vacancy so the engine invites
  others per the coach's settings.
- `POST /api/auth/login` still issues a JWT to a disabled account, which the blocklist loader then
  rejects on every call; a clear login refusal belongs to `auth.login` (PAD-233 is changing that route).
