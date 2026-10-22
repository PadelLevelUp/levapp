"""add auth_rate_limit_hits (auth.login rule 7, PAD-693)

Revision ID: f7d4690a49cd
Revises: 72d1dd26d2c1
Create Date: 2026-10-21 22:00:00.000000

Idempotent: staging is a prod copy per deploy, so every step checks first. Creates an empty table:
no data is touched, so it costs a catalog write on any database size.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'f7d4690a49cd'
down_revision = '72d1dd26d2c1'
branch_labels = None
depends_on = None


def upgrade():
    # The columns and the index mirror padel_app/models/auth_rate_limit_hit.py (`flask db check`
    # holds the two together).
    insp = inspect(op.get_bind())
    if not insp.has_table('auth_rate_limit_hits'):
        op.create_table(
            'auth_rate_limit_hits',
            sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
            sa.Column('scope', sa.Text(), nullable=False),
            sa.Column('key', sa.Text(), nullable=False),
            sa.Column('hit_at', sa.Float(), nullable=False),
        )
    insp = inspect(op.get_bind())  # fresh: the cached one predates the create_table above
    existing = {ix['name'] for ix in insp.get_indexes('auth_rate_limit_hits')}
    if 'ix_auth_rate_limit_hits_scope_key_hit_at' not in existing:
        op.create_index('ix_auth_rate_limit_hits_scope_key_hit_at', 'auth_rate_limit_hits',
                        ['scope', 'key', 'hit_at'])


def downgrade():
    if inspect(op.get_bind()).has_table('auth_rate_limit_hits'):
        op.drop_table('auth_rate_limit_hits')
