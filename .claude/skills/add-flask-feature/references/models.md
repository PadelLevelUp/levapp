# Model Reference

## Base Class

Every model inherits `(db.Model, model.Model)`. The `Model` mixin (in `padel_app/model.py`)
provides standard CRUD methods and the form system. You get these for free:

| Method | What it does |
|---|---|
| `create()` | `db.session.add(self)` + `commit()` |
| `save()` | Sets `updated_at`, then `commit()` |
| `delete()` | `db.session.delete(self)` + `commit()` |
| `update_with_dict(values)` | Sets columns, resolves FK relationships, handles collections |
| `get_dict()` | Returns column values + hybrid properties as a flat dict |
| `add_to_session()` | `db.session.add(self)` without committing |
| `flush()` | `db.session.flush([self])` — populates `id` before commit |

`created_at` and `updated_at` columns are defined on the mixin — don't redefine them.

## Model Anatomy

Every model file follows this exact structure:

```python
from sqlalchemy import Column, Integer, String, Text, Boolean, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Field, Block, Form


class MyModel(db.Model, model.Model):
    __tablename__ = "my_models"
    __table_args__ = {"extend_existing": True}

    page_title = "My Model"       # Admin editor page title
    model_name = "MyModel"        # Used by editor routing and serializers

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # ... more columns ...

    # Relationships
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    coach = relationship("Coach", backref="my_models")

    def __repr__(self):
        return f"<MyModel {self.name}>"

    def __str__(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        return ("name", ["id", "name", "description", "created_at"])

    @classmethod
    def get_create_form(cls):
        return Form([
            Block("info_block", [
                Field("1", cls.model_name, "Name", "name", "Text"),
                Field("2", cls.model_name, "Description", "description", "Text"),
            ])
        ])
```

### Required attributes

- `__tablename__` — snake_case plural (e.g., `"evaluation_categories"`)
- `__table_args__ = {"extend_existing": True}` — always present
- `page_title` — human-readable, for admin editor
- `model_name` — PascalCase class name as string
- `id` column — always Integer primary key
- `name` property — required by base `Model.__repr__`

## Column Patterns

```python
# String
title = Column(String(255), nullable=False)
description = Column(Text, nullable=True)

# Enum — always provide a name for the constraint
status = Column(Enum("active", "ended", name="lesson_status"), default="active")
type = Column(Enum("academy", "private", name="lesson_type"), nullable=False)
side = Column(Enum("left", "right", name="player_side"), nullable=True)

# Boolean — use server_default for DB-level compatibility
notifications_enabled = Column(Boolean, default=True, nullable=False, server_default="1")
is_active = Column(Boolean, default=False, server_default="0")

# FK with cascade
coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
logo_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))

# JSON for flexible data
settings = Column(JSON, nullable=True, default=dict)
level_ids = Column(JSON, nullable=True, default=list)
diagram = Column(JSON, nullable=True)

# Numeric
max_players = Column(Integer, default=4)
score = Column(Float, nullable=True)
```

## Relationship Patterns

### One-to-Many (FK on child)

```python
# Parent side (Coach)
players_relations = relationship(
    "Association_CoachPlayer",
    back_populates="coach",
    cascade="all, delete-orphan",
)

# Child side (Association)
coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
coach = relationship("Coach", back_populates="players_relations")
```

### Many-to-Many via Association Model (standard pattern)

This is the preferred approach when the junction needs extra columns (level, side,
notes, etc.):

```python
# Association model
class Association_CoachPlayer(db.Model, model.Model):
    __tablename__ = "coach_in_player"
    __table_args__ = (
        UniqueConstraint("coach_id", "player_id", name="uq_coach_player"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"))

    # Extra payload
    level_id = Column(Integer, ForeignKey("coach_levels.id"), nullable=True)
    side = Column(Enum("left", "right", name="player_side"), nullable=True)
    notes = Column(String(255), nullable=True)

    coach = relationship("Coach", back_populates="players_relations")
    player = relationship("Player", back_populates="coaches_relations")
```

Both sides declare `back_populates`, and convenience properties skip the junction:

```python
# On Coach
@property
def players(self):
    return [rel.player for rel in self.players_relations]
```

### Many-to-Many via secondary Table (simple junction, no extra columns)

Only used for `Exercise <-> ExerciseGroup`:

```python
exercise_group_exercises = Table(
    "exercise_group_exercises",
    db.Model.metadata,
    Column("exercise_group_id", Integer, ForeignKey("exercise_groups.id", ondelete="CASCADE"), primary_key=True),
    Column("exercise_id", Integer, ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True),
)

# On ExerciseGroup:
exercises = relationship("Exercise", secondary=exercise_group_exercises, back_populates="groups")
# On Exercise:
groups = relationship("ExerciseGroup", secondary=exercise_group_exercises, back_populates="exercises")
```

## Registering the Model

After creating the model file, add it to `padel_app/models/__init__.py`:

```python
from padel_app.models.my_model import MyModel

MODELS = {
    # ... existing entries ...
    "mymodel": MyModel,
}
```

## Real Examples

| Complexity | Model | File |
|---|---|---|
| Simple | `CoachLevel` | `models/coach_levels.py` |
| Medium | `Exercise` | `models/exercise.py` |
| Complex | `LessonInstance` | `models/lesson_instances.py` |
| Association | `Association_CoachPlayer` | `models/Association_CoachPlayer.py` |
| Config/JSON-heavy | `NotificationConfig` | `models/notification_config.py` |

Read these files to see the patterns in action before creating a new model.
