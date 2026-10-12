"""drop the retired parental-consent tables and column (PAD-644)

Revision ID: 734b8e37b4e2
Revises: d0d3b33b7fd3
Create Date: 2026-10-12 12:00:00.000000

PAD-198's guardian flow was removed by PAD-457 (adults only). This drops what it
left: the guardian_consents and digital_consent_ages tables and
users.guardian_consent_status. users.birth_date and users.country stay; the
adults-only check (auth.register rule 18) still reads them.

Every statement is guarded, as 7794a8acc55b's were, so a second run changes
nothing. The downgrade recreates the three with the Postgres default constraint
names and reseeds the consent ages; it cannot bring back dropped rows.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '734b8e37b4e2'
down_revision = 'd0d3b33b7fd3'  # PAD-645
branch_labels = None
depends_on = None


# As 7794a8acc55b seeded them (auth.parental-consent rule 1).
SEED_AGES = (
    ('PT', 13), ('ES', 14), ('IT', 14), ('FR', 15), ('BE', 13),
    ('GB', 13), ('US', 13), ('DE', 16), ('IE', 16), ('NL', 16),
)
TOKEN_INDEXES = (
    ('ix_guardian_consents_consent_token_hash', 'consent_token_hash'),
    ('ix_guardian_consents_revoke_token_hash', 'revoke_token_hash'),
)


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    insp = _inspector()
    if insp.has_table('guardian_consents'):
        indexes = {i['name'] for i in insp.get_indexes('guardian_consents')}
        for name, _column in TOKEN_INDEXES:
            if name in indexes:
                op.drop_index(name, table_name='guardian_consents')
        op.drop_table('guardian_consents')
    if insp.has_table('digital_consent_ages'):
        op.drop_table('digital_consent_ages')
    if 'guardian_consent_status' in {c['name'] for c in insp.get_columns('users')}:
        with op.batch_alter_table('users') as batch:
            batch.drop_column('guardian_consent_status')


def downgrade():
    insp = _inspector()
    if 'guardian_consent_status' not in {c['name'] for c in insp.get_columns('users')}:
        with op.batch_alter_table('users') as batch:
            batch.add_column(sa.Column('guardian_consent_status', sa.String(length=16), nullable=True))

    if not insp.has_table('digital_consent_ages'):
        op.create_table(
            'digital_consent_ages',
            sa.Column('country', sa.String(length=2), nullable=False),
            sa.Column('age', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('country', name='digital_consent_ages_pkey'),
        )
    for country, age in SEED_AGES:
        op.execute(sa.text(
            "INSERT INTO digital_consent_ages (country, age) VALUES (:c, :a) "
            "ON CONFLICT (country) DO NOTHING"
        ).bindparams(c=country, a=age))

    if not insp.has_table('guardian_consents'):
        op.create_table(
            'guardian_consents',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
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
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='guardian_consents_user_id_fkey',
                                    ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='guardian_consents_pkey'),
            sa.UniqueConstraint('user_id', name='guardian_consents_user_id_key'),
        )
    indexes = {i['name'] for i in _inspector().get_indexes('guardian_consents')}
    for name, column in TOKEN_INDEXES:
        if name not in indexes:
            op.create_index(name, 'guardian_consents', [column])
