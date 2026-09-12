from sqlalchemy import JSON, Column, Integer, String, Text, ForeignKey, Date, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Lesson(db.Model, model.Model):
    __tablename__ = "lessons"
    __table_args__ = {"extend_existing": True}

    page_title = "Lessons"
    model_name = "Lesson"

    id = Column(Integer, primary_key=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)

    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_rule = Column(Text, nullable=True)
    recurrence_end = Column(Date, nullable=True)
    recurs_until_season_end = Column(
        Boolean, default=False, nullable=False, server_default="0"
    )
    
    type = Column(Enum("academy", "private", name="lesson_type"), nullable=False)

    default_level_id = Column(Integer, ForeignKey("coach_levels.id", ondelete="SET NULL"))  # PAD-255
    level = relationship("CoachLevel")
    max_players = Column(Integer, nullable=False)

    color = Column(String(10))
    status = Column(
        Enum("active", name="lesson_status"),  # PAD-271: 'ended' dropped (never written)
        default="active",
        nullable=False,
        server_default="active",
    )  # PAD-273 (audit M12)
    notifications_enabled = Column(Boolean, default=True, nullable=False, server_default="1")
    # PAD-129 (eligibility.cascade): the series tier. NULL = no override here;
    # [] = a deliberate "everyone"; a list = the bar for this series.
    eligibility_rules = Column(JSON, nullable=True)
    # PAD-130 (eligibility.open-spot-visibility rule 3): series tier of the
    # "advertise empty spots" toggle. NULL = inherit, True/False = override.
    open_spots_visible = Column(Boolean, nullable=True)

    # Many-to-many: Lesson <-> Coach
    coaches_relations = relationship(
        "Association_CoachLesson", back_populates="lesson", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    club_id = Column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    club = relationship("Club", back_populates="lessons")

    # clubs.courts rule 6 (PAD-194): an optional court of the class's club.
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="SET NULL"), nullable=True)
    court = relationship("Court")

    # PAD-275 (classes.recurrence rule 6): the root lesson of the series this
    # row belongs to — its own id at creation, the root's id on a fork. Decided
    # 2026-09-11: historical forks are NOT reconnected (series_id = id).
    series_id = Column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # PAD-275 (classes.recurrence rule 7): dates removed from the series one at a
    # time (ISO strings). A single-occurrence delete records one here instead of
    # forking the lesson; `expand_occurrences` skips them.
    excluded_dates = Column(JSON, nullable=True)

    @property
    def coaches(self):
        return [rel.coach for rel in self.coaches_relations]

    def excluded_date_set(self):
        """The excluded dates as ``date`` objects (PAD-275 rule 7)."""
        from datetime import date as _date

        out = set()
        for value in self.excluded_dates or []:
            try:
                out.add(_date.fromisoformat(str(value)[:10]))
            except ValueError:
                continue
        return out

    def exclude_date(self, occ_date):
        """Record ``occ_date`` as removed from the series (idempotent)."""
        key = occ_date.isoformat()
        current = list(self.excluded_dates or [])
        if key not in current:
            current.append(key)
            current.sort()
            self.excluded_dates = current
        return self.excluded_dates

    def occurrences_between(self, range_start, range_end):
        """The series' occurrences in the range, exclusions honoured — the one
        way to expand a lesson (classes.recurrence rule 7)."""
        from padel_app.tools.calendar_tools import expand_occurrences

        return expand_occurrences(
            self.start_datetime,
            self.recurrence_rule,
            self.recurrence_end,
            range_start,
            range_end,
            excluded=self.excluded_date_set(),
        )

    def produces(self, occ_date) -> bool:
        """Does the series produce an occurrence on ``occ_date``?"""
        from datetime import datetime as _dt, time as _time, timedelta as _td

        day_start = _dt.combine(occ_date, _time.min)
        return any(
            occ.date() == occ_date
            for occ in self.occurrences_between(day_start, day_start + _td(days=1))
        )

    @property
    def effective_max_players(self):
        """A template's capacity is its own (mirrors LessonInstance's)."""
        return self.max_players

    @property
    def series_root_id(self):
        """The series this lesson belongs to: `series_id`, or its own id for a
        row that predates series ids (the migration backfills those)."""
        return self.series_id or self.id
    
    @property
    def name(self):
        return self.title

    # Many-to-many: Lesson <-> Player
    players_relations = relationship(
        "Association_PlayerLesson",
        back_populates="lesson",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]

    # One-to-many: Lesson -> LessonInstance
    instances = relationship(
        "LessonInstance", back_populates="lesson", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Lesson {self.title}>"

    def __str__(self):
        return self.title

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "title", "label": "Title"}
        columns = [
            {"field": "title", "label": "Title"},
            {"field": "start_datetime", "label": "Start"},
            {"field": "end_datetime", "label": "End"},
            {"field": "is_recurring", "label": "Recurring"},
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
                get_field("title", type="Text", label="Title"),
                get_field("club", type="ManyToOne", label="Club", related_model="Club"),
                get_field("description", type="Text", label="Description"),
                get_field("type", type="Select", label="Type", options=["academy", "private"]),
                get_field("status", type="Select", label="Status", options=["active"]),
                get_field("color", type="Color", label="Color"),
                get_field("max_players", type="Integer", label="Max players"),
                get_field("level", type="ManyToOne", label="Level", related_model="CoachLevel"),
                get_field("court", type="ManyToOne", label="Court", related_model="Court"),
                get_field("start_datetime", type="DateTime", label="Start Time"),
                get_field("end_datetime", type="DateTime", label="End Time"),
                get_field("is_recurring", type="Boolean", label="Is Recurring"),
                get_field("recurrence_rule", type="Text", label="Recurrence Rule"),
                get_field("recurrence_end", type="Date", label="Recurrence End"),
                get_field("recurs_until_season_end", type="Boolean", label="Recurs Until Season End"),
                get_field(
                    "coaches_relations",
                    "OneToMany",
                    label="Coaches",
                    related_model="Association_CoachLesson",
                ),
                get_field(
                    "players_relations",
                    "OneToMany",
                    label="Players",
                    related_model="Association_PlayerLesson",
                ),
            ],
        )
        form.add_block(info_block)

        return form

    def data_for_instance(self):
        return {
            "lesson_id": self.id,
            "lesson": self.id,
            "original_lesson_occurence_date": self.start_datetime.date(),
            "start_datetime": self.start_datetime,
            "end_datetime": self.end_datetime,
            # PAD-275 (classes.edit rule 4): no title copy — NULL inherits the
            # lesson's title, so a series rename reaches every occurrence.
            # Same for the level: NULL inherits `default_level_id` (PAD-275).
            "notifications_enabled": self.notifications_enabled,
            "status": "scheduled",
            "max_players": self.max_players,
            "player_ids": [
                rel.player_id
                for rel in self.players_relations
                if rel.player_id is not None
            ],
            "coach_ids": [
                rel.coach_id
                for rel in self.coaches_relations
                if rel.coach_id is not None
            ],
        }

    def to_instance_data(self):
        return self.data_for_instance()
