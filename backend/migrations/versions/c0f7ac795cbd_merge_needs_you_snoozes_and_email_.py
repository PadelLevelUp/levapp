"""merge needs-you snoozes and email verification heads

Revision ID: c0f7ac795cbd
Revises: c144c9f02098, cefe5640a35a
Create Date: 2026-09-08 14:55:52.583305

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0f7ac795cbd'
down_revision = ('c144c9f02098', 'cefe5640a35a')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
