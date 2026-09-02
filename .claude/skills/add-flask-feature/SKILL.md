---
name: add-flask-feature
description: >
  Add new features, models, services, routes, and serializers to the Flask backend.
  Use this skill whenever implementing backend functionality: new API endpoints,
  database models, business logic, CRUD operations, or extending existing models
  with new columns or relationships. Also triggers for "add a backend feature",
  "create a new model", "add an API endpoint", "new service", "database change",
  "add a column", "new route", "backend implementation", or any task that requires
  modifying the Flask app structure. When in doubt about how the backend is organized,
  consult this skill.
---

# Add a Flask Backend Feature

Guide for adding new functionality to the LevelUp Flask backend. The backend
follows a consistent layered architecture: Model → Service → Route → Serializer.
Every new feature follows this same flow.

## Reference Files

Read the relevant reference before writing code. These contain the full patterns,
code examples, and conventions:

| Reference | When to read |
|---|---|
| `references/models.md` | Creating or modifying models, columns, relationships |
| `references/services-and-routes.md` | Adding services, routes, serializers, auth |
| `references/migrations.md` | Running migrations, adding columns to existing tables |

## The Checklist

When adding a new feature, work through these steps in order. Not every feature
needs all steps — a simple column addition skips the service/route/serializer steps.

### 1. Model

Create `padel_app/models/<name>.py`. Read `references/models.md` for the full
pattern, but the essentials:

- Inherit `(db.Model, model.Model)`
- Set `__tablename__`, `__table_args__ = {"extend_existing": True}`, `page_title`, `model_name`
- Define columns using SQLAlchemy types
- Add relationships with `back_populates` and `cascade="all, delete-orphan"` on owning side
- Define `get_create_form()` returning a `Form` with `Field` definitions
- Implement `display_all_info()` classmethod and a `name` property

Before writing: read an existing model of similar complexity to match the style.
Good reference models:
- Simple: `models/coach_levels.py`
- Medium: `models/exercise.py`
- Complex with relationships: `models/lesson_instances.py`
- Association table: `models/Association_CoachPlayer.py`

### 2. Register the Model

Add the import and MODELS entry in `padel_app/models/__init__.py`:

```python
from padel_app.models.my_model import MyModel

MODELS = {
    # ... existing ...
    "mymodel": MyModel,
}
```

### 3. Migration

```bash
cd levelup_backend
flask db migrate -m "add <table_name> table"
flask db upgrade
```

Always review the auto-generated migration before applying. See `references/migrations.md`
for gotchas around Enum columns, server defaults, and batch operations.

### 4. Serializer

Create `padel_app/serializers/<name>.py` with a pure function:

```python
def serialize_my_model(obj):
    if not obj:
        return None
    return {
        "id": obj.id,
        "name": obj.name,
        "coachId": obj.coach_id,
        "createdAt": obj.created_at.isoformat() if obj.created_at else None,
    }
```

Key rules:
- **camelCase** keys (the frontend expects this)
- Guard against None: `if not obj: return None`
- Dates: `.isoformat()` with None check
- Compose serializers for nested objects

### 5. Service

Create `padel_app/services/<name>_service.py`. Services are plain functions — no
classes. They use the `JsonRequestAdapter` + form system for create/edit:

```python
from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.models.my_model import MyModel


def create_my_model_service(data):
    obj = MyModel()
    form = obj.get_create_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    obj.update_with_dict(values)
    obj.create()
    return obj
```

See `references/services-and-routes.md` for edit, delete, query, transaction, and
error handling patterns.

### 6. Routes

Add routes to `padel_app/modules/frontend_api.py` (for app-facing features).
Follow the standard CRUD pattern:

```python
@bp.get("/my_models")
@jwt_required()
def get_my_models():
    coach = current_coach()
    items = MyModel.query.filter_by(coach_id=coach.id).all()
    return jsonify([serialize_my_model(i) for i in items])

@bp.post("/my_models")
@jwt_required()
def create_my_model():
    coach = current_coach()
    data = request.get_json() or {}
    data["coach_id"] = coach.id
    obj = create_my_model_service(data)
    return jsonify(serialize_my_model(obj)), 201

@bp.delete("/my_models/<int:id>")
@jwt_required()
def delete_my_model(id):
    delete_my_model_service(id)
    return "", 204
```

Auth: use `@jwt_required()` + `current_coach()` / `current_user()` / `current_player()`.
These are cached on Flask `g` per request.

Response codes: GET → 200, POST → 201, PUT → 200, DELETE → 204.

## Modifying Existing Features

### Adding a column to an existing model

1. Add the `Column(...)` definition to the model class
2. Run `flask db migrate -m "add <column> to <table>"` + `flask db upgrade`
3. Update the serializer to include the new field
4. Update the `get_create_form()` if the field should be editable

### Adding a relationship between existing models

1. Add FK column + `relationship()` to both sides
2. Create an association model if the junction needs extra columns
3. Register the association model in `models/__init__.py`
4. Run the migration
5. Update serializers on both sides

### Adding a new endpoint to an existing domain

1. Add the route to the appropriate blueprint
2. Add or extend the service function
3. Update or create the serializer

## Architecture Notes

**Why the form system?** The `JsonRequestAdapter` + `Form` + `Field` pipeline
handles type coercion, relationship resolution, and file uploads uniformly. It
means services don't need custom parsing logic — the form system does it.

**Why `update_with_dict`?** It handles columns, FK relationships, and collections
in a single call, including the tricky bits like setting both `coach_id` and the
`coach` relationship attribute. Don't bypass it for manual attribute setting unless
you have a specific reason.

**When to use `publish()`:** Call `publish({type, payload})` from `padel_app.realtime`
after mutations that should update the UI in real time (new messages, status changes,
notification events). Not needed for standard CRUD that the frontend fetches on navigation.

## File Locations Summary

```
padel_app/
  model.py              # Base Model mixin (read this first)
  sql_db.py             # db and migrate singletons
  models/               # All domain models + __init__.py registry
  services/             # Business logic functions
  modules/              # Blueprint route files
    frontend_api.py     # Main app API routes (/api/app/*)
    api_auth.py         # Auth routes (/api/auth/*)
  serializers/          # JSON serialization functions
  tools/
    input_tools.py      # Field, Block, Form definitions
    request_adapter.py  # JsonRequestAdapter
  helpers/              # Domain-specific helper functions
  realtime.py           # SSE pub/sub (publish/subscribe)
  scheduler.py          # APScheduler job management
migrations/versions/    # Alembic migration files
```
