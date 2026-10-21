---
id: auth.account-deletion
status: implemented
depends_on: [auth.login, auth.logout, auth.push-subscription, auth.coach-crm-sync, classes.instance-enrollment, classes.class-requests, notifications.invitations, notifications.waiting-list]
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
   The personal details the registration and settings collect go too (PAD-605): `birth_date`,
   `country`, the password-reset code fields and `notif_block_reason` → null. The acceptance record
   (`terms_accepted_at`, `terms_version`, `privacy_version`) is kept as evidence of what was agreed.
2a. **The photo is deleted, not just unlinked (PAD-605).** The profile photo's `images` row is
   deleted in the same transaction, and after the commit its object is deleted from the uploads
   bucket — best-effort: a storage failure is logged (the error class, never the key) and never
   undoes the deletion; with no bucket configured there is nothing to delete. An image still
   referenced by anything else (another user, a club logo or a message attachment) keeps its row
   and object.
3. **Every session ends.** Any JWT of a disabled user is rejected (the blocklist loader in
   `padel_app/auth.py`). A JWT is the only session: the legacy session login is deleted (PAD-645).
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
   - every standing waiting-list entry and every active per-class entry (including the ones a
     standing entry fanned out) is deactivated in the same transaction as the rest of the cascade,
     so no credit is spent and no waiting-list invitation picks them;
   - every open class request they sent (`pending` or `countered`) closes as `withdrawn` /
     `decided_by: student` and its hold leaves the coach's calendar, and they are taken off the
     invitee list of other people's open requests — silently: no notification in either direction
     (PAD-360, `classes.class-requests` rule 18). Before PAD-360 the request stayed open and the
     hold stayed on the coach's calendar under the deleted person's real name (B-135).
7. **The engine never picks a deleted account.** In invitation candidate selection a `disabled`
   account is always an `inactive_account` verdict — never invited, never counted in a round —
   whether or not `restrictions.excludeUnpaidSubscription` is on (that setting still governs
   `inactive` accounts; `notifications.config` rule 7c).
8. **The coach's records are kept, off the active roster.** Past attendance (presences of classes
   that already started), evaluations, coach notes, level history, the roster row (`coach_in_player`)
   and the messages the person sent all stay, shown under "Deleted user". They are the coach's and
   the counterpart's records, not the deleted person's account. One exception on the roster row
   (PAD-660, `players.nickname` rule 7): a coach's nickname for the deleted student is cleared, as
   personal data about them. Per privacy policy §11 the account
   leaves every roster list and picker: `/app/players`, `/app/coach_players`,
   `/app/coach_players_paginated` (and its alert counts), `/app/notify/player_search`, and the
   Presences table (`/presence_stats`); `/app/users` and the messaging picker already listed active
   accounts only. The no-filter Presences trend (`/presence_trend`) counts the same player set as the
   table, so the KPI tile, the table rows and the trend total stay equal (owner decision 2026-09-10).
   On the coach home the roster-based and forward-looking numbers leave the account too: the week
   pulse's active players, both the count and its denominator, and the reply queue, because a
   deleted person cannot read a reply. Counts of past records stay as they are, consistent with the
   class pages and the Presences page: the seats filled in classes that already happened, and the
   validation item's count of classes with an unvalidated presence. Only forward-looking and
   roster-based counts exclude a deleted account (coordinator decision 2026-09-10).
9. **The copy says exactly this** on web and iOS (`settings.account.deleteAccountDescription`,
   `settings.account.deleteDialogDescription`, pt and en): what is deleted, what is kept and why.
10. **A deleting coach** gets rules 1–5 and 8; their classes, roster and club are left untouched
    (see Open items). The open class requests sent to them close as `declined` /
    `decided_by: coach` — silently: no notification in either direction — so no student waits on
    an answer that can never come (PAD-360, `classes.class-requests` rule 18). Their holds go
    with the rest of the coach's calendar blocks (rule 5).

11. **External services (PAD-607).** What the account left outside LevApp's database goes too:
    - **CRM:** a deleting coach's HubSpot contact is archived (`auth.coach-crm-sync` rule 9),
      after the commit and best-effort — a HubSpot failure never undoes or blocks the deletion.
    - **File storage:** the photo's object in the uploads bucket (rule 2a).
    - **Push:** the device tokens and web-push subscriptions are deleted (rule 4). Notifications
      already delivered through Expo, Apple and Google cannot be recalled; the privacy policy says
      so (§5).

### Acceptance Criteria

#### The account cannot be used again
- **Given** a student who deletes their account
- **Then** their username starts with `deleted-`, their password matches nothing they knew, and their
  contact fields are empty
- **And** their existing JWTs are rejected and `POST /api/auth/login` with their old password is 401

#### Personal details and the photo are erased (PAD-605)
- **Given** a student with a birth date, a country, a pending password-reset code, a block reason
  and a profile photo stored in the bucket
- **When** they delete their account
- **Then** those fields are null, the photo's `images` row is gone and its bucket object was deleted
- **And** if the bucket refuses the delete, the account is still deleted and the failure is logged
- **Given** instead a photo that is also a club's logo
- **Then** the account is deleted and the image row and its object both stay

#### A deleting coach leaves the CRM (PAD-607)
- **Given** a coach with a HubSpot contact
- **When** they delete their account
- **Then** the contact is archived after the deletion is committed, and a HubSpot failure still
  leaves the account deleted

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

#### Roster lists and pickers hide a deleted student
- **Given** a coach whose roster has a deleted student and an active one
- **When** they open the players list, the class participants picker, the paginated roster or the
  notify / excluded-players search
- **Then** only the active student is listed, and the missing-level alert does not count the deleted one

#### The coach home counts a deleted student nowhere forward-looking
- **Given** a coach with four students, all signed up to tomorrow's class
- **When** one of them deletes their account
- **Then** the week pulse reads 3 active of 3 players, not 3 of 4
- **Given** unread messages from two students, one of whom has deleted their account
- **When** the coach opens the home
- **Then** the reply queue lists only the student whose account is active

#### The Presences page stays consistent
- **Given** a deleted student and an active one who both attended a class last week
- **Then** `/presence_stats` lists only the active student and the KPI total, the sum of the rows and
  the `/presence_trend` total are all equal

#### The coach keeps their records
- **Given** a deleted student with past attendance, an evaluation and a message to their coach
- **Then** those rows still exist and show "Deleted user"

#### Open class requests do not outlive the account (PAD-360)
- **Given** a student with a pending class request holding 11:00–12:00 on their coach's calendar
- **When** the student deletes their account
- **Then** the request is `withdrawn`, the hold block is gone, and the coach is sent nothing
- **Given** instead the coach deletes their account
- **Then** the request is `declined` and the student is sent nothing

### Open items
- A deleting **coach**'s classes, roster and club are untouched; what should happen to them (hand
  over, cancel, keep) is an owner decision.
- **Vacancy path alternative** (not chosen, 2026-09-10): run each freed seat through the student
  cancellation path (`_free_spot_for_declining_player`), opening a vacancy so the engine invites
  others per the coach's settings.
- `POST /api/auth/login` still issues a JWT to a disabled account, which the blocklist loader then
  rejects on every call; a clear login refusal belongs to `auth.login` (PAD-233 is changing that route).
