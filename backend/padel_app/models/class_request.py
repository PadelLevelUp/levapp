from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Index, Integer, Text, delete, event, inspect, or_, select
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.utils.dates import utcnow_naive


class ClassRequest(db.Model, model.Model):
    """classes.class-requests (PAD-104) — a student asks a coach for a class
    at a slot the coach's calendar leaves free; the coach accepts, declines or
    proposes another time. ``start_datetime``/``end_datetime`` are the slot
    currently on the table (moved by a counter-proposal); ``hold_block_id``
    is the calendar block holding it on the coach's calendar while open.
    """

    __tablename__ = "class_requests"
    # Created by migration e4b8c2d17a35 (PAD-104); declared so autogenerate
    # stops proposing to drop them (PAD-220).
    __table_args__ = (
        Index("ix_class_requests_coach_id", "coach_id"),
        Index("ix_class_requests_player_id", "player_id"),
        Index("ix_class_requests_start_datetime", "start_datetime"),
        {"extend_existing": True},
    )

    page_title = "Class Requests"
    model_name = "ClassRequest"

    id = Column(Integer, primary_key=True)

    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    player = relationship("Player", foreign_keys=[player_id])

    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    coach = relationship("Coach", foreign_keys=[coach_id])

    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)
    # PAD-357 (classes.class-requests rules 12 and 14): the people the requester
    # brings (player ids, 0-3) and the weekly recurrence
    # {weekdays: [1..7, Monday = 1], startDate, endDate}; NULL = a single class.
    invitee_player_ids = Column(JSON, nullable=True)
    recurrence = Column(JSON, nullable=True)

    status = Column(
        Enum("pending", "countered", "accepted", "declined", "withdrawn", name="class_request_status"),
        nullable=False,
        server_default="pending",
        default="pending",
    )
    decided_by = Column(Enum("coach", "student", name="class_request_decider"), nullable=True)
    decided_at = Column(DateTime, nullable=True)

    hold_block_id = Column(Integer, ForeignKey("calendar_blocks.id", ondelete="SET NULL"), nullable=True)
    hold_block = relationship("CalendarBlock", foreign_keys=[hold_block_id])

    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    lesson = relationship("Lesson", foreign_keys=[lesson_id])

    @property
    def is_open(self) -> bool:
        return self.status in ("pending", "countered")

    @property
    def name(self):
        return f"Class request by player {self.player_id} to coach {self.coach_id} ({self.status})"

    def __repr__(self):
        return f"<ClassRequest player={self.player_id} coach={self.coach_id} status={self.status}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "status", "label": "Status"}
        columns = [
            {"field": "player", "label": "Player"},
            {"field": "coach", "label": "Coach"},
            {"field": "start_datetime", "label": "Start"},
            {"field": "status", "label": "Status"},
        ]
        return searchable, columns


# ── classes.class-requests rule 18 (PAD-360, B-135): a hold never outlives its request ──
#
# The status transitions release the hold in class_request_service. These hooks
# cover the request going away as a row. They run inside the flush, so they
# issue SQL on the flush's own connection instead of touching the session.

OPEN_STATUSES = ("pending", "countered")
# What `class_request_service._hold_title` writes; the one place both sides read it from.
HOLD_TITLE_PREFIXES = ("Pedido de aula · ", "Class request · ")


def _delete_blocks(connection, block_ids, *, only_if_still_a_hold=False) -> None:
    """``only_if_still_a_hold``: a coach may edit a hold like any block (rule 3), and
    a CLOSED request that still points at one may have pointed at it for months. Such
    a leftover takes the block with it only while the block is recognisably a hold —
    personal, and still carrying the hold title (#345 review, 2nd round)."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = [block_id for block_id in block_ids if block_id is not None]
    if not ids:
        return
    table = CalendarBlock.__table__
    statement = delete(table).where(table.c.id.in_(ids))
    if only_if_still_a_hold:
        statement = statement.where(
            table.c.type == "personal",
            or_(*[table.c.title.like(prefix + "%") for prefix in HOLD_TITLE_PREFIXES]),
        )
    connection.execute(statement)


@event.listens_for(ClassRequest, "before_delete")
def _release_hold_with_the_row(mapper, connection, target):
    """Both generic editor routes end in ``instance.delete()``. Before, not after:
    the row still exists if ``hold_block_id`` has to be loaded (#345 review F8)."""
    _delete_blocks(connection, [target.hold_block_id], only_if_still_a_hold=target.status not in OPEN_STATUSES)


@event.listens_for(ClassRequest, "before_update")
def _release_hold_when_closed_by_an_edit(mapper, connection, target):
    """Rule 3 by any writer: the admin editor can PATCH ``status`` straight to a
    closed value. The service paths have already released the hold by the time the
    status changes, so this is a no-op for them (#345 review F7).

    A request closed IN THIS FLUSH gives up its live hold, as the services do. A
    request that was already closed and still points at a block (a pre-PAD-360 row)
    is cleaned up lazily, and only if the block is still a hold; either way the
    pointer goes."""
    if target.status in OPEN_STATUSES or target.hold_block_id is None:
        return
    was = inspect(target).attrs.status.history.deleted or ()
    closed_now = any(value in OPEN_STATUSES for value in was)
    block_id, target.hold_block_id = target.hold_block_id, None
    _delete_blocks(connection, [block_id], only_if_still_a_hold=not closed_now)


def _release_holds_before_cascade(column):
    def _listener(mapper, connection, target):
        # ON DELETE CASCADE takes the requests away inside the database, where
        # no hook on ClassRequest runs — so the holds go first.
        table = ClassRequest.__table__
        held = connection.execute(
            select(table.c.hold_block_id, table.c.status).where(column == target.id, table.c.hold_block_id.isnot(None))
        ).all()
        _delete_blocks(connection, [block for block, status in held if status in OPEN_STATUSES])
        _delete_blocks(connection, [block for block, status in held if status not in OPEN_STATUSES],
                       only_if_still_a_hold=True)

    return _listener


def _register_cascade_hooks() -> None:
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    event.listen(Player, "before_delete", _release_holds_before_cascade(ClassRequest.__table__.c.player_id))
    event.listen(Coach, "before_delete", _release_holds_before_cascade(ClassRequest.__table__.c.coach_id))


_register_cascade_hooks()
