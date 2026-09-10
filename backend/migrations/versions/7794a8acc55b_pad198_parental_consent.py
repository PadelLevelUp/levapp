"""parental consent for minors (auth.parental-consent, PAD-198)

Revision ID: 7794a8acc55b
Revises: cf030b78b088 (PAD-263, Session A; chained after it on the coordinator's instruction)
Create Date: 2026-09-10 02:30:00.000000

Every DDL statement is guarded: prod carries unmigrated hand-made schema and
staging is a copy of prod per deploy, so a column, table or index may already
exist when this runs. The consent-age seed never overwrites an edited row.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7794a8acc55b'
down_revision = 'cf030b78b088'
branch_labels = None
depends_on = None


USER_COLUMNS = (
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('country', sa.String(length=2), nullable=True),
    sa.Column('guardian_consent_status', sa.String(length=16), nullable=True),
)

# auth.parental-consent rule 1. Any other country uses DIGITAL_CONSENT_DEFAULT_AGE (16).
SEED_AGES = (
    ('PT', 13), ('ES', 14), ('IT', 14), ('FR', 15), ('BE', 13),
    ('GB', 13), ('US', 13), ('DE', 16), ('IE', 16), ('NL', 16),
)


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    insp = _inspector()
    existing = {c['name'] for c in insp.get_columns('users')}
    for column in USER_COLUMNS:
        if column.name not in existing:
            op.add_column('users', column)

    if not insp.has_table('digital_consent_ages'):
        op.create_table(
            'digital_consent_ages',
            sa.Column('country', sa.String(length=2), primary_key=True),
            sa.Column('age', sa.Integer(), nullable=False),
        )
    for country, age in SEED_AGES:
        op.execute(sa.text(
            "INSERT INTO digital_consent_ages (country, age) VALUES (:c, :a) "
            "ON CONFLICT (country) DO NOTHING"
        ).bindparams(c=country, a=age))

    if not insp.has_table('guardian_consents'):
        op.create_table(
            'guardian_consents',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
            sa.Column('guardian_email', sa.String(length=120), nullable=False),
            sa.Column('guardian_name', sa.String(length=120), nullable=True),
            sa.Column('relationship', sa.String(length=32), nullable=True),
            sa.Column('minor_snapshot', sa.Text(), nullable=True),
            sa.Column('terms_version', sa.String(length=32), nullable=True),
            sa.Column('consent_token_hash', sa.String(length=64), nullable=True),
            sa.Column('consent_expires_at', sa.DateTime(), nullable=True),
            sa.Column('consent_sent_at', sa.DateTime(), nullable=True),
            sa.Column('requested_at', sa.DateTime(), nullable=False),
            sa.Column('consented_at', sa.DateTime(), nullable=True),
            sa.Column('consent_ip', sa.String(length=64), nullable=True),
            sa.Column('revoke_token_hash', sa.String(length=64), nullable=True),
            sa.Column('revoked_at', sa.DateTime(), nullable=True),
        )
    indexes = {i['name'] for i in _inspector().get_indexes('guardian_consents')}
    for name, column in (
        ('ix_guardian_consents_consent_token_hash', 'consent_token_hash'),
        ('ix_guardian_consents_revoke_token_hash', 'revoke_token_hash'),
    ):
        if name not in indexes:
            op.create_index(name, 'guardian_consents', [column])


def downgrade():
    insp = _inspector()
    if insp.has_table('guardian_consents'):
        op.drop_table('guardian_consents')
    if insp.has_table('digital_consent_ages'):
        op.drop_table('digital_consent_ages')
    existing = {c['name'] for c in insp.get_columns('users')}
    for column in reversed(USER_COLUMNS):
        if column.name in existing:
            op.drop_column('users', column.name)
