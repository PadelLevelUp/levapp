from sqlalchemy import JSON, Boolean, Column, Integer, ForeignKey, DateTime, Enum, Text, String, Date, Index
from sqlalchemy.orm import relationship


from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


def _load_level(level_id):
    from padel_app.models.coach_levels import CoachLevel

    return CoachLevel.query.get(level_id)


class LessonInstance(db.Model, model.Model):
    __tablename__ = "lesson_instances"
    # PAD-263: the occurrence lookup and the calendar range. Not unique yet:
    # PAD-85 duplicates may remain on prod (ledger B-046).
    __table_args__ = (
        Index("ix_lesson_instances_lesson_id_occurrence_date", "lesson_id", "original_lesson_occurence_date"),
        Index("ix_lesson_instances_start_datetime", "start_datetime"),
        {"extend_existing": True},
    )

    page_title = "Lesson Instances"
    model_name = "LessonInstance"

    id = Column(Integer, primary_key=True)

    lesson_id = Column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    lesson = relationship("Lesson", back_populates="instances")

    original_lesson_occurence_date = Column(Date)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    overwrite_title = Column(String(255), nullable=True)
    
    level_id = Column(Integer, ForeignKey("coach_levels.id", ondelete="SET NULL"))  # PAD-255
    level = relationship("CoachLevel")

    notifications_enabled = Column(Boolean, default=True, nullable=False, server_default="1")
    # PAD-129 (eligibility.cascade): the single-class tier. Same tri-state as
    # Lesson.eligibility_rules; wins over the lesson and coach tiers when set.
    eligibility_rules = Column(JSON, nullable=True)
    # PAD-130: single-class tier of the "advertise empty spots" toggle.
    open_spots_visible = Column(Boolean, nullable=True)

    status = Column(
        Enum(
            "scheduled",
            "canceled",
            "rescheduled",
            "completed",
            name="lesson_instance_status",
        ),
        default="scheduled",
        nullable=False,
    )
    
    notes = Column(Text, nullable=True)
    max_players = Column(Integer, nullable=False)
    overridden_fields = Column(Text)

    presences = relationship(
        "Presence",
        back_populates="lesson_instance",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    
    # Many-to-many: LessonInstance <-> Player
    players_relations = relationship(
        "Association_PlayerLessonInstance",
        back_populates="lesson_instance",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    
    coaches_relations = relationship(
        "Association_CoachLessonInstance", 
        back_populates="lesson_instance", 
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    
    @property
    def effective_level_id(self):
        """Level of this occurrence (PAD-275, classes.edit rule 4): its own
        `level_id` when set, else the lesson's default. Same rule as
        `level_service.effective_level_id`, which readers outside the model use."""
        if self.level_id:
            return self.level_id
        lesson = self.lesson
        return lesson.default_level_id if lesson is not None else None

    @property
    def effective_level(self):
        """The `CoachLevel` behind `effective_level_id`, or None."""
        if self.level_id and self.level is not None:
            return self.level
        lesson = self.lesson
        if lesson is not None and lesson.default_level_id:
            return getattr(lesson, "default_level", None) or _load_level(lesson.default_level_id)
        return None

    @property
    def title(self):
        return self.overwrite_title or self.lesson.title

    @property
    def players(self):
        # PAD-259: the presence row is the enrolment (classes.instance-enrollment rule 1).
        return [p.player for p in self.presences]

    @property
    def enrolled_player_ids(self) -> set:
        """Ids of the players who hold a spot on this occurrence (PAD-259)."""
        return {p.player_id for p in self.presences}

    @property
    def effective_filled_spots(self) -> int:
        """Spots actually taken on this instance (PAD-71).

        SINGLE SOURCE OF TRUTH for "how full is this class". Enrolled players
        minus everyone who has declined / cancelled (``Presence.status ==
        "absent"``), floored at 0. Players who have not answered their invite
        yet still occupy their spot and DO count.

        Consumed by the calendar event payload (``participantCount``), the
        class-detail "capacity" field, and the invitation engine's capacity
        checks — none of those may recompute this independently.
        """
        # PAD-259: one table. A presence row is an enrolment; an absent one gave
        # its spot up (classes.instance-enrollment rule 5).
        enrolled = len(self.presences)
        declined = sum(1 for p in self.presences if p.status == "absent")
        return max(0, enrolled - declined)

    @property
    def confirmed_spots(self) -> int:
        """Players who have actively CONFIRMED they are coming.

        ``Presence.status`` is "present" / "absent" / NULL. Only "present" is a
        confirmation; NULL means the player has not answered yet and still
        holds their spot. So this is always <= ``effective_filled_spots``, and
        the difference between the two is "enrolled but unanswered".

        Consumed by the calendar event payload (``confirmedCount``) so a block
        can show confirmed / awaiting / free without a per-class round trip.
        """
        return sum(1 for p in self.presences if p.status == "present")

    def __repr__(self):
        return f"<LessonInstance {self.id} {self.title} {self.start_datetime.strftime('%Y-%m-%d %H:%M')}>"

    def __str__(self):
        return f"<LessonInstance {self.id} {self.title} {self.start_datetime.strftime('%Y-%m-%d %H:%M')}>"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "lesson", "label": "Lesson"}
        columns = [
            {"field": "lesson", "label": "Lesson"},
            {"field": "start_datetime", "label": "Start"},
            {"field": "end_datetime", "label": "End"},
            {"field": "status", "label": "Status"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, type, label=None, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                type=type,
                label=label or name.capitalize(),
                **kwargs,
            )

        form = Form()

        info_block = Block(
            "info_block",
            fields=[
                get_field(
                    "lesson", "ManyToOne", label="Lesson", related_model="Lesson"
                ),
                get_field(
                    "level", "ManyToOne", label="Level", related_model="CoachLevel"
                ),
                get_field("start_datetime", "DateTime", label="Start Time"),
                get_field("end_datetime", "DateTime", label="End Time"),
                get_field("original_lesson_occurence_date", "Date", label="Original lesson occurence date"),
                get_field("notes", "Text", label="Notes"),
                get_field("overwrite_title", "Text", label="Titulo novo"),
                get_field("max_players", "Integer", label="Max players"),
                get_field(
                    "status",
                    "Select",
                    label="Status",
                    options=["scheduled", "canceled", "rescheduled", "completed"],
                ),
                get_field(
                    "players_relations",
                    "OneToMany",
                    label="Players",
                    related_model="Association_PlayerLessonInstance",
                ),
            ],
        )
        form.add_block(info_block)

        return form
