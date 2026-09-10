from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Coach(db.Model, model.Model):
    __tablename__ = "coaches"
    __table_args__ = {"extend_existing": True}

    page_title = "Coach"
    model_name = "Coach"

    id = Column(Integer, primary_key=True)
    
    # auth.account-profiles rule 1 (PAD-260): one account, at most one coache profile,
    # never an orphan. The migration names these fk_coaches_user_id / uq_coaches_user_id.
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    user = relationship("User", back_populates="coach", foreign_keys=[user_id])

    # ── auth.coach-approval ─────────────────────────────────────────────────
    # A self-registered coach (auth.register) waits for a LevApp superadmin to
    # approve them before anything club-scoped opens up (`require_coach()`
    # aborts 403 COACH_NOT_APPROVED otherwise). Every OTHER creation path — a
    # club invitation, the editor, tests — represents a coach somebody already
    # vouched for, so the ORM default is "approved" and only
    # `registration_service` sets "pending" explicitly. The DB server default
    # stays "pending" so a raw INSERT can never mint an approved coach by
    # accident.
    approval_status = Column(
        Enum("pending", "approved", "rejected", name="coach_approval_status"),
        nullable=False,
        server_default="pending",
        default="approved",
    )
    approved_at = Column(DateTime, nullable=True)
    approved_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    rejection_reason = Column(Text, nullable=True)

    @property
    def is_approved(self):
        return self.approval_status == "approved"

    # One-to-many to Club
    clubs_relations = relationship(
        "Association_CoachClub", back_populates="coach", cascade="all, delete-orphan",
        order_by="desc(Association_CoachClub.created_at)",
    )
    
    evaluation_categories = relationship("EvaluationCategory", back_populates="coach", cascade="all, delete-orphan")

    # calendar.seasons rule 1 (PAD-82): at most one recurring season per coach.
    season = relationship("CoachSeason", back_populates="coach", cascade="all, delete-orphan", uselist=False)
    
    @property
    def name(self):
        return self.user.name

    @property
    def clubs(self):
        return [rel.club for rel in self.clubs_relations]
    
    @property
    def current_club(self):
        """The most recently joined club — clubs.crud rule 3 (PAD-266 / B-036).

        The membership with the latest ``created_at`` wins; an undated row
        (legacy data — the column is nullable) counts as the oldest, and equal
        join times go to the higher id. Ranked here rather than read off the
        ``desc(created_at)`` relationship because Postgres sorts NULLs FIRST in
        a descending order while SQLite sorts them last: the relationship's
        order is not the rule. (It used to take ``clubs[-1]``, the oldest.)
        """
        memberships = [rel for rel in self.clubs_relations if rel.club is not None]
        if not memberships:
            return None
        newest = max(
            memberships,
            key=lambda rel: (rel.created_at is not None, rel.created_at or datetime.min, rel.id or 0),
        )
        return newest.club

    # Many-to-many: Lessons
    lessons_relations = relationship(
        "Association_CoachLesson",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def lessons(self):
        return [rel.lesson for rel in self.lessons_relations]

    # Relations to lesson instances
    lesson_instances_relations = relationship(
        "Association_CoachLessonInstance",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def lesson_instances(self):
        return [rel.lesson_instance for rel in self.lesson_instances_relations]

    # Many-to-many: Players
    players_relations = relationship(
        "Association_CoachPlayer",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]

    levels = relationship(
        "CoachLevel", back_populates="coach", cascade="all, delete-orphan"
    )

    # Player levels tracked by this coach
    player_levels = relationship(
        "PlayerLevelHistory", back_populates="coach", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Coach {self.name}>"

    def __str__(self):
        return self.name

    @property
    def name_str(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable_column = {"field": "name", "label": "Name"}
        table_columns = [
            {"field": "name", "label": "Name"},
            {"field": "club", "label": "Club"},
        ]
        return searchable_column, table_columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                **kwargs,
            )

        form = Form()
        info_block = Block(
            "info_block",
            fields=[
                get_field("user", "User", "ManyToOne", related_model="User"),
            ],
        )
        form.add_block(info_block)

        return form

    # Training: exercises owned by this coach
    owned_exercises = relationship(
        "Exercise",
        foreign_keys="Exercise.owner_coach_id",
        back_populates="owner_coach",
        cascade="all, delete-orphan",
    )

    # Training: all exercise access (owner + follower)
    exercise_relations = relationship(
        "Association_CoachExercise",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    # Training: exercise groups owned by this coach
    owned_exercise_groups = relationship(
        "ExerciseGroup",
        foreign_keys="ExerciseGroup.owner_coach_id",
        back_populates="owner_coach",
        cascade="all, delete-orphan",
    )

    # Training: all exercise group access (owner + follower)
    exercise_group_relations = relationship(
        "Association_CoachExerciseGroup",
        back_populates="coach",
        cascade="all, delete-orphan",
    )
