---
id: notifications.request-alerts
status: implemented
depends_on: [clubs.join-request, players.claim, auth.coach-approval, auth.push-subscription, messaging.push-notifications, settings.profile]
implements: ../../specs-business/notifications/people-hear-about-requests.business.md
governed_by: []
---

# notifications.request-alerts

### Intent
Push and email the people who can act on a pending request (club join request, player claim
request, coach approval) the moment it is created, and the requester the moment it is decided,
with a per-user opt-out (PAD-232).

### Entities
- `users.notif_request_alerts` — Boolean, NOT NULL, default `true`. Exposed as
  `requestAlerts` on `GET /api/auth/me` and writable through `PATCH /api/auth/me`
  (settings.profile), for every role.
- **READS:** ClubJoinRequest, Association_CoachClub, PlayerClaimRequest, Coach, User
  (`is_superadmin`, `email`, `language`), PushSubscription, DeviceToken.

### Rules
1. **Events and recipients** (`request_alert_service.notify_request_event`):
   - `club_join.received` — on `POST /club/<id>/join-requests` → every coach who is a member
     of that club (Association_CoachClub), never the requester.
   - `club_join.decided` — on approve/reject → the requesting coach, with the decision.
   - `claim.received` — on `create_claim_request_service` (players.claim trigger B) → the
     invited account (`target_user`).
   - `claim.decided` — on accept/reject → the requesting coach, with the decision.
   - `coach_approval.received` — on a coach signup that lands `pending` → every
     `is_superadmin` user. The existing `ADMIN_NOTIFY_EMAIL` mail (auth.coach-approval rule
     4) is unchanged and is sent regardless of any user's opt-out because it is an operational
     mailbox, not a person's preference.
   - `coach_approval.decided` — on approval → the coach (push; the branded approval email of
     auth.coach-approval rule 5 already exists and is unchanged). Rejection sends nothing in
     v1, as rule 5 says; PAD-233 owns rejection semantics.
2. **Channels**, in this order, each best-effort and independent: web push
   (`send_push_notification`, URL = the settings section that shows the request), native push
   (`send_expo_push_to_user`, `data: {type: "request", kind}` — no tap route in v1, the app
   opens on its current screen; the messaging.push-notifications rule-7 contract keeps
   `message` and `class` as the only routed types), then email
   (`email_tools.send_email`, rendered by `email_templates.render_request_alert_email` in the
   recipient's `language`, branded like the approval email, one button to the web app). A
   recipient without an email or without devices simply gets the channels they have.
3. **Opt-out**: a recipient whose `notif_request_alerts` is `false` receives none of the three
   channels for any request event. The in-app badges, banners and lists (clubs.join-request
   rule 7, players.claim rule 4, auth.coach-approval rule 7) are unaffected by the flag.
4. **Copy** lives in `request_alert_service.COPY` (pt/en), not in the coach's editable
   `notification_configs.message_templates`: the recipients span students, coaches of another
   club and superadmins, none of whom own the sending coach's template set, and a per-coach
   template cannot be edited by the people who receive it. Making the copy editable is a
   follow-up once there is a role-neutral template store — recorded as OPEN below.
5. Failure of any channel is logged at WARNING and never fails the request, the decision or
   the signup (same rule as auth.coach-approval rule 4).
6. **Settings** (web and iOS): Preferences shows a switch "Request alerts" — "Push and email
   when a request needs you, and when yours is decided" — for every role, saved through
   `PATCH /api/auth/me {requestAlerts}`; the switch reflects `GET /api/auth/me`.

### Acceptance Criteria

#### A club member hears about a join request; the requester hears the decision
- **Given** club "Norte" with member coaches `ana` and `bruno`, and approved coach `rui` with a
  device token and an email
- **When** `rui` POSTs a join request for "Norte"
- **Then** `ana` and `bruno` each get a web push, a native push and an email naming `rui` and
  "Norte"; `rui` gets nothing
- **And** when `ana` approves it, `rui` gets a push and an email saying "Norte" accepted him

#### The invited account hears about a claim request; the coach hears the answer
- **Given** coach `ana` and student `rui` (a real account), and a claimable placeholder on
  `ana`'s roster
- **When** `ana` creates a claim request for `rui`
- **Then** `rui` gets push and email; **and** when `rui` rejects it, `ana` gets push and email
  with the decision

#### Superadmins hear about a pending coach; the coach hears the approval
- **Given** a superadmin user with a device token
- **When** a coach self-registers and lands `pending`
- **Then** the superadmin gets a native push (and `ADMIN_NOTIFY_EMAIL` still gets its mail)
- **And** when the coach is approved they get a native push (and the existing approval email)

#### Opt-out silences every channel but not the badge
- **Given** `bruno` has `requestAlerts: false`
- **When** `rui` requests to join "Norte"
- **Then** `bruno` gets no push and no email, while `ana` does, and the request is still listed
  under Settings → Club for both

#### The switch persists
- **Given** a signed-in coach on Settings → Preferences (web or iOS)
- **When** they switch "Request alerts" off and reload
- **Then** the switch stays off and `GET /api/auth/me` returns `requestAlerts: false`

### Notes
- OPEN: role-neutral editable copy for these alerts (rule 4).
- OPEN: a native tap route for `type: "request"` once a settings deep link exists on iOS.
