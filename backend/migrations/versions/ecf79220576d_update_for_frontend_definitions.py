"""update for frontend definitions

Revision ID: ecf79220576d
Revises: e5442f6c568d
Create Date: 2026-01-21 09:20:23.923712

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ecf79220576d'
down_revision = 'e5442f6c568d'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # ENUM CREATION (MUST COME FIRST)
    # ------------------------------------------------------------------

    sa.Enum(
        'left',
        'right',
        name='player_side'
    ).create(op.get_bind(), checkfirst=True)


    sa.Enum(
        'academy',
        'private',
        name='lesson_type'
    ).create(op.get_bind(), checkfirst=True)

    sa.Enum(
        'active',
        'ended',
        name='lesson_status'
    ).create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------
    # TABLE CREATION
    # ------------------------------------------------------------------

    op.create_table(
        'calendar_blocks',
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column(
            'type',
            sa.Enum(
                'break', 'holiday', 'off_work', 'personal',
                name='calendar_block_type'
            ),
            nullable=False
        ),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('start_time', sa.Time(), nullable=True),
        sa.Column('end_time', sa.Time(), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=True),
        sa.Column('recurrence_rule', sa.Text(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'presences',
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lesson_instance_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('present', 'absent', name='lesson_presence_status'),
            nullable=True
        ),
        sa.Column(
            'justification',
            sa.Enum('justified', 'unjustified', name='lesson_presence_justification'),
            nullable=True
        ),
        sa.Column('invited', sa.Boolean(), nullable=True),
        sa.Column('confirmed', sa.Boolean(), nullable=True),
        sa.Column('validated', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['lesson_instance_id'], ['lesson_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'player_id',
            'lesson_instance_id',
            name='uq_presence_player_lesson_instance'
        )
    )

    # ------------------------------------------------------------------
    # ALTER EXISTING TABLES
    # ------------------------------------------------------------------

    with op.batch_alter_table('coach_in_player', schema=None) as batch_op:
        batch_op.add_column(sa.Column('level_id', sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                'side',
                sa.Enum('left', 'right', name='player_side'),
                nullable=True
            )
        )
        batch_op.add_column(sa.Column('notes', sa.String(length=255), nullable=True))
        batch_op.create_foreign_key(None, 'coach_levels', ['level_id'], ['id'])

    with op.batch_alter_table('coach_levels', schema=None) as batch_op:
        batch_op.add_column(sa.Column('label', sa.String(length=100), nullable=False))
        batch_op.drop_column('name')

    with op.batch_alter_table('coaches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(None, 'users', ['user_id'], ['id'])
        batch_op.drop_column('name')

    with op.batch_alter_table('lesson_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('max_players', sa.Integer(), nullable=False))
        batch_op.add_column(sa.Column('overridden_fields', sa.Text(), nullable=True))

    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'type',
                sa.Enum('academy', 'private', name='lesson_type'),
                nullable=False
            )
        )
        batch_op.add_column(sa.Column('default_level_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('max_players', sa.Integer(), nullable=False))
        batch_op.add_column(sa.Column('color', sa.String(length=10), nullable=True))
        batch_op.add_column(
            sa.Column(
                'status',
                sa.Enum('active', 'ended', name='lesson_status'),
                nullable=True
            )
        )
        batch_op.create_foreign_key(None, 'coach_levels', ['default_level_id'], ['id'])

    with op.batch_alter_table('players', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.drop_constraint('players_profile_picture_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(None, 'users', ['user_id'], ['id'])
        batch_op.drop_column('name')
        batch_op.drop_column('profile_picture_id')



def downgrade():
    with op.batch_alter_table('players', schema=None) as batch_op:
        batch_op.add_column(sa.Column('profile_picture_id', sa.INTEGER(), nullable=True))
        batch_op.add_column(sa.Column('name', sa.VARCHAR(length=255), nullable=False))
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key(
            'players_profile_picture_id_fkey',
            'images',
            ['profile_picture_id'],
            ['id'],
            ondelete='SET NULL'
        )
        batch_op.drop_column('user_id')

    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.drop_column('status')
        batch_op.drop_column('color')
        batch_op.drop_column('max_players')
        batch_op.drop_column('default_level_id')
        batch_op.drop_column('type')

    with op.batch_alter_table('lesson_instances', schema=None) as batch_op:
        batch_op.drop_column('overridden_fields')
        batch_op.drop_column('max_players')
        batch_op.drop_column('notes')

    with op.batch_alter_table('coaches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('name', sa.VARCHAR(length=255), nullable=False))
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.drop_column('user_id')

    with op.batch_alter_table('coach_levels', schema=None) as batch_op:
        batch_op.add_column(sa.Column('name', sa.VARCHAR(length=100), nullable=False))
        batch_op.drop_column('label')

    with op.batch_alter_table('coach_in_player', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.drop_column('notes')
        batch_op.drop_column('side')
        batch_op.drop_column('level_id')

    op.drop_table('presences')
    op.drop_table('calendar_blocks')

    sa.Enum(name='lesson_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='lesson_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='player_side').drop(op.get_bind(), checkfirst=True)