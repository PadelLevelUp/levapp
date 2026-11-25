---
id: auth.push-subscription
status: implemented
depends_on: [auth.login]
serves: [P-AUTH-2]
governed_by: []
---

# auth.push-subscription


### Intent
Register browser push notification subscriptions for authenticated users.

### Entities
- **PushSubscription** (`push_subscriptions`): user_id (indexed, not unique), endpoint (unique; the browser's
  push-service URL, taken from subscription_json whenever that is set), subscription_json (VAPID payload)

### Rules
1. **One subscription per browser (PAD-753).** A row is keyed by its `endpoint`: a save upserts by
   endpoint, so the same browser saved again updates its row, and a user's laptop and phone browser
   each keep their own. A row whose endpoint another account saves moves to that account: the latest
   sign-in owns the browser, as a device token's does (`messaging.push-notifications` rule 9). A user
   keeps at most const:WEB_PUSH_SUBSCRIPTIONS_PER_USER rows; after each save, the user's rows beyond
   that, least recently updated first, are deleted (owner, 25 Nov 2026). Saving a browser again counts
   as updating it, even when nothing in it changed. iOS is unchanged: it already keeps one token per
   device. Before PAD-753 a user had one row, upserted by user, so the latest sign-in's
   browser was the only one that received pushes.
2. `POST /api/notifications/save-subscription` to register
3. `DELETE /api/notifications/unsubscribe` to unregister. With a body `{endpoint}` it deletes the
   CALLER's row for that endpoint only, so turning one browser off never silences another. With no body
   (an older cached bundle) it deletes every row the caller holds, which is what it always meant.
   Idempotent: 204 whether or not a row existed.
4. Subscription registered on login via frontend `requestAndSubscribe()`
5. There is exactly **one** registration endpoint and no alias for it. A second
   route that upserts `push_subscriptions` is drift, not redundancy: two
   implementations of the same contract can diverge silently, which is what
   B-008 recorded.
6. The surviving path is `/api/notifications/save-subscription`, not the
   better-named `/api/notifications/subscribe`, because it is the only one any
   client has ever called (`frontend/apps/web/src/utils/pushNotifications.ts`;
   git history confirms the web app never called `/subscribe`). Renaming to the
   tidier path would break push registration for every already-cached web bundle
   and service worker, so the live contract wins over the nicer name. Native iOS
   is unaffected — it registers device tokens at `/api/notifications/device`,
   a separate contract.
7. Two saves of the same browser at the same moment both succeed and leave one row
   (PAD-652, B-581; keyed on the endpoint since PAD-753). Each looks for the endpoint's row
   first; when neither finds it, both insert, and the second insert collides with the unique
   index `ix_push_subscriptions_endpoint`. The insert runs in a savepoint: on that collision only
   the savepoint rolls back, and the save updates the row the other request just wrote. The last
   write wins, and both answer 201. Prod had this on 2026-10-12, then on the per-user index: a 500
   (UniqueViolation on `ix_push_subscriptions_user_id`).
8. The web client sends one save per sign-in, not two (PAD-652). `login()` and the
   token effect both call `requestAndSubscribe`, so a second `subscribeToPush` for
   the same token while a save is in flight joins that save instead of sending
   its own. A call after the save has finished, or for a different token, sends
   a new one. Rule 7 still holds for any two clients that save at once, such as
   two tabs.

9. **A browser with permission keeps its subscription saved, and says when it could not (PAD-744,
   B-678).** Rule 4's sign-in save is not the only one. While signed in, when the page gains focus
   or becomes visible, a browser whose permission is `granted` saves its subscription once per page
   session, subscribing first if it has none. That covers a subscription the server dropped and one
   the browser rotated. The service worker has no JWT, so it does not re-send a rotated
   subscription itself; the next focus does. The save never prompts. A save that fails leaves the
   Messages page in a "not active" state: "Browser alerts aren't active" with a button that tries
   again (`data-testid` `push-inactive-banner`), instead of the generic "enable" prompt. The
   enable prompt (permission not yet decided) and the PAD-195 blocked banner (`denied`) are
   unchanged. `subscribe()` resolves `false` on a failed save and never rejects. Each failed save
   (`subscribe` = the browser's `pushManager.subscribe`, `post` = the save request) is reported to
   `POST /api/notifications/registration-failure` with the permission state, never the
   subscription (`admin.engine-health` rule 8, PAD-746); permission not granted reports nothing.
   Native's counterpart is `messaging.push-notifications` rule 15.

10. **A save names its browser (PAD-753).** `subscription.endpoint` must be a non-empty string of at
    most 2048 bytes; a save without one answers 400 and writes nothing. The endpoint is a capability (whoever holds it
    can push to that browser, B-254): it is never logged, and the data export withholds it
    (`admin.data-export` rule 4).
11. **The migration keeps every working subscription (PAD-753).** It expands only
    (`delivery.zero-downtime-deploy` rule 12): the previous release inserts without an endpoint while a
    deploy rolls, and after a rollback.
    - The schema revision adds `endpoint`, nullable, with the unique index
      `ix_push_subscriptions_endpoint` (empty values never collide), and turns
      `ix_push_subscriptions_user_id` into a plain index. The next revision fills `endpoint` from each
      row's `subscription_json`.
    - Every existing row keeps working with nothing for its user to do (the 19 web-push-only students of
      PAD-741). A row with no readable endpoint in its JSON cannot be sent to: it is deleted and the
      migration logs how many (expected 0), never their contents. Two rows with the same endpoint (one
      browser saved under two accounts) keep the most recently updated.
    - A row the previous release wrote, whose `endpoint` is empty or is not its JSON's, is replaced when
      its browser next saves: one browser never ends with two rows.
    - The downgrade keeps each user's most recently updated row and restores the per-user unique index.
    - Making `endpoint` NOT NULL is a later release's contract step (Open questions).

### Acceptance Criteria

#### AUTH-PUSH-SUBSCRIPTION-1: Register push subscription
- **Given** an authenticated user
- **When** they POST to `/api/notifications/save-subscription` with a valid VAPID subscription JSON
- **Then** the subscription is stored under its endpoint (or that endpoint's row updated if it exists)
- **And** push notifications can be sent to this user

#### AUTH-PUSH-SUBSCRIPTION-2: Only one registration endpoint exists
- **Given** an authenticated user whose token would be accepted by the notifications blueprint
- **When** they POST to `/api/notifications/subscribe` with a valid VAPID subscription JSON
- **Then** the response is 404 (the route does not exist)
- **And** no `push_subscriptions` row is created or modified for that user

#### AUTH-PUSH-SUBSCRIPTION-3: Two saves of one browser at once keep one subscription
- **Given** an authenticated user with no push subscription
- **When** two POSTs to `/api/notifications/save-subscription` for that user and the same endpoint reach their insert at the same moment
- **Then** both answer 201
- **And** that endpoint has exactly one `push_subscriptions` row, holding one of the two subscriptions

#### AUTH-PUSH-SUBSCRIPTION-4: A save whose insert collides updates the existing row
- **Given** a user whose subscription row for this endpoint was written after this save looked for it
- **When** the save's insert collides with that row
- **Then** the response is 201 and the row holds this save's subscription

#### AUTH-PUSH-SUBSCRIPTION-5: Sign-in sends one save
- **Given** the web app with notification permission granted
- **When** sign-in calls `requestAndSubscribe` twice with the same token before the first save has answered
- **Then** exactly one POST to `/api/notifications/save-subscription` is sent

#### AUTH-PUSH-SUBSCRIPTION-6: Focus re-saves a granted browser's subscription once (PAD-744)
- **Given** a signed-in coach whose browser permission is `granted` and whose subscription the
  server does not hold
- **When** the tab gains focus twice
- **Then** one `POST /api/notifications/save-subscription` is sent, with no permission prompt

#### AUTH-PUSH-SUBSCRIPTION-7: A failed save shows the not-active banner with a retry (PAD-744)
- **Given** a signed-in coach whose browser permission is `granted`
- **When** the subscription save answers 500
- **Then** the Messages page shows `push-inactive-banner` with "Browser alerts aren't active", and its
  button saves again; no unhandled rejection is raised

#### AUTH-PUSH-SUBSCRIPTION-8: A save needs a session and a subscription (rule 2)
- **Given** a signed-in user
- **When** they POST `/api/notifications/save-subscription` with no `subscription` in the body
- **Then** the answer is 400
- **And** the same route with no session answers 401
test: `backend/padel_app/tests/test_pad173_single_subscription_route.py` › `test_save_subscription_rejects_missing_subscription` (+1 more)

#### AUTH-PUSH-SUBSCRIPTION-9: Two browsers keep two subscriptions (rule 1, PAD-753)
- **Given** a student who saves a subscription from a laptop and then one from a phone browser
- **When** a push is sent to them
- **Then** they hold two rows, and each browser gets the push
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_two_browsers_keep_two_subscriptions_and_both_get_the_push`

#### AUTH-PUSH-SUBSCRIPTION-10: The latest sign-in owns the browser (rule 1)
- **Given** an endpoint saved by student A
- **When** student B saves the same endpoint
- **Then** the row belongs to B, A holds no row for it, and a push to A does not reach that browser
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_the_latest_sign_in_owns_the_browser`

#### AUTH-PUSH-SUBSCRIPTION-11: A save beyond the cap evicts the least recently updated (rule 1)
- **Given** a user with const:WEB_PUSH_SUBSCRIPTIONS_PER_USER subscriptions saved at different times
- **When** the oldest browser saves again, unchanged, and then a new browser saves
- **Then** they hold const:WEB_PUSH_SUBSCRIPTIONS_PER_USER rows, the new one and the one saved again among them, and the least recently updated gone
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_a_save_beyond_the_cap_evicts_the_least_recently_updated`

#### AUTH-PUSH-SUBSCRIPTION-12: Unsubscribing names its browser; no body means all (rule 3)
- **Given** a user with two subscriptions
- **When** they DELETE `/api/notifications/unsubscribe` with one endpoint, then again with no body
- **Then** the first call leaves the other browser's row; the second leaves none; both answer 204
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_unsubscribe_by_endpoint_and_with_no_body`

#### AUTH-PUSH-SUBSCRIPTION-13: A save without an endpoint is refused (rule 10)
- **Given** a signed-in user
- **When** they POST a subscription with no `endpoint`, an empty one, one that is not a string, or one longer than 2048 bytes
- **Then** the answer is 400 and no row is written
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_a_save_without_an_endpoint_is_refused`

#### AUTH-PUSH-SUBSCRIPTION-14: The migration keeps the working rows (rule 11)
- **Given** a database before the migration with three users' rows, one row whose JSON has no endpoint, one that is not JSON, and two users' rows sharing one endpoint
- **When** the migration upgrades
- **Then** every row with an endpoint has it in the new column, the rows without one are gone and counted in the log, the shared endpoint keeps the most recently updated row, and a user may now hold two rows
- **And** an insert with no endpoint, as the previous release makes, still succeeds
- **And** the downgrade leaves each user's most recently updated row and the per-user unique index
test: `backend/padel_app/tests/test_pad753_push_endpoint_migration.py` › `test_the_migration_keeps_every_working_subscription`

#### AUTH-PUSH-SUBSCRIPTION-15: A row the previous release wrote is replaced when its browser saves (rule 11)
- **Given** a user with one row that has no endpoint, and one whose endpoint is another browser's, both holding this browser's subscription
- **When** this browser saves
- **Then** the user holds one row for this browser, under its endpoint
test: `backend/padel_app/tests/test_pad753_push_per_browser.py` › `test_a_row_the_previous_release_wrote_is_replaced`

### Today (PAD-753)
- Model: `backend/padel_app/models/push_subscriptions.py:22-28` (`user_id` `unique=True, index=True`; no endpoint column).
  Migrations: `5b9a1c2d7e8f` (table, `UniqueConstraint("user_id")`, unique `ix_push_subscriptions_user_id`), then
  `19358b6b74b1` dropped the constraint `push_subscriptions_user_id_key`; on Postgres only the unique index enforces
  one per user. Alembic head on `origin/staging` b8b34453d: `32e30677a843`.
- Save and unsubscribe: `backend/padel_app/modules/notifications_api.py` `save_subscription` (by user, savepoint on
  collision) and `unsubscribe_notifications` (deletes the user's one row).
- Send: `utils/push_notifications.py:26` (`filter_by(user_id).first()`), outbox `utils/push_outbox.py:237-249` (same).
  A 404/410 already deletes the row it was sent to (`push_notifications.py:93-104`).
- Other readers: claim merge `services/player_claim_service.py:422` (`_repoint_user_unique(..., (), ...)`) and its
  `MERGE_UNIQUE_KEYS_HANDLED` key (`:125`); engine health `services/admin/engine_health.py:166-178` (EXISTS, counts
  users); `users_service.py:153`, `account_service.py:167` (unchanged); `tools/redaction.py:15` (only `subscription_json`).
- Web: `AuthContext.tsx:121-146` logout posts no body; `utils/pushNotifications.ts:169-190` `unsubscribeFromPush` sends
  no body (its hook's `unsubscribe` has no caller); `api/client.ts:10` reads the token at request time.
- Tests whose fixtures build a `PushSubscription` (the column stays nullable, so those with no endpoint in the JSON still
  insert): `test_pad746_push_reach.py:55`, `test_pad268_account_deletion_cascade.py:148`, `test_pad528_merge_flow.py:387`
  (and `:392-393`, which asserts one row kept), `test_pad640_export_user_data.py:119`, `test_pad294_push_sender.py:130`,
  `test_pad294_push_sender_review.py:43`, `test_pad606_staging_scrub.py:227`; check also `conftest.py`,
  `test_pad699_push_outbox.py`, `test_pad532_view_as.py`, `test_pad534_engine_health.py`, `test_b254_no_addresses_in_logs.py`,
  `test_pad745_push_receipts.py`, `test_pad689_stream_observability.py`, `test_pad173_single_subscription_route.py`
  (`:88` `test_save_subscription_upserts_one_row_per_user` changes with rule 1), `test_pad652_save_subscription_race.py`.

### Waves (PAD-753)
1. Schema: the two revisions and the model (rule 11, -14), the redaction (`admin.data-export` -7).
2. Save, unsubscribe, cap (-1, -3, -4, -9 … -13, -15), send and outbox (`messaging.push-notifications` -38 … -40), claim merge
   (`players.claim` -34), engine health (`admin.engine-health` -30).
3. Logout (`auth.logout` rule 4, -9, -10): server and web body.

### Open questions
- **Q1 (decided, owner, 25 Nov 2026):** at most const:WEB_PUSH_SUBSCRIPTIONS_PER_USER browsers per user.
- **Q2 (decided, owner, 25 Nov 2026):** signing out removes that browser's subscription (`auth.logout` rule 4).
- **Q3 (owner, open): tell iPhone Safari users to use the app?** Not asked, not decided, not built. If yes: one
  dismissible banner pointing to the App Store app, web only; `isIosBrowserWithoutApp` (PAD-839) already tells the browser.
- **Q4 (owner, open): the promise.** `specflow/promises/auth/coach-signs-in-and-stays-connected.md` (P-AUTH-2) says "A
  device registers for push only while the session is valid, with at most one registration per user per app:
  re-registering replaces the old one." The owner's Q1 answer is later and allows several browsers; the promise's
  wording was not answered, so it is not edited here. Proposed: "A device or browser registers for push only while the
  session is valid; registering the same one again replaces its registration, and a user keeps at most a few browsers."
- **Decided (owner):** the endpoint is withheld from the data export (`admin.data-export` rule 4, -7).
- **Contract step (later release):** once no deployed release writes rows without an endpoint, fill any left, delete
  those with none, and make `endpoint` NOT NULL.
- **Mine (the lead can reverse):** an outbox row names its subscription by id, never by endpoint
  (`messaging.push-notifications` rule 10a); an outbox row written before the deploy (no id) is sent to every row the
  user holds when it drains; the 2048-byte limit on an endpoint (the index refuses a longer value with an error).
