# API Contract — LevelUp Backend (Flask)

Derived from backend source (`backend/padel_app/`): route blueprints, SQLAlchemy models, and serializers. This is the contract the typed client in `packages/api` targets. Do not invent endpoints — anything not listed here does not exist.

## 1. Auth Scheme

- **Type:** JWT (flask-jwt-extended)
- **Token location:** `Authorization: Bearer <token>` header **or** `?token=<token>` query param (config.py: `JWT_TOKEN_LOCATION = ["headers", "query_string"]`, `JWT_QUERY_STRING_NAME = "token"`)
- **Lifetime:** 30 days (`JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)`)
- **Rolling refresh:** on every response, if the token has < 15 days left the server sets an `X-New-Token` response header with a fresh token. Clients must persist it. There is NO separate refresh endpoint.
- **Logout:** `POST /api/auth/logout` — blocklists the JWT `jti`. Every request checks the blocklist.
- **Login:** `POST /api/auth/login` `{username, password}` → `{accessToken, user: {id, name, role}}`
- **Registration/invite flows (no JWT — token is in the link):**
  - Coach-created account: `GET /api/app/register/user/<user_id>?token=<t>` → `POST /api/app/activate/user/<user_id>` `{token, …}` — `t` is the secret in the `/register/<id>?t=` link (PAD-254); without it both are 404
  - Coach via club invite: `GET /api/app/coach-invitations/<token>` → `POST /api/app/coach-invitations/<token>/accept`
  - Player via invite: `GET /api/app/player-invitations/<token>` → `POST /api/app/player-invitations/<token>/accept`
  - Both accept endpoints return `{accessToken}` for immediate login.

## 2. CORS

`/api/*` only. Allowed origins: `http://localhost:8080`, `http://34.78.247.45`. `supports_credentials=false`. Allowed headers: `Content-Type`, `Authorization`. Exposed: `X-New-Token`.
(Note for mobile: native apps don't enforce CORS; irrelevant for the RN client.)

## 3. Endpoints

### `/api/auth` (api_auth.py)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | None | `{username*, password*}` | `{accessToken, user: {id, name, role}}` |
| POST | `/api/auth/logout` | JWT | — | `{message}` |
| GET | `/api/auth/me` | JWT | — | `{id, username, name, roles: string[], coachId: int\|null, isSuperAdmin: bool, language}` |
| PATCH | `/api/auth/me` | JWT | `{language?: "pt"\|"en"}` | same as GET /me |

### `/api/app` (frontend_api.py)

Health & registration:
| GET | `/api/app/healthz` | None | — | `{status: "ok"\|"db_unreachable"\|"scheduler_not_ready"}` |
| GET | `/api/app/register/user/<user_id>?token=` | None (token) | — | `{id, name, username, email, phone, isActive}` while inactive; `{isActive: true}` after; 404 without the token |
| POST | `/api/app/activate/user/<user_id>` | None (token) | `{token, name, username, email, phone, password}` | `{success: true}`; 404 without the token, 410 unless inactive |

Dashboard & calendar:
| GET | `/api/app/dashboard` | JWT | — | dashboard payload (blocks: KPI grid, class list, messages overview, notification activity) |
| GET | `/api/app/calendar` | JWT | `?from=ISO*&to=ISO*` | `CalendarEvent[]` |
| GET | `/api/app/lesson_instances` | JWT (coach) | `?from=ISO*&to=ISO*` | lesson instance list |

Lessons / classes:
| GET | `/api/app/lesson_instance/<id>` | JWT | — | `{lessonInstance, presences}` |
| GET | `/api/app/lesson_instance/<id>/presences` | JWT | — | `serialize_presence[]` |
| POST | `/api/app/class_instance` | JWT | `?model=lesson\|lessoninstance*&id=*&date=YYYY-MM-DD` | serialize_class_instance |
| POST | `/api/app/add_class` | JWT | `{title, type, date, start_time, end_time, max_players, color, ...}` | serialize_calendar_event |
| POST | `/api/app/edit_class` | None | `{id, model, date, ...}` | varies |
| POST | `/api/app/remove_class` | None | `{id, model, occDate?, scope?}` | varies |
| POST | `/api/app/class_instance/presences/confirm` | JWT | `{classInstance: id, presences: [...]}` | `{presences, notifiedPlayers, approvalBundle}` |
| POST | `/api/app/class_instance/training/confirm` | JWT | `{classInstance: id, exerciseIds: string[]}` | `{plannedExerciseIds}` |

Calendar blocks / events:
| POST | `/api/app/add_event` | JWT | `{type*, date*, startTime*, endTime*, title?, description?, isRecurring?, recurrenceRule?, endDate?}` | serialize_calendar_block 201 |
| GET | `/api/app/calendar_block/<id>` | JWT | — | serialize_calendar_block |
| PUT | `/api/app/calendar_block/<id>` | JWT | same fields as add_event | serialize_calendar_block |
| DELETE | `/api/app/calendar_block/<id>` | JWT | `{occDate?, scope?: "all"\|"single"\|"future"}` | 204 |
| POST | `/api/app/reschedule_block/<id>` | JWT | `{occDate*, newDate*, newStartTime*, newEndTime*, scope?}` | 204 |
| GET | `/api/app/calendar_event` | None | `?model=lesson\|lesson_instance\|calendar_block*&original_id=*` | serialize_calendar_event |

Availability blockers (student-only, requires player profile):
| GET/POST | `/api/app/availability_blockers` | JWT | POST: `{type*, date*, startTime*, endTime*, ...}` | serialize_calendar_block[] / 201 |
| PUT/DELETE | `/api/app/availability_blockers/<id>` | JWT | PUT: same; DELETE: `{occDate?, scope?}` | block / 204 |

Coach:
| GET | `/api/app/coach` | JWT | — | `{id, user, club: {id, name}\|null}` |
| GET | `/api/app/coach_levels` | JWT | — | `serialize_coach_level[]` |
| POST | `/api/app/add_coach_level` | JWT | `{levels: [{code, label, displayOrder}]}` | echoes |
| POST | `/api/app/delete/coach_level` | None | `{id}` | `{status}` |
| GET | `/api/app/evaluation_categories` | JWT | — | categories |
| POST | `/api/app/add_evaluation_categories` | JWT | `{categories: [...]}` | echoes |
| POST | `/api/app/delete/evaluation_category` | None | `{id}` | `{status}` |
| POST | `/api/app/add_coach_note` | JWT | `{player_id, type: "strength"\|"weakness", text}` | result |
| POST | `/api/app/delete/coach_note` | None | `{id}` | `{status}` |
| POST | `/api/app/add_evaluation_entry` | JWT | `{player_id, category_id, value, notes?}` | result |

Players:
| GET | `/api/app/players` | JWT | — | `[{id, userId, name, email, phone}]` |
| GET | `/api/app/coach_players` | JWT | — | coach's full player list |
| GET | `/api/app/coach_players_paginated` | JWT | `?page&per_page&search&sort_by&sort_dir&missing_level&missing_side` | paginated |
| GET | `/api/app/player_profile/<player_id>` | JWT | — | player profile |
| POST | `/api/app/add_player` | None | `{coach_id, player_id?, name, email, phone, ...}` | coach_player_info |
| POST | `/api/app/edit_player` | None | `{coach_id, player_id, levelId?, side?, ...}` | coach_player_info |
| POST | `/api/app/remove_player` | None | `{coach_id, player_id}` | varies |
| POST | `/api/app/check_field_available` | None | `{model*: "user", field*: "username"\|"email"\|"name", value*, scope?}` | `{available, message?}` or 409 |

Users: `GET /api/app/users` (JWT) → serialize_user[] (active only)

Invitations:
| POST | `/api/app/club/<club_id>/coach-invitations` | JWT | `{email?}` | `{token, inviteLink, expiresAt}` 201 |
| GET | `/api/app/club/<club_id>/coach-invitations` | JWT | — | `[{token, email, expiresAt, createdAt}]` |
| GET | `/api/app/coach-invitations/<token>` | None | — | `{clubName, status}` |
| POST | `/api/app/coach-invitations/<token>/accept` | JWT optional | `{name?, password?, ...}` | `{success}` or `{accessToken}` |
| POST | `/api/app/coach-invitations/<token>/revoke` | JWT | — | `{success}` |
| POST | `/api/app/incomplete_player` | JWT | `{coachId?, name, levelId?, side?, notes?, email?}` | `{token, inviteLink, expiresAt}` 201 |
| GET | `/api/app/player-invitations/<token>` | None | — | `{playerName, status}` |
| POST | `/api/app/player-invitations/<token>/accept` | None | `{password*, username*}` | `{accessToken}` |

Messaging:
| GET | `/api/app/messages/unread_count` | JWT | — | `{unreadCount}` |
| GET | `/api/app/conversations` | JWT | `?page=1&limit=20` | `{conversations, hasMore}` |
| GET | `/api/app/conversation/<id>` | JWT | — | serialize_conversation_detail |
| POST | `/api/app/conversation/<id>/read` | JWT | — | 204 |
| POST | `/api/app/conversation` | JWT | `{otherParticipants*: int[]}` | conversation detail 201 |
| POST | `/api/app/message` | JWT | `{text*, conversationId*, replyToId?}` | serialize_message 201 |
| PUT | `/api/app/message/<id>` | JWT | `{text*}` | `{ok}` |
| DELETE | `/api/app/message/<id>` | JWT | — | `{ok}` |
| POST | `/api/app/message/<id>/reaction` | JWT | `{emoji*}` | `{ok}` |

Import (coach): `POST /api/app/import/analyze` (multipart `file`, SSE response), `POST /api/app/import/confirm`, `POST /api/app/import/confirm/stream` (SSE), `GET /api/app/import/history`, `POST /api/app/import/<id>/revert` — all JWT.

Exercises / training (all JWT):
| GET/POST | `/api/app/exercises` | `{name*, type*, difficulty?, description?, customType?, levelIds?, diagram?, notes?}` | serialize_exercise[] / 201 |
| GET/PUT/DELETE | `/api/app/exercises/<id>` | PUT: same as POST | exercise / 204 |
| GET/POST | `/api/app/exercise-groups` | `{name*, description?}` | group[] / 201 |
| PUT/DELETE | `/api/app/exercise-groups/<id>` | | group / 204 |

### `/api/app/notify` — Notification engine (all JWT)

Coach-only: `GET/POST /config`, `POST /toggle_class {model?, originalId*}`, `POST /manual {originalId*, playerIds*, model?, date?}`, `POST /send_reminders`, `GET /groups?originalId*`, `GET /activity`, `GET /waiting_list/<instance_id>`, `POST /coach_respond {notificationEventId*, action*: "yes"|"no"}`, `POST /approval/respond {bundleId*, action*: "yes_now"|"yes_at_window"|"dismiss"}`, `GET/POST /standing_waiting_list`, `DELETE /standing_waiting_list/<entry_id>`.
Any role: `POST /respond {notificationEventId*, action*}`, `POST /respond_reminder {lessonInstanceId*, action*}`, `POST /cancel_attendance {lessonInstanceId*}` (409 if past deadline), `POST /respond_waiting_list {lessonInstanceId*, action*}`, `POST /process_rounds`.

### `/api/notifications` — Push subscriptions (Web Push)

| GET | `/api/notifications/vapid-public-key` | None | — | `{publicKey}` |
| POST | `/api/notifications/subscribe` | JWT | `{subscription*: PushSubscription JSON}` | `{success}` 201 |
| DELETE | `/api/notifications/unsubscribe` | JWT | — | 204 |

NOTE: backend push is **Web Push (VAPID)** only. There is no native APNs/FCM device-token endpoint — this is an endpoint gap for native mobile push (see PR notes).

### `/api/editor` — superadmin CRUD (JWT + is_superadmin): `GET /models`, `GET /<model>/schema|options`, `GET /<model>?page&search`, `GET/POST/PATCH/DELETE /<model>[/<id>]`. (Web-only admin tool; out of mobile scope.)

## 4. SSE / Streaming

| Endpoint | Auth |
|---|---|
| `GET /api/app/events` | JWT via `?token=` query param only |
| `POST /api/app/import/analyze`, `POST /api/app/import/confirm/stream` | JWT header |

`/api/app/events` is a global broadcast channel; events are JSON with a `type` field: `message_created`, `message_edited`, `message_deleted`, `message_reaction`. Keep-alive comment every 15s. RN has no EventSource — the mobile client uses `react-native-sse` (EventSource polyfill) pointed at the same endpoint.

## 5. Key serializer shapes

- `serialize_user`: `{id, name, username, email, phone, isActive, language, avatarUrl, abbreviation}`
- `serialize_coach_level`: `{id: str, coachId, code, label, displayOrder}`
- `serialize_lesson`: `{id, coachIds, type: "academy"|"private", status, color, maxPlayers, levelId, name, description, isRecurring, recurrenceRule, recurrenceEnd, startDate, defaultStartTime, defaultEndTime}`
- `serialize_lesson_instance`: `{id, lessonId, date, startTime, endTime, status: "scheduled"|"canceled"|"rescheduled"|"completed", notes, overriddenFields, name, color, maxPlayers}`
- `serialize_class_instance`: lesson+instance merge: `{coachId, name, levelId, participants: Player[], recurrenceEnd, notificationsEnabled, parentClassId, notes, overriddenFields, presences, invitations: [{id, playerId, playerName, status}], plannedExerciseIds, cancellationDeadlineHours, cancellationDeadline}`. Students see only their own presences/invitations.
- `serialize_calendar_event`: `{model: "LessonInstance"|"Lesson"|"CalendarBlock", title, originalId, id, date, startTime, endTime, status, type: "class"|"block", classType?, participantCount?, maxPlayers?, color?, levelId?, isRecurring?, blockType?}`
- `serialize_calendar_block`: `{id, userId, type: "break"|"holiday"|"off_work"|"personal"|"unavailable", title, description, isRecurring, recurrenceRule, recurrenceEnd, blocksAutoInvitations, date, startTime, endTime}`
- `serialize_presence`: `{id, lessonInstanceId, playerId, status: "present"|"absent"|null, justification: "justified"|"unjustified"|null, invited, confirmed, validated, lateCancellation}`
- `serialize_message`: `{id, senderId, content, timestamp, conversationId, isRead, status: "read"|"delivered", replyTo, edited, isDeleted, reactions: [{emoji, userId}], messageType, metadata}`
- `serialize_conversation`: `{id, participantId, participantName, participantAvatar, participantRole, isAssistant, lastMessage, lastMessageAt, unreadCount}`; detail adds `messages[]`
- `serialize_exercise`: `{id: str, name, description, type, customType, difficulty: 1-5, levelIds: str[], diagram, notes, createdAt, updatedAt}`
- `serialize_exercise_group`: `{id: str, name, description, exerciseIds: str[], createdAt, updatedAt}`

## 6. Local test backend

```bash
cd backend && source .venv/bin/activate
FLASK_APP=padel_app FLASK_ENV=development POSTGRES_HOST=localhost POSTGRES_PORT=5432 \
POSTGRES_USER=padel_app_user POSTGRES_PW=$POSTGRES_PW POSTGRES_DB=levelup_test \
JWT_SECRET_KEY=e2e-test-secret E2E_DEBUG_ENDPOINTS=true TEST_MODE=true \
flask run --host 127.0.0.1 --port 5001 --no-reload
```
Seed first: `bash apps/web/e2e/scripts/reset-test-db.sh` (needs `POSTGRES_PW`). Seeded users: `e2e-coach / E2eCoach123!` (coach), `e2e-student / E2eStudent123!` (student). IMPORTANT: `secrets.env` sets `POSTGRES_HOST` to the production IP — always override to `localhost`.
