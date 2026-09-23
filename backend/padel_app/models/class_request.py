from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Index, Integer, Text, delete, event, select
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


def _is_hold(block_type, title) -> bool:
    """PAD-378's definition, THE one predicate for "still recognisably a hold": personal,
    and the title still starts with a hold prefix — case-sensitively. A coach who retitles
    a hold has made it theirs (rule 18). Both the refusal/marker path and the release-time
    delete go through here: a SQL `LIKE` would be case-insensitive on sqlite and
    case-sensitive on Postgres, and a lower-cased retitle would then be the coach's in one
    lane and a hold in the other (#380 review)."""
    return block_type == "personal" and (title or "").startswith(HOLD_TITLE_PREFIXES)


def _still_a_hold(block) -> bool:
    return _is_hold(block.type, block.title)


def live_hold_index(block_ids) -> dict:
    """``{block_id: request_id}`` for every block that is the LIVE hold of an OPEN request
    (PAD-372, rule 3). One query for a whole feed; the title test runs in Python so it is
    the same predicate `live_hold_request_id` applies to a single block."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = [block_id for block_id in block_ids if block_id is not None]
    if not ids:
        return {}
    rows = (
        db.session.query(ClassRequest.id, CalendarBlock)
        .join(CalendarBlock, CalendarBlock.id == ClassRequest.hold_block_id)
        .filter(ClassRequest.hold_block_id.in_(ids), ClassRequest.status.in_(OPEN_STATUSES))
        .all()
    )
    return {block.id: request_id for request_id, block in rows if _still_a_hold(block)}


def live_hold_request_id(block):
    """The OPEN request this block is the live hold of, or ``None`` (PAD-372, rule 3).

    ``None`` for a block no request points at, for a CLOSED request's leftover pointer
    (rule 18 clears it lazily) and for a hold the coach has retitled — that block is the
    coach's, whatever still points at it."""
    return live_hold_index([block.id]).get(block.id)


def _delete_blocks(connection, block_ids) -> None:
    """Delete the blocks that are still recognisably a hold — personal, still carrying the hold
    title — and leave the rest. A coach may edit a hold like any block (rule 3); a retitled
    one is theirs, open request or closed (PAD-378, B-151), and a closed request may have
    pointed at a block for months (#345 review, 2nd round). Every release path goes through
    here, so none of them can take a coach's event."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = [block_id for block_id in block_ids if block_id is not None]
    if not ids:
        return
    table = CalendarBlock.__table__
    # One row per request; filter with `_is_hold` in Python so this path and
    # `live_hold_index` cannot disagree by dialect.
    rows = connection.execute(select(table.c.id, table.c.type, table.c.title).where(table.c.id.in_(ids))).all()
    ids = [row_id for row_id, block_type, title in rows if _is_hold(block_type, title)]
    if ids:
        connection.execute(delete(table).where(table.c.id.in_(ids)))


@event.listens_for(ClassRequest, "before_delete")
def _release_hold_with_the_row(mapper, connection, target):
    """Both generic editor routes end in ``instance.delete()``. Before, not after:
    the row still exists if ``hold_block_id`` has to be loaded (#345 review F8)."""
    _delete_blocks(connection, [target.hold_block_id])


@event.listens_for(ClassRequest, "before_update")
def _release_hold_when_closed_by_an_edit(mapper, connection, target):
    """Rule 3 by any writer: the admin editor can PATCH ``status`` straight to a
    closed value. The service paths have already released the hold by the time the
    status changes, so this is a no-op for them (#345 review F7).

    A request closed IN THIS FLUSH gives up its hold, as the services do; a request
    that was already closed and still points at a block (a pre-PAD-360 row) is
    cleaned up lazily. Either way the block goes only while it is still a hold, and
    the pointer always goes (PAD-378)."""
    if target.status in OPEN_STATUSES or target.hold_block_id is None:
        return
    block_id, target.hold_block_id = target.hold_block_id, None
    _delete_blocks(connection, [block_id])


def _release_holds_before_cascade(column):
    def _listener(mapper, connection, target):
        # ON DELETE CASCADE takes the requests away inside the database, where
        # no hook on ClassRequest runs — so the holds go first.
        table = ClassRequest.__table__
        held = connection.execute(
            select(table.c.hold_block_id, table.c.status).where(column == target.id, table.c.hold_block_id.isnot(None))
        ).all()
        _delete_blocks(connection, [block for block, _status in held])

    return _listener


def _register_cascade_hooks() -> None:
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    event.listen(Player, "before_delete", _release_holds_before_cascade(ClassRequest.__table__.c.player_id))
    event.listen(Coach, "before_delete", _release_holds_before_cascade(ClassRequest.__table__.c.coach_id))


_register_cascade_hooks()
