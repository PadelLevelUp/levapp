# Services & Routes Reference

## Services

Services are plain Python modules with functions — no classes. They contain
business logic, interact with models, and return ORM instances or plain dicts.
They never return HTTP responses or call `jsonify`.

### Location

`padel_app/services/<domain>_service.py`

### The Create Pattern

Every "create" service follows this exact flow:

```python
from padel_app.tools.request_adapter import JsonRequestAdapter


def create_exercise_service(data):
    """Create an exercise from a JSON dict."""
    exercise = Exercise()
    form = exercise.get_create_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    exercise.update_with_dict(values)
    exercise.create()           # add + commit
    return exercise
```

Why this works: `JsonRequestAdapter` bridges a raw JSON dict to the `Field.set_value(request)`
interface, which expects a Werkzeug-style `request.form` MultiDict. The form system
handles type coercion, file handling, and relationship resolution.

### The Edit Pattern

```python
def edit_exercise_service(exercise_id, data):
    """Update an exercise from a JSON dict."""
    exercise = Exercise.query.get_or_404(exercise_id)
    form = exercise.get_create_form()   # same form — fields know current values
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    exercise.update_with_dict(values)
    exercise.save()             # set updated_at + commit
    return exercise
```

### The Delete Pattern

```python
def delete_exercise_service(exercise_id):
    exercise = Exercise.query.get_or_404(exercise_id)
    exercise.delete()           # session.delete + commit
```

### Querying Patterns

```python
# Get one by ID (404 if missing)
exercise = Exercise.query.get_or_404(exercise_id)

# Filter
exercises = Exercise.query.filter_by(coach_id=coach_id).all()

# Filter with conditions
instances = LessonInstance.query.filter(
    LessonInstance.start_datetime >= start,
    LessonInstance.start_datetime < end,
    LessonInstance.status != "cancelled",
).order_by(LessonInstance.start_datetime).all()

# First or None
config = NotificationConfig.query.filter_by(coach_id=coach_id).first()

# Join + filter
players = db.session.query(Player).join(
    Association_CoachPlayer,
    Association_CoachPlayer.player_id == Player.id,
).filter(
    Association_CoachPlayer.coach_id == coach_id,
).all()
```

### Transaction Handling

Standard: `model.create()` and `model.save()` auto-commit. No explicit transaction
management needed for simple CRUD.

For multi-step operations where a side-effect failure should not fail the main operation:

```python
sp = db.session.begin_nested()     # savepoint
try:
    _sync_standing_entries_for_new_instance(instance, coach_id)
    sp.commit()
except Exception:
    sp.rollback()
```

### Error Handling

- `Model.query.get_or_404(id)` — raises 404 automatically
- Return tuples for validation errors: `return {"error": "Name is required"}, 400`
- The route unpacks: `result, status = create_service(data); return jsonify(result), status`
- Or raise: `abort(400, description="Invalid input")`

### Real-time Notifications

After mutations that affect the UI, publish an SSE event:

```python
from padel_app.realtime import publish

def create_message_service(conversation_id, sender_id, text):
    msg = Message(conversation_id=conversation_id, sender_id=sender_id, text=text)
    msg.create()
    publish({
        "type": "new_message",
        "payload": serialize_message(msg),
    })
    return msg
```

---

## Routes (Blueprints)

### Where to add routes

Almost all app-facing features go in **`padel_app/modules/frontend_api.py`**
(blueprint `frontend_api`, prefix `/api/app`).

Other blueprints:
- `api_auth.py` → `/api/auth` — login, logout, register
- `notifications_api.py` → `/api/notifications` — push notification subscriptions
- `notification_engine_api.py` → `/api/notification-engine` — notification engine config (newer)

### Route Structure

```python
@bp.get("/exercises")
@jwt_required()
def get_exercises():
    coach = current_coach()
    exercises = Exercise.query.filter_by(coach_id=coach.id).all()
    return jsonify([serialize_exercise(e) for e in exercises])


@bp.post("/exercises")
@jwt_required()
def create_exercise():
    coach = current_coach()
    data = request.get_json() or {}
    data["coach_id"] = coach.id
    exercise = create_exercise_service(data)
    return jsonify(serialize_exercise(exercise)), 201


@bp.put("/exercises/<int:exercise_id>")
@jwt_required()
def update_exercise(exercise_id):
    data = request.get_json() or {}
    exercise = edit_exercise_service(exercise_id, data)
    return jsonify(serialize_exercise(exercise))


@bp.delete("/exercises/<int:exercise_id>")
@jwt_required()
def delete_exercise(exercise_id):
    delete_exercise_service(exercise_id)
    return "", 204
```

### Auth Helpers

Defined at the top of `frontend_api.py`, cached on Flask `g`:

```python
def current_user():       # User from JWT identity
def current_coach():      # user.coach
def current_player():     # user.player
def current_club():       # coach.current_club
```

Call inside route handlers: `coach = current_coach()`.

### HTTP Verbs

Use Flask 2.x shorthand: `@bp.get`, `@bp.post`, `@bp.put`, `@bp.delete`.

### Response Conventions

| Action | Status | Response |
|---|---|---|
| GET list | 200 | `jsonify([...])` |
| GET single | 200 | `jsonify({...})` |
| POST create | 201 | `jsonify({...}), 201` |
| PUT update | 200 | `jsonify({...})` |
| DELETE | 204 | `"", 204` |
| Validation error | 400 | `jsonify({"error": "..."}), 400` |
| Not found | 404 | auto from `get_or_404()` |

### Request Data

```python
data = request.get_json() or {}        # JSON body
value = request.args.get("key")        # Query string
coach_id = request.args.get("coach_id", type=int)
```

---

## Serializers

### Location

`padel_app/serializers/<domain>.py`

### Pattern

Pure functions, no classes. Return dicts with **camelCase** keys (matching frontend
TypeScript interfaces).

```python
def serialize_exercise(exercise):
    if not exercise:
        return None
    return {
        "id": exercise.id,
        "name": exercise.name,
        "description": exercise.description,
        "type": exercise.type,
        "difficulty": exercise.difficulty,
        "diagram": exercise.diagram,
        "coachId": exercise.coach_id,
        "createdAt": exercise.created_at.isoformat() if exercise.created_at else None,
        "updatedAt": exercise.updated_at.isoformat() if exercise.updated_at else None,
    }
```

### Composition

Serializers call each other for nested objects:

```python
def serialize_conversation_detail(conv, current_user_id):
    return {
        "id": conv.id,
        "participants": [serialize_user(p.user) for p in conv.participants],
        "messages": [serialize_message(m) for m in conv.messages],
        "unreadCount": _count_unread(conv, current_user_id),
    }
```

### Key Conventions

- Always check `if not obj: return None` at the top
- Dates → `.isoformat()` with None guard
- Boolean derivations: `"isActive": user.status == "active"`
- Abbreviations: `"abbreviation": "".join([p[0] for p in name.split()[:2]]).upper()`
- FKs: include both the ID and the serialized relation when the frontend needs both

---

## Real Examples

| Domain | Service | Routes | Serializer |
|---|---|---|---|
| Simple CRUD | `training_service.py` | `frontend_api.py` (exercises section) | `training.py` |
| With relationships | `player_service.py` | `frontend_api.py` (players section) | `player.py` |
| Complex logic | `notification_service.py` | `notification_engine_api.py` | (inline dicts) |
| Messaging + SSE | `messaging_service.py` | `frontend_api.py` (messages section) | `message.py` |

Read these files before adding a new feature to see the patterns in context.
