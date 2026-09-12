from sqlalchemy import CheckConstraint, Column, Integer, String, ForeignKey, Enum, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model

from padel_app.tools.input_tools import Block, Field, Form


#: PAD-259 (classes.instance-enrollment rule 3): how the row came to exist.
ENROLMENT_SOURCES = ("roster", "coach", "fill", "walk_in", "import", "unknown")


class Presence(db.Model, model.Model):
    __tablename__ = "presences"

    page_title = "Presences"
    model_name = "Presence"

    id = Column(Integer, primary_key=True)

    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"),
        nullable=False
    )
    player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False
    )
    
    player = relationship("Player", back_populates="presences")
    lesson_instance = relationship("LessonInstance", back_populates="presences")

    status = Column(Enum("present", "absent", name="lesson_presence_status"), nullable=True)
    justification = Column(Enum("justified", "unjustified", name="lesson_presence_justification"), nullable=True)

    # PAD-273 (audit M12): NOT NULL with a database default, so a raw insert
    # can never leave a NULL that `== True` readers silently drop.
    invited = Column(Boolean, default=False, nullable=False, server_default="0")
    confirmed = Column(Boolean, default=False, nullable=False, server_default="0")
    validated = Column(Boolean, default=False, nullable=False, server_default="0")
    # Set when a student cancels their attendance at or after the coach's
    # configured cancellation deadline (but before the class starts). PAD-43.
    late_cancellation = Column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # PAD-259: the presence row IS the per-occurrence enrolment (owner decision
    # 2026-09-11, option A). This records how it came to exist; it is never
    # read for authorization or capacity (classes.instance-enrollment rule 3).
    enrolment_source = Column(
        String(16), nullable=False, default="unknown", server_default="unknown"
    )
    
    @property
    def attendance_state(self) -> str:
        """PAD-313 (attendance.presence rule 9): the one state a human reads.

        Exactly one of five: ``planned`` (on the list, silent), ``coming``
        (answered yes), ``not_coming`` (answered no — a decline or a
        cancellation), ``attended`` / ``missed`` (the coach's validated record).
        While ``validated`` is false this reports the STUDENT's intent; once it
        is true it reports the COACH's record and nothing else.

        The ordering carries the fix. A decline writes ``confirmed = True`` —
        that flag means *answered*, not *coming* — so the absent check must come
        first. Testing ``confirmed`` first reports a student who just cancelled
        as confirmed, which is ledger B-073 and what a founder saw on
        TestFlight 20 as three contradictory badges at once.

        It is deliberately AUTHOR-BLIND: it says what is true of the spot, not
        who said it. On today's columns provenance cannot be told — a coach's
        own mark stamps ``validated``, which is the only reason an unvalidated
        absence is in practice the student's own. PAD-271's ``recorded_by``
        makes provenance a stored fact; until then nothing may read this field
        as "the student cancelled".
        """
        if self.validated and self.status == "present":
            return "attended"
        if self.validated and self.status == "absent":
            return "missed"
        # Student intent. Absent before confirmed — see the docstring.
        if self.status == "absent":
            return "not_coming"
        if self.confirmed:
            return "coming"
        return "planned"

    @property
    def name(self):
        return f"<Presence {self.id}"

    # PAD-280: assigned once. A second assignment used to replace the first,
    # silently dropping extend_existing.
    __table_args__ = (
        UniqueConstraint(
            "player_id", "lesson_instance_id",
            name="uq_presence_player_lesson_instance"
        ),
        # PAD-263: the unique pair leads with player_id, so the attendance
        # sheet's per-class lookup needs its own index.
        Index("ix_presences_lesson_instance_id", "lesson_instance_id"),
        CheckConstraint(
            "enrolment_source IN ('roster', 'coach', 'fill', 'walk_in', 'import', 'unknown')",
            name="ck_presences_enrolment_source",
        ),
        {"extend_existing": True},
    )

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False, options=None, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                required=required,
                options=options,
                **kwargs,
            )

        form = Form()

        info_block = Block(
            "info_block",
            fields=[
                get_field("lesson_instance", "Lesson instance", "ManyToOne", related_model="LessonInstance", required=True),
                get_field("player", "Player", "ManyToOne", related_model="Player", required=True),
                get_field("status", "Status", "Select", options=["present", "absent"]),
                get_field("justification", "Justification", "Select", options=["justified", "unjustified"]),
                get_field("invited", "Invited", "Boolean"),
                get_field("confirmed", "Confirmed", "Boolean"),
                get_field("validated", "Validated", "Boolean"),
                get_field("late_cancellation", "Late cancellation", "Boolean"),
            ],
        )
        form.add_block(info_block)
        
        return form

