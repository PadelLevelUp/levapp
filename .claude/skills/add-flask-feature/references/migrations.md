# Migrations Reference

## Overview

The project uses **Flask-Migrate** (Alembic wrapper). Migrations live in
`levelup_backend/migrations/versions/`.

## Commands

Run from `levelup_backend/` with the venv activated:

```bash
# Auto-generate a migration from model changes
flask db migrate -m "add my_model table"

# Apply pending migrations
flask db upgrade

# Roll back one revision
flask db downgrade

# Show migration history
flask db history

# Show current revision
flask db current
```

## Workflow

1. Create or modify the model file in `padel_app/models/`
2. Register it in `padel_app/models/__init__.py` (import + MODELS dict)
3. Run `flask db migrate -m "description"` — generates a migration file
4. **Review the generated migration** — auto-detect sometimes misses things or generates
   unnecessary changes. Check column types, nullable, defaults, and FK constraints.
5. Run `flask db upgrade` to apply
6. For the E2E test DB, the migration is applied automatically during test setup
   (`reset-test-db.sh` runs `flask db upgrade` on `levelup_test`)

## Migration File Anatomy

```python
"""add evaluation_categories table

Revision ID: a20050262cd7
Revises: b3c4d5e6f7a8
Create Date: 2025-06-15 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a20050262cd7'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'evaluation_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('min_score', sa.Integer(), nullable=False),
        sa.Column('max_score', sa.Integer(), nullable=False),
        sa.Column('coach_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['coach_id'], ['coaches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('evaluation_categories')
```

## Adding Columns to Existing Tables

Use `batch_alter_table` for SQLite compatibility (used in tests):

```python
def upgrade():
    with op.batch_alter_table('notification_configs') as batch_op:
        batch_op.add_column(sa.Column('reminder_timing', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('auto_notify_enabled', sa.Boolean(),
                                       server_default='0', nullable=False))

def downgrade():
    with op.batch_alter_table('notification_configs') as batch_op:
        batch_op.drop_column('auto_notify_enabled')
        batch_op.drop_column('reminder_timing')
```

## Common Gotchas

- **Enum columns**: Alembic auto-detect doesn't always handle Enum creation/deletion
  properly. You may need to manually add `sa.Enum(...).create(op.get_bind())` in upgrade
  and `.drop(op.get_bind())` in downgrade.
- **server_default**: Use string values (`"1"`, `"0"`) for booleans, not Python booleans.
- **JSON columns**: Default to `nullable=True` — Postgres handles NULL JSON fine.
- **Review before applying**: Auto-generated migrations sometimes include unrelated
  changes (e.g., reordering columns, renaming indexes). Remove anything that doesn't
  belong.
