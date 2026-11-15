"""The new engine's outbox senders (PAD-916, swap plan step 6): what a person receives for each effect
``dispatch`` hands over.

``engine_store.dispatch(send_effect)`` claims each undispatched ``engine_effects`` row (committed)
before calling ``send_effect`` with it, so nothing here is ever sent twice. PAD-918's tick and entry
points call it after their commit. Each sender writes the message the app already knows how to show,
through the old engine's own delivery choke point (``_send_system_message``: its backstops, live event
and push), with the shapes the specs give:

- ``Invited`` and ``Message(waiting_list_invite)``: a ``notification_invite`` bubble (invitations NB1),
  kept on its invitation (``attach_message``) so the store keeps its state current;
- ``Message(sorry)``: a ``waiting_list_offer`` message (NB5), ``Message(added)`` an ``added_to_class``
  one from ``waiting_list_added``, ``Message(side_moved)`` an ``engine_side_moved`` one from
  ``side_moved`` (message-templates new-engine section);
- ``AttendanceRequested``: today's ``notification_reminder``, linked to the store's attempt;
- ``CoachAlert``: an ``engine_alert`` message in the coach's Assistant conversation, pushed
  (dashboard.blocks NA3; owner decision 14);
- ``ApprovalRequest``: the group's ``replacement_approval`` request (semi-auto-approval N4).

Public API
----------
- send_effect(row) -> None
- send_approval_request(row) -> None
- spot_type_wire(spot_type, ladder) -> dict, people(coach_id, ids) -> dict, group(settings, tier) -> dict
"""
from __future__ import annotations

from padel_app.sql_db import db
from padel_app.utils.dates import wall_to_utc_naive

#: The side word ``{sideName}`` takes (message-templates N2).
SIDE_WORDS = {"en": {"L": "left", "R": "right"}, "pt": {"L": "esquerdo", "R": "direito"}}
#: The tiers whose invitation is a waiting-list invitation (invitations NB1's ``kind``).
WAITING_LIST_SOURCES = ("coach_list", "students_list")


def send_effect(row) -> None:
    """Send one outbox row (an ``engine_effects`` row ``dispatch`` claimed) to the people it reaches."""
    sender = {"Invited": _invitation, "Message": _message, "AttendanceRequested": _attendance_request,
              "CoachAlert": _coach_alert, "ApprovalRequest": send_approval_request}.get(row.kind)
    if sender is not None:
        sender(row)


# --- the wire shapes every new-engine payload shares ---------------------------------------------

def spot_type_wire(spot_type, ladder) -> dict:
    """A spot type on the wire (notifications.invite-simulation N2): ``side`` ``left``/``right``, or null
    for an "either" spot; ``levelId`` and ``levelLabel`` the coach's level at that ladder position
    (``ladder``: ``get_level_ladder``), both null for a type of any level."""
    from padel_app.services.engine_store import SIDE_TO_APP

    level = ladder[spot_type.level - 1] if spot_type.level is not None and 0 < spot_type.level <= len(ladder) else None
    return {"side": SIDE_TO_APP[spot_type.side], "levelId": getattr(level, "id", None),
            "levelLabel": getattr(level, "label", None)}


def people(coach_id: int, ids) -> dict[str, dict]:
    """Each student's name and the coach's nickname keys (players.nickname rule 9a)."""
    from padel_app.models import Player
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.services.player_service import nickname_payload

    ints = [int(i) for i in ids]
    links = {lk.player_id: lk for lk in Association_CoachPlayer.query.filter(
        Association_CoachPlayer.coach_id == coach_id, Association_CoachPlayer.player_id.in_(ints or [-1])).all()}
    out = {}
    for player in Player.query.filter(Player.id.in_(ints or [-1])).all():
        name = player.user.name if player.user else None
        out[str(player.id)] = {"name": name, **nickname_payload(links.get(player.id), name)}
    return out


def group(settings, tier: int | None) -> dict | None:
    """A group on the wire (calendar.event-detail ND1's names): ``tierSource`` (``coach_list``,
    ``students_list`` or ``pool``) and, for ``pool``, ``groupNumber``, its 1-based place among the coach's
    pool groups."""
    if tier is None or not 0 <= tier < len(settings.tiers):
        return None
    source = settings.tiers[tier].source
    number = sum(1 for t in settings.tiers[: tier + 1] if t.source == "pool") if source == "pool" else None
    return {"tierSource": source, "groupNumber": number}


# --- the session's people and words ------------------------------------------------------------------

class _Ctx:
    """One row's session: its occurrence, coach, locale and templates."""

    def __init__(self, row):
        from padel_app.models import Coach
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.services.engine_store import TableStore
        from padel_app.services.notification_service import _resolve_locale, get_or_create_config

        self.session = str(row.lesson_instance_id)
        self.payload = row.payload or {}
        self.instance = db.session.get(LessonInstance, row.lesson_instance_id)
        self.coach_id = TableStore().coach_of(self.session)
        self.coach = db.session.get(Coach, self.coach_id)
        self.locale = _resolve_locale(self.coach)
        self.templates = get_or_create_config(self.coach_id).get_message_templates(self.locale)

    def text(self, key: str, player=None, **extra) -> str:
        from padel_app.services.notification_service import (
            _format_template,
            resolve_message_template,
            template_variables,
        )

        return _format_template(resolve_message_template(self.templates, key, self.locale),
                                **{**template_variables(player, self.instance, self.locale), **extra})

    def starts_at(self) -> str | None:
        start = self.instance.start_datetime
        return wall_to_utc_naive(start).isoformat() if start else None

    def to_student(self, player_id: int, key: str, message_type: str, metadata: dict, **extra):
        """One message from the coach to the student, through the app's delivery choke point (its
        backstops, live event and push); ``None`` when a backstop withholds it."""
        from padel_app.models.players import Player
        from padel_app.services.notification_service import _send_system_message

        player = db.session.get(Player, int(player_id))
        if player is None or self.coach is None:
            return None
        return _send_system_message(coach_user_id=self.coach.user_id, player_user_id=player.user_id,
                                    text=self.text(key, player, **extra), message_type=message_type,
                                    msg_metadata=metadata)


def _side_phrase(side: str | None, locale: str) -> str:
    from padel_app.services.engine_store import SIDE_TO_APP
    from padel_app.services.notification_service import _side_phrase as phrase

    return phrase(SIDE_TO_APP.get(side), locale)


# --- the senders ---------------------------------------------------------------------------------------

def _invitation(row, kind: str | None = None) -> None:
    """A ``notification_invite`` bubble for the student's one invitation (invitations NB1): ``invite``,
    or ``waiting_list_invite`` for a waiting-list tier and for a reopened invitation, naming the side the
    invitation names; kept on the invitation so its state follows (NB1a)."""
    from padel_app.models import EngineInvitation
    from padel_app.services.engine_store import TableStore, settings_for

    ctx = _Ctx(row)
    student = ctx.payload.get("student")
    invitation_id = TableStore.invitation_id(ctx.session, student)
    inv = db.session.get(EngineInvitation, invitation_id) if invitation_id is not None else None
    if inv is None:
        return
    if kind is None and inv.manual:                         # PAD-932: the coach's invitation by hand is a plain invite
        kind = "invite"
    if kind is None:
        tiers = settings_for(ctx.session).tiers
        waiting = inv.tier is not None and 0 <= inv.tier < len(tiers) and tiers[inv.tier].source in WAITING_LIST_SOURCES
        kind = "waiting_list_invite" if waiting else "invite"
    side = _side_phrase(inv.side_named, ctx.locale) if kind == "waiting_list_invite" else ""
    msg = ctx.to_student(int(student), kind, "notification_invite", {
        "engine": "new", "invitationId": inv.id, "lessonInstanceId": int(ctx.session), "kind": kind,
        "state": "open", "startsAt": ctx.starts_at(),
        "countsUntil": inv.counts_until.isoformat() if inv.counts_until else None,
    }, **({"side": side} if side else {}))
    if msg is not None:
        TableStore.attach_message(inv.id, msg.id)
        db.session.commit()


def _message(row) -> None:
    """``Message`` by kind (invitations NB5; message-templates new-engine section)."""
    from padel_app.models.presences import Presence
    from padel_app.services.engine_store import SIDE_FROM_APP, TableStore

    kind = (row.payload or {}).get("kind")
    if kind in ("waiting_list_invite", "invite"):           # a reopened invitation: its new bubble
        _invitation(row, kind=kind)                         # ("invite": a manual reopen, PAD-932)
        return
    ctx = _Ctx(row)
    student = ctx.payload.get("student")
    if kind == "sorry":
        ctx.to_student(int(student), "waiting_list_offer", "waiting_list_offer", {
            "engine": "new", "invitationId": TableStore.invitation_id(ctx.session, student),
            "lessonInstanceId": int(ctx.session)})
        return
    presence = Presence.query.filter_by(lesson_instance_id=int(ctx.session), player_id=int(student)).first()
    side = SIDE_FROM_APP.get(getattr(presence, "assigned_side", None))
    if kind == "added":
        ctx.to_student(int(student), "waiting_list_added", "added_to_class",
                       {"engine": "new", "lessonInstanceId": int(ctx.session), "kind": "added"},
                       **({"side": _side_phrase(side, ctx.locale)} if side else {}))
    elif kind == "side_moved" and side is not None:
        ctx.to_student(int(student), "side_moved", "engine_side_moved",
                       {"engine": "new", "lessonInstanceId": int(ctx.session),
                        "side": {"L": "left", "R": "right"}[side]},
                       sideName=SIDE_WORDS[ctx.locale][side])


def _attendance_request(row) -> None:
    """Today's ``notification_reminder`` (``reminder``, then ``reminder_followup``), linked to the store's
    attempt for that send; the student's older unanswered reminders are retired, as today (PAD-49)."""
    from datetime import datetime

    from padel_app.models import ReminderAttempt
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.conversation_access import message_recipient_ids

    ctx = _Ctx(row)
    student = int(ctx.payload.get("student"))
    sent_at = datetime.fromisoformat(ctx.payload["at"]) if ctx.payload.get("at") else None
    attempt = (ReminderAttempt.query.filter_by(lesson_instance_id=int(ctx.session), player_id=student, sent_at=sent_at)
               .first())
    number = attempt.number if attempt is not None else 1
    for older in attempts.pending_attempts(int(ctx.session), student):
        if attempt is not None and older.id == attempt.id:
            continue
        changed = attempts.mark_superseded(older)
        if changed is not None:
            publish({"type": "message_edited", "payload": serialize_message(changed, None)},
                    message_recipient_ids(changed))
    start = ctx.instance.start_datetime
    msg = ctx.to_student(student, "reminder_followup" if number > 1 else "reminder", "notification_reminder", {
        "lessonInstanceId": int(ctx.session), "instanceId": int(ctx.session), "reminderNumber": number,
        "responded": False, "startsAt": start.isoformat() if start else None})
    if msg is not None and attempt is not None:
        attempt.message_id = msg.id
        db.session.commit()


def _coach_alert(row) -> None:
    """The nobody-left-to-invite alert (dashboard.blocks NA3; owner decision 14): the ``coach_no_candidate``
    text as an ``engine_alert`` message in the coach's Assistant conversation, with the class's link and
    club-local date, then the coach's push."""
    from padel_app.helpers.dashboard.coach_home import class_href
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.models import Message
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.level_ladder import get_level_ladder
    from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation
    from padel_app.utils.push_notifications import send_push_notification

    ctx = _Ctx(row)
    if ctx.coach is None or ctx.coach.user_id is None or not ctx.payload.get("spot_type"):
        return
    spot_type = SpotType(*ctx.payload["spot_type"])
    start = ctx.instance.start_datetime
    date = start.date().isoformat() if start else None
    href = class_href({"id": f"lessoninstance-{ctx.instance.id}", "date": date})
    count = int(ctx.payload.get("spots") or 0)
    text = ctx.text("coach_no_candidate", None, count=count,
                    **({"side": _side_phrase(spot_type.side, ctx.locale)} if spot_type.side else {}),
                    **{"class": getattr(getattr(ctx.instance, "lesson", None), "title", None) or ""})
    conv, assistant = _get_or_create_assistant_conversation(ctx.coach.user_id)
    msg = Message(text=text, sender_id=assistant.id, conversation_id=conv.id, message_type="engine_alert",
                  msg_metadata={"engine": "new", "lessonInstanceId": ctx.instance.id,
                                "reason": ctx.payload.get("reason"),
                                **spot_type_wire(spot_type, get_level_ladder(ctx.coach_id)),
                                "count": count, "href": href, "date": date})
    db.session.add(msg)
    db.session.commit()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    send_push_notification(user_id=ctx.coach.user_id, title="Nobody left to invite", body=text[:100],
                           url=f"/messages/{conv.id}")


# --- the approval request (semi-auto-approval N4; owner decisions 5 and 10) ---------------------------

def queues_wire(coach_id: int, queues, snapshot) -> list[dict]:
    """A request's queues on the wire: per spot type (invite-simulation N2's shape) its open spots now
    (``count``, from the session's counts) and its students in order."""
    from padel_app.invitation_engine import planner
    from padel_app.services.level_ladder import get_level_ladder

    names = people(coach_id, {sid for _, ids in queues for sid in ids})
    ladder = get_level_ladder(coach_id)
    counts = dict(planner.spot_types(snapshot))
    return [{**spot_type_wire(spot_type, ladder), "count": counts.get(spot_type, 0),
             "queue": [{"playerId": sid, **names.get(sid, {}), "rank": rank} for rank, sid in enumerate(ids, 1)]}
            for spot_type, ids in queues]


def card(row) -> dict:
    """The Assistant message's payload for an ``ApprovalRequest`` outbox row (semi-auto-approval N4): the
    request id, the class, its group, ``state`` pending, and per open spot type its open spots and its
    queue."""
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.services.engine_store import TableStore, settings_for

    session = str(row.lesson_instance_id)
    store = TableStore()
    payload = row.payload or {}
    queues = tuple((SpotType(*spot), tuple(ids)) for spot, ids in payload.get("queues") or ())
    return {"engine": "new", "requestId": payload.get("request"), "lessonInstanceId": int(session),
            "group": group(settings_for(session), payload.get("tier")), "state": "pending", "responded": False,
            "spotTypes": queues_wire(store.coach_of(session), queues, store.snapshot(session))}


#: The request's message (semi-auto-approval N4, message-templates rule 6; proposed, after the owner's own
#: example in decision 5), per coach locale, and a group's name in it (calendar.event-detail ND1).
CARD_TEXT = {
    "pt": "Vou começar a convidar {group} para {klass}, {weekday} às {time}: {n} aluno(s) na fila. Aprovas?",
    "en": "I'll start inviting {group} for {klass}, {weekday} at {time}: {n} student(s) in the queue. Do you approve?",
}
GROUP_NAMES = {
    "pt": {"coach_list": "a lista do treinador", "students_list": "a lista de espera", "pool": "o grupo {n}"},
    "en": {"coach_list": "the coach's list", "students_list": "the waiting list", "pool": "group {n}"},
}


def card_text(card_payload: dict, coach, instance) -> str:
    """The message's text in the coach's locale: the group, the class, its day and time, and how many
    students the request's queues hold."""
    from padel_app.services.notification_service import _format_weekday, _resolve_locale

    locale = _resolve_locale(coach)
    start = instance.start_datetime
    klass = getattr(getattr(instance, "lesson", None), "title", None) or ""
    g = card_payload.get("group") or {}
    name = GROUP_NAMES[locale].get(g.get("tierSource"), "").format(n=g.get("groupNumber") or "")
    n = len({q["playerId"] for t in card_payload["spotTypes"] for q in t["queue"]})
    return CARD_TEXT[locale].format(group=name, klass=klass, weekday=_format_weekday(start, locale),
                                    time=start.strftime("%H:%M") if start else "", n=n)


def send_approval_request(row) -> None:
    """The outbox's sender for an ``ApprovalRequest`` row: the request as one ``replacement_approval``
    message in the coach's Assistant conversation (rule 6, as today), kept on its pending request so it
    follows the request (``attach_request_message``), then the live event and the coach's push. A request
    no longer pending when its turn comes is not posted."""
    from padel_app.models import Coach, Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.engine_store import TableStore
    from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation
    from padel_app.utils.push_notifications import send_push_notification

    store = TableStore()
    session = str(row.lesson_instance_id)
    request_id = (row.payload or {}).get("request")
    if not any(p.request == request_id for p in store.snapshot(session).approval.pending):
        return
    payload = card(row)
    coach = db.session.get(Coach, store.coach_of(session))
    if coach is None or coach.user_id is None:
        return
    conv, assistant = _get_or_create_assistant_conversation(coach.user_id)
    text = card_text(payload, coach, db.session.get(LessonInstance, row.lesson_instance_id))
    msg = Message(text=text, sender_id=assistant.id, conversation_id=conv.id,
                  message_type="replacement_approval", msg_metadata=payload)
    db.session.add(msg)
    db.session.flush()
    store.attach_request_message(session, request_id, msg.id)
    db.session.commit()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    send_push_notification(user_id=coach.user_id, title="Replacement approval needed", body=text[:100],
                           url=f"/messages/{conv.id}")
