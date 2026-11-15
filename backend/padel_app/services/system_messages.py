"""
System messages: one coach↔student conversation, one message persisted and delivered (live event,
web push, native push), and the class notices built on it.

Moved out of ``notification_service`` (PAD-914) so they outlive the old invitation engine: class
requests, join requests, evaluation shares, profile reminders, enrolment and cancellation notices
all send through here.
"""

from __future__ import annotations

from padel_app.sql_db import db
from padel_app.models import LessonInstance, NotificationConfig
from padel_app.models.notification_config import default_templates_for_locale, resolve_message_template
from padel_app.realtime import publish
from padel_app.services.conversation_access import message_recipient_ids
from padel_app.services.message_text import (
    _format_class_when,
    _format_template,
    _resolve_locale,
    template_variables,
)
from padel_app.utils.push_notifications import send_push_notification


# PAD-107 + PAD-112: message types that ASK a student to play in a specific
# class slot. These are the only sends a suppression rule may drop — both an
# availability blocker (PAD-107) and a student's own block preference (PAD-112)
# are enforced against exactly this vocabulary, via two additive guards in
# ``_send_system_message``. Both tickets introduced this constant independently,
# with the same name and the same three values; the batch merge kept one
# definition and both guards.
#
# Plain chat, class-cancellation notices and "you got the spot" confirmations
# are deliberately NOT in here: silencing invitations must never cut a student
# off from their coach.
_BLOCKABLE_MESSAGE_TYPES = frozenset({
    "notification_invite",
    "notification_reminder",
    "waiting_list_offer",
})


def _get_or_create_direct_conversation(coach_user_id: int, player_user_id: int):
    """PAD-411: race-safe (`Conversation.get_or_insert`); commits as `create()` always did —
    unless a unit of work is open, which commits at its end (PAD-272)."""
    from padel_app.models import Conversation
    from padel_app.tools.unit_of_work import commit_or_flush

    conv = Conversation.get_or_insert([coach_user_id, player_user_id])
    commit_or_flush()
    return conv


def _send_system_message(
    coach_user_id: int,
    player_user_id: int,
    text: str,
    message_type: str = "text",
    msg_metadata: dict | None = None,
    class_instance_id: int | None = None,
    push: bool = True,
    *,
    conversation=None,
    before_commit=None,
):
    """Persist one coach→student message, then deliver it (live event, push).

    ``conversation`` and ``before_commit`` (PAD-497, #526 review): an invitation's sender fetches
    the conversation BEFORE it flushes the invitation (getting or creating it commits), and passes
    ``before_commit`` to stamp the invitation's ``message_id`` — so the invitation, its message and
    the link between them land in ONE commit, and delivery happens only after it.
    """
    import padel_app.models as models
    from padel_app.serializers.message import serialize_message
    from padel_app.tools.unit_of_work import commit_or_flush
    from padel_app.utils.expo_push import send_expo_push_to_user

    # PAD-67 backstop: never deliver an empty message. Template resolution
    # (``resolve_message_template``) already substitutes a built-in default for a
    # missing/blank template, so reaching here with blank text means the rendered
    # body genuinely has nothing to say — sending it would only produce the empty
    # chat bubbles + empty push notifications reported in the ticket.
    if not (text or "").strip():
        from flask import current_app, has_app_context
        if has_app_context():
            current_app.logger.warning(
                "_send_system_message: refusing to send an empty %s message to user %s",
                message_type, player_user_id,
            )
        return None

    # PAD-107 hard backstop — "em nenhuma circunstância". A student who marked
    # themselves unavailable must never be solicited about a class that falls in
    # that window, whatever fired the send: the coach's "Lembrar"/notify buttons,
    # the APScheduler reminder job, an auto-invitation round, or the waiting-list
    # cascade. Enforcing it at the single delivery choke point means no future
    # caller can bypass it by accident.
    #
    # Scope is deliberately narrow: only the three CLASS-SLOT SOLICITATION types.
    # Plain chat, cancellation notices and "you got the spot" confirmations still
    # go through — being unavailable means "don't ask me to play at that hour",
    # not "cut me off from my coach".
    resolved_instance_id = class_instance_id
    if resolved_instance_id is None and msg_metadata:
        resolved_instance_id = msg_metadata.get("lessonInstanceId") or msg_metadata.get("instanceId")

    if message_type in _BLOCKABLE_MESSAGE_TYPES and resolved_instance_id is not None:
        from padel_app.services.student_availability_service import (
            instance_window_is_blocked_for_user,
        )

        _blocked_instance = LessonInstance.query.get(resolved_instance_id)
        if instance_window_is_blocked_for_user(player_user_id, _blocked_instance):
            from flask import current_app, has_app_context
            if has_app_context():
                current_app.logger.info(
                    "_send_system_message: suppressing %s for user %s — availability "
                    "blocker overlaps lesson instance %s (PAD-107)",
                    message_type, player_user_id, resolved_instance_id,
                )
            return None

    # PAD-112 backstop — a student who blocked ALL notifications is never
    # solicited about a class slot, whatever fired the send: the coach's
    # notify/remind buttons, the APScheduler reminder job, an auto-invitation
    # round, or the waiting-list cascade. Enforcing it at the single delivery
    # choke point means no future caller can bypass it by accident.
    #
    # This is a SAFETY NET, not the primary enforcement. The auto path filters
    # in `get_eligible_students`, the manual path filters before it creates the
    # NotificationEvent, and `send_class_reminders` filters before it sends —
    # because blocking only here would leave events marked "sent" with no
    # message behind them.
    #
    # Purely a per-recipient lookup: unlike the PAD-107 availability backstop it
    # needs no lesson instance, so the two guards simply sit in sequence — a
    # send is suppressed if EITHER says so.
    if message_type in _BLOCKABLE_MESSAGE_TYPES:
        from padel_app.services.student_notification_preferences import (
            user_blocks_all_notifications,
        )

        if user_blocks_all_notifications(player_user_id):
            from flask import current_app, has_app_context
            if has_app_context():
                current_app.logger.info(
                    "_send_system_message: suppressing %s for user %s — they "
                    "blocked all notifications (PAD-112)",
                    message_type, player_user_id,
                )
            return None

    conv = conversation or _get_or_create_direct_conversation(coach_user_id, player_user_id)
    msg = models.Message(
        text=text,
        sender_id=coach_user_id,
        conversation_id=conv.id,
        message_type=message_type,
        msg_metadata=msg_metadata or {},
    )
    db.session.add(msg)
    db.session.flush()
    if before_commit is not None:
        before_commit(msg)
    commit_or_flush()  # the message (and whatever its caller flushed with it), as create() did

    # The coach and the player of the direct conversation, nobody else (B-004). PAD-918 (INVITATIONS-124):
    # once per reader when a new-engine invitation carries countsUntil.
    from padel_app.services.message_events import per_reader, publish_message_event

    if per_reader(msg):
        publish_message_event("message_created", msg)
    else:
        publish(
            {"type": "message_created", "payload": serialize_message(msg, None)},
            message_recipient_ids(msg),
        )

    if not push:
        return msg

    _push_message(msg, player_user_id, resolved_instance_id)

    return msg


def _push_message(msg, player_user_id: int, instance_id: int | None) -> None:
    """The web push and the native (Expo) push of one chat message to its student — the one writer
    of this payload (R-029), used by `_send_system_message` and by the pending nudge (PAD-620).

    Native: PAD-240 — a MESSAGE notification (messaging.push-notifications rule 7); the tap opens the
    conversation, where the Yes/No and the reply live (routing to class/[id] dead-ended: a push never
    carries the route params that screen rebuilds its event from). The instance id rides along as
    context only. PAD-147: the badge is the recipient's real unread total (rule 5).
    PAD-713 (rule 14): titled in the student's own language, web and iOS alike."""
    from padel_app.models.users import User

    student = db.session.get(User, player_user_id)
    language = getattr(student, "language", None) or "pt"
    title = "New message" if str(language).startswith("en") else "Nova mensagem"
    send_push_notification(
        user_id=player_user_id,
        title=title,
        body=(msg.text or "")[:100],
        url=f"/messages/{msg.conversation_id}?message={msg.id}",
    )
    push_data = {"type": "message", "conversationId": msg.conversation_id, "messageId": msg.id}
    if instance_id is not None:
        push_data["classInstanceId"] = instance_id
    from padel_app.services.messaging_service import get_unread_count
    from padel_app.utils.expo_push import send_expo_push_to_user
    send_expo_push_to_user(
        player_user_id,
        title=title,
        body=(msg.text or "")[:100],
        data=push_data,
        badge=get_unread_count(player_user_id),
    )


def _notify_coach_of_cancellation(
    coach_user_id: int,
    player_user_id: int,
    instance: LessonInstance,
    player,
    *,
    is_late: bool,
    is_proactive: bool = False,
    locale: str = "en",
) -> "object | None":
    """Create a single COACH-facing notification when a student cancels.

    Unlike ``_send_system_message`` (which pushes to the *player*), this reuses the
    same coach↔player direct conversation but sends the message *from the student*
    (``sender_id=player_user_id``) and directs the push notification at the
    ``coach_user_id`` — so the coach is the one who actually gets notified.

    Emitted from ``cancel_attendance`` only (the single path that computes
    lateness), so it fires exactly once per cancellation. The human-readable text
    reflects lateness, and ``msg_metadata`` carries a machine-readable
    ``lateCancellation`` marker plus the ``lessonInstanceId``.
    """
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    if not coach_user_id or not player_user_id:
        return None

    is_pt = (locale or "").startswith("pt")
    player_name = player.user.name if player and player.user else (
        "Um jogador" if is_pt else "A player"
    )
    class_title = instance.title or ("a aula" if is_pt else "the class")
    when = _format_class_when(instance, locale)

    # PAD-100: the whole notification string must be localized to the coach's
    # language. Previously only the interpolated fields (name, class, weekday)
    # were localized while the template words stayed English, producing a mixed
    # "cancelled (LATE) for ... on <weekday-in-pt>" message for PT coaches.
    # PAD-73: a proactive decline gets its own wording. The coach should be able
    # to tell at a glance that this student spoke up EARLY — before they were
    # even asked to confirm — because that is exactly the behaviour the feature
    # is meant to encourage, and it reads very differently from a late drop-out.
    if is_proactive:
        if is_pt:
            text = (
                f"{player_name} avisou com antecedência que não vai comparecer "
                f"a {class_title}{when}. A vaga foi libertada."
            )
        else:
            text = (
                f"{player_name} let you know in advance that they will not attend "
                f"{class_title}{when}. The spot has been freed."
            )
    elif is_pt:
        marker = " (ATRASADO)" if is_late else ""
        text = f"{player_name} cancelou{marker} para {class_title}{when}."
    elif is_late:
        text = f"{player_name} cancelled (LATE) for {class_title}{when}."
    else:
        text = f"{player_name} cancelled for {class_title}{when}."

    conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
    msg = Message(
        text=text,
        sender_id=player_user_id,
        conversation_id=conv.id,
        message_type="text",
        msg_metadata={
            "cancellation": True,
            "lateCancellation": bool(is_late),
            # PAD-73: machine-readable marker so clients can style an early
            # heads-up differently from a plain or late cancellation.
            "proactiveDecline": bool(is_proactive),
            "lessonInstanceId": instance.id,
        },
    )
    msg.create()

    publish(
        {"type": "message_created", "payload": serialize_message(msg, None)},
        message_recipient_ids(msg),
    )

    if is_proactive:
        push_title = "Aviso antecipado" if is_pt else "Advance notice"
    elif is_pt:
        push_title = "Cancelamento tardio" if is_late else "Cancelamento"
    else:
        push_title = "Late cancellation" if is_late else "Cancellation"

    # PAD-288 (attendance.confirm rules 8 and 23): the chat message above is
    # sent for every cancellation; the coach's phone is pushed only for a LATE
    # one. Early cancellations are visible in the class detail, not noisy.
    if not is_late:
        return msg
    # PAD-683 (players.nickname rule 9c): the push goes to the coach alone, so it names the
    # student by the coach's display name; the stored message above keeps the real name.
    from padel_app.services.player_service import coach_facing_text

    push_body = coach_facing_text(
        text, coach_user_id, player.id if player else None, player_name
    )[:100]
    send_push_notification(
        user_id=coach_user_id,
        title=push_title,
        body=push_body,
        url=f"/messages/{conv.id}?message={msg.id}",
    )

    # PAD-240: the cancellation is a message in the coach–student thread, so
    # the push opens that thread (messaging.push-notifications rule 7); the
    # instance id is context only.
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.services.messaging_service import get_unread_count
    send_expo_push_to_user(
        coach_user_id,
        title=push_title,
        body=push_body,
        data={
            "type": "message",
            "conversationId": conv.id,
            "messageId": msg.id,
            "classInstanceId": instance.id,
        },
        # PAD-147: unread total as the icon badge, like every message push.
        badge=get_unread_count(coach_user_id),
    )

    return msg


def notify_student_added_to_class(coach, player_id, *, lesson=None, instance=None, counted_as_coming=False):
    """Tell a student their coach has placed them in a class (PAD-330).

    Enrolment was silent on every coach-initiated path: creating a class with
    students on it, adding one to the series, adding one to a single occurrence,
    or putting back someone who had cancelled. A student simply found a class on
    their calendar, holding a commitment they never agreed to and with no reason
    to go looking. They learned of it only when the ordinary reminder eventually
    asked them — which never happens for someone added after that reminder has
    already fired.

    It is a **normal message in the coach-student thread**, not a new push type.
    ``_send_system_message`` already writes the Message, publishes it and pushes
    with ``{"type": "message", "conversationId": …}``. A class-shaped push would
    tempt ``type: "class"``, which the mobile class screen cannot open from a
    push — the founder-facing "não foi possível encontrar esta aula" of PAD-324.

    Best-effort by design: a messaging failure must never fail the enrolment that
    triggered it, so everything here is contained and logged.

    ``counted_as_coming`` (PAD-489, notifications.reminders rule 22): the class was created
    after its reminder time and the student's presence is already answered yes; the
    ``added_to_class_coming`` template says so and asks nothing.

    Returns the Message, or ``None`` when nothing was sent.
    """
    try:
        from padel_app.models import Player

        source = instance if instance is not None else lesson
        if coach is None or source is None:
            return None
        coach_user_id = getattr(coach, "user_id", None)
        player_user_id = _user_id_for_player(player_id)
        if not coach_user_id or not player_user_id:
            return None

        locale = _resolve_locale(coach)
        # A plain query, never `get_or_create_config`: telling a student they
        # were added must not CREATE a coach's notification settings as a side
        # effect of an enrolment. It did, and the row it inserted collided with
        # the one the caller went on to make — the same reason
        # `proactive_decline_deadline` reads rather than creates.
        config = NotificationConfig.query.filter_by(coach_id=coach.id).first()
        templates = (
            config.get_message_templates(locale)
            if config is not None
            else dict(default_templates_for_locale(locale))
        )
        player = Player.query.get(player_id)
        first_name = (
            (player.user.name or "").split()[0]
            if player and player.user and player.user.name
            else ""
        )
        # PAD-670 (rule 3a): the one set of values every template gets. `{when}` is dated for one
        # occurrence and weekday-only for the whole series (rule 17).
        text = _format_template(
            resolve_message_template(
                templates, "added_to_class_coming" if counted_as_coming else "added_to_class", locale,
            ),
            **{**template_variables(player, source, locale), "name": first_name},
        )
        metadata = {"addedToClass": True}
        if counted_as_coming:
            metadata["countedAsComing"] = True
        if instance is not None:
            metadata["lessonInstanceId"] = instance.id
        return _send_system_message(
            coach_user_id,
            player_user_id,
            text,
            msg_metadata=metadata,
            class_instance_id=instance.id if instance is not None else None,
        )
    except Exception:  # noqa: BLE001 — never fail an enrolment over a message
        from flask import current_app, has_app_context

        if has_app_context():
            current_app.logger.exception(
                "notify_student_added_to_class: could not tell player %s", player_id,
            )
        return None


def notify_student_removed(source, player_id, *, series=False):
    """Tell a student their coach took them off a class (PAD-928).

    ``series=False``: off one date (``classes.instance-enrollment`` rule 11a), ``source`` is the
    occurrence (or, for a one-off class never materialised, its lesson) and the text is
    ``removed_from_class``. ``series=True``: off a recurring class from a date on
    (``classes.enrollment`` rule 4), ``source`` is the lesson the edit wrote and the text is
    ``removed_from_series``. Sent the way the cancellation notice is: a message in the
    coach-student thread through ``_send_system_message``, from the class's first coach. The
    caller decides WHETHER to send (who was on it, started, cancelled); this only renders and
    sends. Best-effort: a failure is logged and returns None, never failing the edit.
    """
    try:
        from padel_app.models import Player
        from padel_app.services.lesson_service import primary_coach

        if isinstance(source, LessonInstance):
            coach = primary_coach(source)
        else:
            rels = list(getattr(source, "coaches_relations", []) or [])
            coach = getattr(rels[0], "coach", None) if rels else None
        player = db.session.get(Player, int(player_id))
        coach_user_id = getattr(coach, "user_id", None)
        player_user_id = getattr(player, "user_id", None)
        if not coach_user_id or not player_user_id:
            return None

        locale = _resolve_locale(coach)
        # A plain read, as notify_student_added_to_class: a notice never creates a coach's config.
        config = NotificationConfig.query.filter_by(coach_id=coach.id).first()
        templates = (
            config.get_message_templates(locale)
            if config is not None
            else dict(default_templates_for_locale(locale))
        )
        key = "removed_from_series" if series else "removed_from_class"
        text = _format_template(
            resolve_message_template(templates, key, locale),
            **template_variables(player, source, locale),
        )
        instance_id = source.id if isinstance(source, LessonInstance) else None
        metadata = {"removedFromClass": True}
        if series:
            metadata["series"] = True
        if instance_id is not None:
            metadata["lessonInstanceId"] = instance_id
        return _send_system_message(
            coach_user_id,
            player_user_id,
            text,
            msg_metadata=metadata,
            class_instance_id=instance_id,
        )
    except Exception:  # noqa: BLE001 — never fail an edit over a message
        from flask import current_app, has_app_context

        if has_app_context():
            current_app.logger.exception("notify_student_removed: could not tell player %s", player_id)
        return None


def collect_cancellation_recipients(source) -> list[dict]:
    """Snapshot what's needed to tell each enrolled student a class was cancelled.

    PAD-75: when a coach cancels/removes a scheduled class, every enrolled student
    should be told. This resolves the coach, the coach's locale + message
    templates, and each enrolled student's user id and personalised message text
    into plain dicts, so the caller can send the notifications AFTER the class (and
    its relations) has been removed.

    Works uniformly for a ``Lesson`` or a ``LessonInstance`` — both expose
    ``coaches_relations``, ``players_relations``, ``title``, ``start_datetime`` and
    ``level``. MUST be called BEFORE removal, because removal cascade-deletes those
    relations. Returns ``[]`` when there is no coach or no enrolled student, so the
    caller sends nothing.
    """
    from padel_app.models import Coach, LessonInstance, Player

    coach_rels = list(getattr(source, "coaches_relations", []) or [])
    coach = None
    if coach_rels:
        coach = getattr(coach_rels[0], "coach", None) or Coach.query.get(
            coach_rels[0].coach_id
        )
    coach_user_id = coach.user_id if coach else None
    if not coach_user_id:
        return []

    from padel_app.services.notification_service import get_or_create_config

    locale = _resolve_locale(coach)
    config = get_or_create_config(coach.id)
    templates = config.get_message_templates(locale)

    # Only a materialized LessonInstance carries an id the mobile app can route to.
    instance_id = source.id if isinstance(source, LessonInstance) else None

    recipients: list[dict] = []
    # PAD-259: an instance's roster is its presences; a Lesson's is the series roster.
    roster_rows = source.presences if isinstance(source, LessonInstance) else getattr(source, "players_relations", [])
    for rel in list(roster_rows or []):
        player = getattr(rel, "player", None) or Player.query.get(rel.player_id)
        player_user_id = player.user_id if player else None
        if not player_user_id:
            continue
        text = _format_template(
            resolve_message_template(templates, "class_cancelled", locale),
            **template_variables(player, source, locale),
        )
        recipients.append(
            {
                "coach_user_id": coach_user_id,
                "player_user_id": player_user_id,
                "text": text,
                "instance_id": instance_id,
            }
        )
    return recipients


def notify_students_of_cancellation(recipients: list[dict]) -> int:
    """Send each pre-computed cancellation notification (PAD-75).

    Reuses ``_send_system_message`` — the same coach→student conversation channel
    (in-app message + push) used by every other class notification. Returns the
    number of messages actually sent.
    """
    sent = 0
    for r in recipients or []:
        metadata = {"classCancellation": True}
        if r.get("instance_id") is not None:
            metadata["lessonInstanceId"] = r["instance_id"]
        msg = _send_system_message(
            coach_user_id=r["coach_user_id"],
            player_user_id=r["player_user_id"],
            text=r["text"],
            message_type="text",
            msg_metadata=metadata,
            class_instance_id=r.get("instance_id"),
        )
        if msg is not None:
            sent += 1
    return sent


def _user_id_for_player(player_id: int) -> int | None:
    from padel_app.models import Player
    player = Player.query.get(player_id)
    return player.user_id if player else None


def _user_id_for_coach(coach_id: int) -> int | None:
    from padel_app.models import Coach
    coach = Coach.query.get(coach_id)
    return coach.user_id if coach else None
