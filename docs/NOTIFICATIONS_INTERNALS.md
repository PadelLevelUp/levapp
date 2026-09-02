# Notifications — Internal Reference

This document contains the actual source code for the models, core service functions, and trigger
mechanism that need to be understood before rewriting the notification engine.

---

## 1. Models

### NotificationConfig
`levelup_backend/padel_app/models/notification_config.py`

```python
DEFAULT_PRIORITY_CRITERIA = [
    {"id": "level",               "label": "Level",               "enabled": True},
    {"id": "justified_misses",    "label": "Justified Misses",    "enabled": True},
    {"id": "attendance",          "label": "Attendance",          "enabled": True},
    {"id": "playing_side",        "label": "Playing Side",        "enabled": False},
    {"id": "subscription_status", "label": "Subscription Status", "enabled": False},
]

DEFAULT_RESTRICTIONS = {
    "maxSimultaneous":           {"enabled": True,  "value": 3},
    "maxTotal":                  {"enabled": True,  "value": 10},
    "maxLevelDeviation":         {"enabled": True,  "value": 1},
    "minTimeBeforeClass":        {"enabled": False, "value": 30},
    "maxInvitesPerStudentPerDay":{"enabled": False, "value": 3},
    "quietHours":                {"enabled": False},
}

DEFAULT_ROUNDS = [
    {"id": 1, "duration": 10, "description": "Top-ranked students"},
    {"id": 2, "duration": 10, "description": "Next group"},
    {"id": 3, "duration": 15, "description": "Broader search"},
]

DEFAULT_NOTIFICATION_GROUPS = [
    {"id": "same_level",          "label": "Same level",          "enabled": True},
    {"id": "recent_absences",     "label": "Recent absences",     "enabled": True},
    {"id": "justified_absences",  "label": "Justified absences",  "enabled": True},
    {"id": "all_students",        "label": "All students",        "enabled": True},
]

DEFAULT_MESSAGE_TEMPLATES = {
    "invite":      "Hey {name}, we have an opening in the {level} class next {weekday} at {time}. Do you want to come?",
    "confirm":     "Great! I'm counting on you! See you there 🎾",
    "decline":     "No problem, see you next time!",
    "spot_filled": "Sorry, this place was filled already! I'll get back to you if something else opens up.",
}


class NotificationConfig(db.Model, model.Model):
    __tablename__ = "notification_configs"

    id = Column(Integer, primary_key=True)
    coach_id              = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), unique=True, nullable=False)
    auto_notify_enabled   = Column(Boolean, default=False, nullable=False)
    priority_criteria     = Column(JSON, nullable=True)   # list of {id, label, enabled}
    restrictions          = Column(JSON, nullable=True)   # dict matching DEFAULT_RESTRICTIONS shape
    rounds                = Column(JSON, nullable=True)   # list of {id, duration, description}
    notification_groups   = Column(JSON, nullable=True)   # list of {id, label, enabled}
    message_templates     = Column(JSON, nullable=True)   # dict matching DEFAULT_MESSAGE_TEMPLATES shape

    # Accessors — each falls back to the default constant when the column is NULL
    def get_priority_criteria(self):  ...
    def get_restrictions(self):       ...
    def get_rounds(self):             ...
    def get_notification_groups(self):...
    def get_message_templates(self):  # merges stored keys with defaults for missing keys
        if self.message_templates is None:
            return DEFAULT_MESSAGE_TEMPLATES
        return {**DEFAULT_MESSAGE_TEMPLATES, **self.message_templates}
```

Key notes:
- One row per coach (`coach_id` is UNIQUE).
- All JSON columns are `nullable=True`. `None` means "use the default constant".
- `get_message_templates()` merges stored keys with defaults so partial overrides work.
- `rounds[].id` is 1-based. Round timing is computed as the **sum of durations of all rounds
  with id < current_round_id** (see `process_queued_rounds`).

---

### NotificationEvent
`levelup_backend/padel_app/models/notification_event.py`

```python
class NotificationEvent(db.Model, model.Model):
    __tablename__ = "notification_events"

    id                 = Column(Integer, primary_key=True)
    coach_id           = Column(Integer, ForeignKey("coaches.id",          ondelete="CASCADE"), nullable=False)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False)
    player_id          = Column(Integer, ForeignKey("players.id",          ondelete="CASCADE"), nullable=False)
    type               = Column(Enum("manual", "auto",                     name="notification_event_type"),   default="manual", nullable=False)
    round_number       = Column(Integer, default=1, nullable=False)
    status             = Column(Enum("sent", "confirmed", "expired", "queued", name="notification_event_status"), default="sent", nullable=False)
    message_id         = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    # inherited: created_at, updated_at
```

Status state machine:
```
queued → sent → confirmed
              ↘ expired
sent   →        expired   (player says No, or spot filled by someone else)
```

`message_id` is `NULL` for `queued` events (the message hasn't been sent yet) and for older
records created before the field existed.

---

### LessonInstance (relevant fields)
`levelup_backend/padel_app/models/lesson_instances.py`

```python
class LessonInstance(db.Model, model.Model):
    __tablename__ = "lesson_instances"

    id                             = Column(Integer, primary_key=True)
    lesson_id                      = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    original_lesson_occurence_date = Column(Date)
    start_datetime                 = Column(DateTime, nullable=False)
    end_datetime                   = Column(DateTime, nullable=False)
    overwrite_title                = Column(String(255), nullable=True)
    level_id                       = Column(Integer, ForeignKey("coach_levels.id"))
    notifications_enabled          = Column(Boolean, default=True, nullable=False, server_default="1")
    status                         = Column(Enum("scheduled","canceled","rescheduled","completed"), default="scheduled", nullable=False)
    notes                          = Column(Text, nullable=True)
    max_players                    = Column(Integer, nullable=False)
    overridden_fields              = Column(Text)

    presences         = relationship("Presence", ...)
    players_relations = relationship("Association_PlayerLessonInstance", ...)   # current roster
    coaches_relations = relationship("Association_CoachLessonInstance",  ...)

    @property
    def title(self):
        return self.overwrite_title or self.lesson.title

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]
```

Notification-relevant fields:
- `notifications_enabled` — per-instance toggle; defaults to `True`. The auto-trigger checks
  this before firing.
- `start_datetime` — used for quiet-hours check, min-time-before-class restriction, and for
  formatting the invite message (`{weekday}`, `{time}`).
- `max_players` — capacity; open spots = `max_players - _effective_filled_spots(instance)`.
- `level_id` — used for `maxLevelDeviation` restriction and for the `same_level` group.

---

## 2. Core Service Functions
`levelup_backend/padel_app/services/notification_service.py`

### `get_eligible_students` (line 137)

```python
def get_eligible_students(
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
) -> list[Association_CoachPlayer]:
    restrictions = config.get_restrictions()

    # 1. All coach players not already enrolled in this instance
    enrolled_ids = {rel.player_id for rel in instance.players_relations}
    coach_players = [
        cp for cp in Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()
        if cp.player_id not in enrolled_ids
    ]

    # 2. Apply maxLevelDeviation filter (if enabled and instance has a level)
    if restrictions.get("maxLevelDeviation", {}).get("enabled") and instance.level_id:
        max_dev = restrictions["maxLevelDeviation"]["value"]
        instance_order = instance.level.display_order if instance.level else None
        if instance_order is not None:
            coach_players = [
                cp for cp in coach_players
                if cp.level and abs(cp.level.display_order - instance_order) <= max_dev
            ]

    # 3. Build attendance/justification stats per player
    player_stats = {}
    for cp in coach_players:
        att_rate, just_rate = _attendance_stats(cp.player_id)
        player_stats[cp.player_id] = {
            "attendance_rate": att_rate,
            "justified_miss_rate": just_rate,
        }

    # 4. Sort by configured priority criteria order
    criteria = config.get_priority_criteria()
    sort_key = _build_sort_key(criteria, player_stats)
    return sorted(coach_players, key=sort_key)
```

**Does not** exclude already-notified players — that exclusion happens in `trigger_auto_notifications`
immediately before bucketing.

---

### `trigger_auto_notifications` (line 378)

```python
def trigger_auto_notifications(instance: LessonInstance, coach_id: int) -> list[dict]:
    config = get_or_create_config(coach_id)

    # Gate checks
    if not config.auto_notify_enabled:     return []
    if not instance.notifications_enabled: return []

    open_spots = instance.max_players - _effective_filled_spots(instance)
    if open_spots <= 0: return []

    restrictions = config.get_restrictions()
    if not _check_restrictions(instance, coach_id, restrictions): return []

    eligible = get_eligible_students(instance, coach_id, config)
    if not eligible: return []

    rounds  = config.get_rounds()
    max_sim = restrictions.get("maxSimultaneous", {}).get("value", 3)

    # Players with an active pending event are skipped (expired are NOT skipped,
    # so a previously-declined player can be re-invited if a new spot opens)
    already_notified = {
        e.player_id
        for e in NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance.id,
            NotificationEvent.status.in_(["sent", "queued", "confirmed"]),
        ).all()
    }

    remaining = [cp for cp in eligible if cp.player_id not in already_notified]
    round1_notified: list[dict] = []

    for round_idx, round_cfg in enumerate(rounds):
        bucket    = remaining[:max_sim]
        remaining = remaining[max_sim:]
        round_number = round_idx + 1

        if round_number == 1:
            # Fire immediately — create event + send chat message + push
            for cp in bucket:
                if not _check_per_student_daily_limit(cp.player_id, coach_id, restrictions):
                    continue
                event = NotificationEvent(
                    coach_id=coach_id, lesson_instance_id=instance.id,
                    player_id=cp.player_id, type="auto", round_number=1, status="sent",
                )
                event.create()
                msg = _send_system_message(
                    coach_user_id, player_user_id, text,
                    message_type="notification_invite",
                    msg_metadata={
                        "notificationEventId": event.id,
                        "lessonInstanceId": instance.id,
                        "responded": False,
                    },
                )
                event.message_id = msg.id
                event.save()
                round1_notified.append({"id": str(cp.player_id), "name": player_name})
        else:
            # Queue for later — no message sent yet
            for cp in bucket:
                NotificationEvent(
                    coach_id=coach_id, lesson_instance_id=instance.id,
                    player_id=cp.player_id, type="auto",
                    round_number=round_number, status="queued",
                ).create()

        if not remaining:
            break

    publish({"type": "notify_sent", ...})
    return round1_notified
```

**Important**: `queued` events have no `message_id`. `process_queued_rounds` currently sends a
generic push notification when it fires them — it does **not** send a chat message or a new
`notification_invite` for later rounds.

---

### `process_queued_rounds` (line 509)

```python
def process_queued_rounds() -> int:
    queued = NotificationEvent.query.filter_by(status="queued").all()
    sent_count = 0

    for event in queued:
        config = get_or_create_config(event.coach_id)
        rounds = config.get_rounds()

        # Wait time = sum of durations for all rounds BEFORE this one
        wait_minutes = sum(r["duration"] for r in rounds if r["id"] < event.round_number)
        due_at = event.created_at + timedelta(minutes=wait_minutes)

        if datetime.utcnow() < due_at:
            continue   # not yet due

        instance = event.lesson_instance

        # Expire silently if spot is already filled
        if _effective_filled_spots(instance) >= instance.max_players:
            event.status = "expired"
            event.save()
            continue

        # Expire silently if player hit daily limit
        if not _check_per_student_daily_limit(event.player_id, event.coach_id, restrictions):
            event.status = "expired"
            event.save()
            continue

        # Send a push-only notification (NO chat message for later rounds)
        send_push_notification(
            user_id=_user_id_for_player(event.player_id),
            title="Spot still available!",
            body=f"A spot is still open in {instance.title}. Tap to see details.",
            url="/calendar",
        )
        event.status = "sent"
        event.save()
        sent_count += 1

    return sent_count
```

**Timing logic**: `wait_minutes` is the cumulative duration of all preceding rounds, not the
duration of the current round itself.

Example with default config (`rounds = [{id:1, dur:10}, {id:2, dur:10}, {id:3, dur:15}]`):
- Round 2 fires 10 min after `created_at` (sum of durations for rounds where id < 2 → round 1's 10 min)
- Round 3 fires 20 min after `created_at` (10 + 10)

`process_queued_rounds` has **no internal scheduler**. It must be called externally — either via
the `POST /api/app/notify/process_rounds` endpoint or a system cron job. There is no
APScheduler, Celery, or background thread anywhere in the backend.

---

### `respond_to_notification` (line 705)

```python
def respond_to_notification(notification_event_id: int, action: str, acting_user_id: int) -> dict:
    event = NotificationEvent.query.get_or_404(notification_event_id)

    # Security: the acting user must be the player linked to this event
    player = Player.query.get(event.player_id)
    if not player or player.user_id != acting_user_id:
        abort(403)

    # Mark the original invite message as responded (updates button state in chat UI)
    if event.message_id:
        invite_msg = Message.query.get(event.message_id)
        if invite_msg:
            invite_msg.msg_metadata = {**invite_msg.msg_metadata, "responded": True, "response": action}
            invite_msg.save()
            publish({"type": "message_edited", "payload": serialize_message(invite_msg, None)})

    instance = event.lesson_instance

    if action == "no":
        event.status = "expired"
        event.save()
        _send_system_message(coach_user_id, player_user_id, templates["decline"])
        publish({"type": "notification_responded", ...})
        return {"action": "declined"}

    elif action == "yes":
        # Re-check capacity at response time
        if _effective_filled_spots(instance) >= instance.max_players:
            event.status = "expired"
            event.save()
            _send_system_message(coach_user_id, player_user_id, templates["spot_filled"])
            publish({"type": "notification_responded", ..., "response": "spot_filled"})
            return {"action": "spot_filled"}

        # Add to roster + create presence record
        _add_player_to_instance(event.player_id, instance)
        event.status = "confirmed"
        event.save()

        # Send confirmation and broadcast spot_filled to all other pending invitees
        _send_system_message(coach_user_id, player_user_id, templates["confirm"])
        _broadcast_spot_filled(instance, event.id, coach_user_id, templates)

        publish({"type": "notification_responded", ..., "response": "yes"})
        return {"action": "confirmed"}
```

`_broadcast_spot_filled` queries for all `NotificationEvent` rows for this instance with
`status="sent"` (excluding the one just confirmed) and sends the `spot_filled` template message
to each of those players, then marks them `expired`.

---

## 3. Attendance Confirmation Trigger
`levelup_backend/padel_app/modules/frontend_api.py` (lines 616–639)

```python
@bp.post("/class_instance/presences/confirm")
@jwt_required()
def confirm_presences():
    from datetime import datetime
    from padel_app.services.notification_service import trigger_auto_notifications

    data = request.get_json()
    presences = confirm_presences_service(data['classInstance'], data['presences'])

    notified_players = []
    has_absences = any(p.status == "absent" for p in presences)

    if has_absences and presences:
        coach   = current_coach()
        instance = presences[0].lesson_instance

        # Guard: only notify if the class is still in the future
        if instance and instance.start_datetime > datetime.utcnow():
            try:
                notified_players = trigger_auto_notifications(instance, coach.id) or []
            except Exception:
                db.session.rollback()   # notification failure must not break attendance save

    return jsonify({
        "presences": [serialize_presence(p) for p in presences],
        "notifiedPlayers": notified_players,
    })
```

This is the **only** entry point that calls `trigger_auto_notifications`. It is invoked
exclusively by a coach action in the UI (marking attendance in the Class Detail sheet). There is
no background process, no scheduled task, and no automatic attendance confirmation anywhere in
the codebase. The trigger is entirely manual and synchronous.

---

## 4. Scheduled Reminder / Auto-Attendance — Does Not Exist

There is no automated attendance confirmation flow. Searching the entire backend for scheduler
libraries (APScheduler, Celery, background threads), `send_reminder`, `auto_confirm`, and
`ScheduledMessage` yields no results. The only cron job configured in the deployment pipeline
(`levelup_backend/.github/workflows/deploy.yaml`) is a database backup script that runs at
03:00.

The `process_queued_rounds` function is explicitly documented as requiring an external caller:

> "call periodically via cron / /notify/process_rounds"
> `notification_service.py` line 9 and line 506

In production this endpoint must be polled externally (e.g., a server cron, a monitoring
service, or the frontend polling at an interval). There is currently no such caller configured
in the codebase.

---

## 5. Key Helper — `_effective_filled_spots`

Used everywhere capacity is checked. It counts enrolled players **minus** those with a confirmed
absent presence, so players who registered but will not attend do not block a spot.

```python
def _effective_filled_spots(instance: LessonInstance) -> int:
    absent_ids = {
        p.player_id
        for p in Presence.query.filter_by(
            lesson_instance_id=instance.id, status="absent"
        ).all()
    }
    return sum(
        1 for rel in instance.players_relations
        if rel.player_id not in absent_ids
    )
```

---

## 6. Round Timing — Quick Reference

Given the default config:

| Round | `round.id` | `round.duration` | `wait_minutes` computed in `process_queued_rounds` | Fires at |
|-------|-----------|------------------|----------------------------------------------------|---------|
| 1 | 1 | 10 | — (sent immediately, not queued) | T+0 |
| 2 | 2 | 10 | sum(dur for id < 2) = 10 | T+10 min |
| 3 | 3 | 15 | sum(dur for id < 3) = 10+10 = 20 | T+20 min |

`T` = `NotificationEvent.created_at` of the queued event (set when `trigger_auto_notifications`
first runs, not when `process_queued_rounds` picks it up).
