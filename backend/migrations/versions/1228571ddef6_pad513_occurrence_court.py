"""PAD-513: an occurrence's own court

Revision ID: 1228571ddef6
Revises: 867a814a5522
Create Date: 2026-10-03

clubs.courts rule 9. A nullable `lesson_instances.court_id` (FK -> courts.id,
ON DELETE SET NULL): NULL inherits the lesson's court. Idempotent both ways on a
prod-shaped database (the column is added only if absent, dropped only if
present). No data step: no occurrence has a court of its own yet.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "1228571ddef6"
down_revision = "867a814a5522"
branch_labels = None
depends_on = None

FK = "fk_lesson_instances_court_id_courts"


def _columns(bind, table):
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _court_fks(bind):
    """Names of the foreign keys on lesson_instances.court_id, whatever they are called
    (a drifted database may carry one under the Postgres default name)."""
    return [
        fk["name"]
        for fk in sa.inspect(bind).get_foreign_keys("lesson_instances")
        if fk.get("constrained_columns") == ["court_id"]
    ]


def upgrade():
    bind = op.get_bind()
    if "court_id" not in _columns(bind, "lesson_instances"):
        op.add_column("lesson_instances", sa.Column("court_id", sa.Integer(), nullable=True))
    if not _court_fks(bind):
        op.create_foreign_key(FK, "lesson_instances", "courts", ["court_id"], ["id"], ondelete="SET NULL")


def downgrade():
    bind = op.get_bind()
    for name in _court_fks(bind):
        op.drop_constraint(name, "lesson_instances", type_="foreignkey")
    if "court_id" in _columns(bind, "lesson_instances"):
        op.drop_column("lesson_instances", "court_id")
