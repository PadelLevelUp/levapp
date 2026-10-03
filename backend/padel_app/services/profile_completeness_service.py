"""dashboard.profile-completeness (PAD-486, PAD-490).

A coach-student link is incomplete when it has no level or no side (rule 1). The coach sees who
on the dashboard; the student sees why classes are missing and may remind the coach once per
club day (rule 6).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import abort, jsonify, make_response

from padel_app.sql_db import db
from padel_app.utils.dates import club_day_start_utc, utcnow_naive

PROFILE_REMINDER = "profile_reminder"
COACH_BLOCK_LIMIT = 5


def missing_of(cp) -> List[str]:
    """Rule 1: what a link lacks, in a fixed order."""
    missing = []
    if cp.level_id is None:
        missing.append("level")
    if cp.side is None:
        missing.append("side")
    return missing


def _incomplete_rows(coach_id: int):
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.players import Player

    return (
        db.session.query(Association_CoachPlayer, User)
        .join(Player, Player.id == Association_CoachPlayer.player_id)
        .join(User, User.id == Player.user_id)
        .filter(
            Association_CoachPlayer.coach_id == coach_id,
            User.status != "disabled",
            db.or_(Association_CoachPlayer.level_id.is_(None), Association_CoachPlayer.side.is_(None)),
        )
        .order_by(User.name.asc(), Association_CoachPlayer.player_id.asc())
        .all()
    )


def build_incomplete_players_block(*, coach_id: int) -> Optional[Dict[str, Any]]:
    """Rule 3: the coach's block, or None when nobody is missing anything."""
    rows = _incomplete_rows(coach_id)
    if not rows:
        return None
    missing_level = sum(1 for cp, _u in rows if cp.level_id is None)
    missing_side = sum(1 for cp, _u in rows if cp.side is None)
    players = [
        {
            "playerId": cp.player_id,
            "name": user.name,
            "missing": missing_of(cp),
            "href": f"/players/{cp.player_id}",
        }
        for cp, user in rows[:COACH_BLOCK_LIMIT]
    ]
    # #523 review: the same definition as the block (no level OR no side).
    see_all = "/players?incomplete=true"
    return {
        "id": "incomplete_players",
        "type": "incomplete_players",
        "data": {
            "count": len(rows),
            "missingLevel": missing_level,
            "missingSide": missing_side,
            "players": players,
            "seeAllHref": see_all,
        },
    }


def _club_day_bounds(now_utc):
    return club_day_start_utc(now_utc), club_day_start_utc(now_utc, days_offset=1)


def _reminded_today(player_user_id: int, coach_id: int, now_utc) -> bool:
    from padel_app.models import Message

    start, end = _club_day_bounds(now_utc)
    rows = (
        Message.query.filter(
            Message.sender_id == player_user_id,
            Message.message_type == PROFILE_REMINDER,
            Message.sent_at >= start,
            Message.sent_at < end,
        ).all()
    )
    return any(((m.msg_metadata or {}).get("profileReminder") or {}).get("coachId") == coach_id for m in rows)


def build_profile_incomplete_block(*, player, now_utc=None) -> Optional[Dict[str, Any]]:
    """Rule 4: the student's block, one entry per coach whose link is incomplete."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach

    now_utc = now_utc or utcnow_naive()
    entries = []
    rows = (
        db.session.query(Association_CoachPlayer, Coach)
        .join(Coach, Coach.id == Association_CoachPlayer.coach_id)
        .filter(Association_CoachPlayer.player_id == player.id)
        .order_by(Association_CoachPlayer.coach_id.asc())
        .all()
    )
    from padel_app.services.messaging_service import _is_blocked_either_way

    for cp, coach in rows:
        missing = missing_of(cp)
        # Rule 1: a disabled coach is not counted, nor offered a reminder (as the Players alerts).
        if not missing or coach.user is None or coach.user.status == "disabled":
            continue
        entries.append({
            "coachId": coach.id,
            "coachName": coach.user.name,
            "missing": missing,
            "remindedToday": _reminded_today(player.user_id, coach.id, now_utc),
            # Rule 6e: no button for a blocked pair (either way); the card still explains.
            "canRemind": not _is_blocked_either_way(player.user_id, coach.user.id),
        })
    if not entries:
        return None
    return {"id": "profile_incomplete", "type": "profile_incomplete", "data": {"coaches": entries}}


def _refuse(code: str, message: str):
    abort(make_response(jsonify({"code": code, "message": message}), 409))


_MISSING_WORDS = {
    "pt": {"level": "nível", "side": "lado"},
    "en": {"level": "level", "side": "side"},
}


def _reminder_text(missing: List[str], locale: str) -> str:
    words = ", ".join(_MISSING_WORDS[locale][m] for m in missing)
    if locale == "pt":
        return f"Olá treinador, o meu perfil ainda não está completo (falta: {words})."
    return f"Hi coach, my profile isn't complete yet (missing: {words})."


def send_profile_reminder(*, player, coach_id: int, now_utc=None):
    """Rule 6. Returns the message written. Refusals abort with 404 / 409 and write nothing."""
    from padel_app.models import Message
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    from padel_app.services.messaging_service import _is_blocked_either_way

    now_utc = now_utc or utcnow_naive()
    # 6a: the caller's OWN link to that coach; the player is always the caller. A disabled
    # coach is treated as no link at all (rule 1).
    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).first()
    if cp is None or cp.coach is None or cp.coach.user is None or cp.coach.user.status == "disabled":
        abort(404, "Not one of your coaches")
    coach_user = cp.coach.user
    if not missing_of(cp):
        _refuse("profile_complete", "Your profile is already complete")
    # 6e: messaging's block check, either way. Generic code: a block is not readable from it.
    if _is_blocked_either_way(player.user_id, coach_user.id):
        _refuse("cannot_remind", "This reminder cannot be sent")

    # The direct conversation first: its helper commits, which would release the lock below.
    conv = _get_or_create_direct_conversation(coach_user.id, player.user_id)

    # 6c, atomic: lock the link row, then check and write in one transaction. A second request
    # at the same time waits here, then finds the first reminder (#523 review).
    cp = (
        Association_CoachPlayer.query
        .filter_by(coach_id=coach_id, player_id=player.id)
        .with_for_update()
        .first()
    )
    missing = missing_of(cp)
    if not missing:
        db.session.rollback()
        _refuse("profile_complete", "Your profile is already complete")
    if _reminded_today(player.user_id, coach_id, now_utc):
        db.session.rollback()
        _refuse("already_reminded", "You already reminded this coach today")

    locale = "pt" if (getattr(coach_user, "language", None) or "pt") == "pt" else "en"
    text = _reminder_text(missing, locale)
    msg = Message(
        text=text,
        sender_id=player.user_id,
        conversation_id=conv.id,
        message_type="profile_reminder",
        msg_metadata={"profileReminder": {"coachId": coach_id, "missing": missing}},
        sent_at=now_utc,
    )
    msg.create()  # commits: the reminder is written and the lock released together

    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    title = player.user.name if player.user else ("Aluno" if locale == "pt" else "Student")
    _push_to_coach(coach_user.id, title, text, conv.id, msg.id)
    return msg


def _push_to_coach(coach_user_id: int, title: str, text: str, conversation_id: int, message_id: int) -> None:
    """The normal message push, web and Expo (rule 6d)."""
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.utils.push_notifications import send_push_notification

    send_push_notification(user_id=coach_user_id, title=title, body=text[:100],
                           url=f"/messages/{conversation_id}?message={message_id}")
    send_expo_push_to_user(coach_user_id, title=title, body=text[:100],
                           data={"type": "message", "conversationId": conversation_id, "messageId": message_id})
