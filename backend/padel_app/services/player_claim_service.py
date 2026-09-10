"""players.claim (PAD-213): fold a coach-created placeholder player into the
student's real account.

A coach-created player is a User with a generated ``pending-…`` username, no
password and ``status = inactive`` (players.create rule 4). When the same
human turns out to have registered on their own, the two must become one
person — every row that points at the placeholder is re-pointed at the real
account and the placeholder is retired — so the coach's level history,
attendance, notes, enrolments and chat thread survive.

Two triggers share ``merge_placeholder_player_into``:

* trigger A — the student opens the invite link while signed in
  (``player_invitation_service.claim_player_invitation_service``);
* trigger B — the coach asks by exact username and the student accepts
  (``create_claim_request_service`` / ``decide_claim_request_service`` here).

``MERGED_PLAYER_FK_TABLES`` is the contract: a test walks ``db.metadata`` for
every foreign key onto ``players.id`` and fails if one is missing here, so a
future ``players.id`` FK cannot silently orphan rows on merge.
"""
from flask import abort
from sqlalchemy import func

from padel_app.models import (
    Association_CoachPlayer,
    Association_PlayerClub,
    Association_PlayerLesson,
    Association_PlayerLessonInstance,
    BlockedUser,
    CalendarBlock,
    Coach,
    Conversation,
    ConversationParticipant,
    DeviceToken,
    Message,
    MessageReaction,
    MessageReport,
    NotificationEvent,
    ReminderAttempt,
    Player,
    PlayerClaimRequest,
    PlayerInvitation,
    PlayerLevelHistory,
    Presence,
    PushSubscription,
    ReplacementApprovalPrompt,
    StandingWaitingListEntry,
    User,
    Vacancy,
    WaitingListEntry,
)
from padel_app.sql_db import db
from padel_app.tools.username_tools import (
    is_placeholder_username,
    unique_placeholder_username,
)
from padel_app.utils.dates import utcnow_naive


#: Every table with a foreign key onto ``players.id`` that the merge handles.
#: ``test_player_claim_merge.py`` compares this against ``db.metadata``.
MERGED_PLAYER_FK_TABLES = frozenset({
    "reminder_attempts",  # notifications.reminders rule 14 (PAD-207)
    "coach_in_player",
    "player_in_club",
    "player_in_lesson",
    "player_in_lesson_instance",
    "waiting_list_entries",
    "standing_waiting_list_entries",
    "presences",
    "player_level_history",
    "notification_events",
    "vacancies",
    "replacement_approval_prompts",
    "player_invitations",
    "player_claim_requests",
})

ALREADY_ACTIVATED = "ALREADY_ACTIVATED"


# ── claimability ─────────────────────────────────────────────────────────────

def is_claimable(player):
    """True for a coach-created player whose account was never activated."""
    user = player.user if player else None
    if user is None:
        return False
    return (
        user.password is None
        and is_placeholder_username(user.username)
        and user.status == "inactive"
    )


def _require_claimant(user):
    """Rule 2: an active student account — has a Player, no Coach."""
    if user is None or user.coach is not None or user.player is None:
        abort(403, "Only a student account can claim a player record")
    if user.status != "active":
        abort(403, "Only an active account can claim a player record")


# ── the merge ────────────────────────────────────────────────────────────────

def _repoint_unique_pairs(model, key_attr, placeholder_id, claimant_id):
    """Re-point ``model.player_id`` rows, deleting the placeholder's where the
    claimant already has a row with the same ``key_attr`` value."""
    existing = {
        getattr(row, key_attr)
        for row in model.query.filter_by(player_id=claimant_id).all()
    }
    for row in model.query.filter_by(player_id=placeholder_id).all():
        if getattr(row, key_attr) in existing:
            db.session.delete(row)
        else:
            row.player_id = claimant_id
            existing.add(getattr(row, key_attr))
    db.session.flush()


def _merge_coach_relations(placeholder_id, claimant_id):
    """Rule 5a: keep the claimant's relation with a coach they already have,
    borrowing level/side/notes from the placeholder's where the claimant's are
    null; otherwise re-point the placeholder's relation."""
    claimant_rels = {
        rel.coach_id: rel
        for rel in Association_CoachPlayer.query.filter_by(player_id=claimant_id).all()
    }
    for rel in Association_CoachPlayer.query.filter_by(player_id=placeholder_id).all():
        mine = claimant_rels.get(rel.coach_id)
        if mine is None:
            rel.player_id = claimant_id
            claimant_rels[rel.coach_id] = rel
            continue
        if mine.level_id is None:
            mine.level_id = rel.level_id
        if mine.side is None:
            mine.side = rel.side
        if not mine.notes:
            mine.notes = rel.notes
        db.session.delete(rel)
    db.session.flush()


def _merge_conversations(placeholder_user_id, claimant_user_id):
    """Rule 5e: the placeholder's conversations become the claimant's; when the
    claimant already has a conversation with the same participants, the
    placeholder's messages and reactions move into it and the empty one goes."""
    rows = ConversationParticipant.query.filter_by(user_id=placeholder_user_id).all()
    for row in rows:
        conv = row.conversation
        other_ids = [p.user_id for p in conv.participants if p.user_id != placeholder_user_id]
        new_key = Conversation.build_participant_key(other_ids + [claimant_user_id])

        if claimant_user_id in other_ids:
            # The placeholder and the claimant were both in this thread (a
            # coach chatting with "both"). Drop the placeholder's seat; the key
            # is recomputed below.
            surviving = None
        else:
            surviving = (
                Conversation.query.filter(
                    Conversation.participant_key == new_key,
                    Conversation.id != conv.id,
                ).first()
            )

        if surviving is None:
            if claimant_user_id in other_ids:
                db.session.delete(row)
            else:
                row.user_id = claimant_user_id
            conv.participant_key = new_key
            db.session.flush()
            continue

        # Merge conv INTO surviving.
        for msg in Message.query.filter_by(conversation_id=conv.id).all():
            msg.conversation_id = surviving.id
        # Keep the earlier last_read_at for the claimant's seat.
        mine = next((p for p in surviving.participants if p.user_id == claimant_user_id), None)
        if mine is not None and row.last_read_at is not None:
            if mine.last_read_at is None or row.last_read_at < mine.last_read_at:
                mine.last_read_at = row.last_read_at
        db.session.flush()
        # Detach the emptied conversation: its participant rows go with it;
        # messages were re-pointed above so the cascade has nothing to delete.
        db.session.expire(conv, ["messages"])
        db.session.delete(conv)
        db.session.flush()
        _recompute_last_message(surviving)
    db.session.flush()


def _recompute_last_message(conversation):
    """PAD-204: the denormalised pointer must follow the moved messages."""
    newest = (
        Message.query.filter_by(conversation_id=conversation.id)
        .order_by(Message.sent_at.desc(), Message.id.desc())
        .first()
    )
    conversation.last_message_id = newest.id if newest else None
    conversation.last_message_at = newest.sent_at if newest else None


def merge_placeholder_player_into(placeholder_player, claimant_user):
    """Rule 5, a–g, in one transaction. Returns the claimant's Player.

    Raises 409 ALREADY_ACTIVATED when the placeholder is not claimable and 403
    when the claimant is not an active student account.
    """
    if placeholder_player is None or not is_claimable(placeholder_player):
        abort(409, ALREADY_ACTIVATED)
    _require_claimant(claimant_user)
    claimant_player = claimant_user.player
    placeholder_user = placeholder_player.user
    if placeholder_user.id == claimant_user.id or placeholder_player.id == claimant_player.id:
        abort(409, "A player cannot claim itself")

    pid, cid = placeholder_player.id, claimant_player.id
    puid, cuid = placeholder_user.id, claimant_user.id

    try:
        # a. coach relations and club membership
        _merge_coach_relations(pid, cid)
        _repoint_unique_pairs(Association_PlayerClub, "club_id", pid, cid)

        # b. enrolments and waiting lists
        _repoint_unique_pairs(Association_PlayerLesson, "lesson_id", pid, cid)
        _repoint_unique_pairs(Association_PlayerLessonInstance, "lesson_instance_id", pid, cid)
        _repoint_unique_pairs(WaitingListEntry, "lesson_instance_id", pid, cid)
        _repoint_unique_pairs(StandingWaitingListEntry, "id", pid, cid)  # never collides; plain re-point

        # c. presences — unique per instance (R-018): keep the claimant's row
        _repoint_unique_pairs(Presence, "lesson_instance_id", pid, cid)

        # d. plain re-points
        PlayerLevelHistory.query.filter_by(player_id=pid).update({"player_id": cid})
        NotificationEvent.query.filter_by(player_id=pid).update({"player_id": cid})
        ReminderAttempt.query.filter_by(player_id=pid).update({"player_id": cid})
        Vacancy.query.filter_by(original_player_id=pid).update({"original_player_id": cid})
        Vacancy.query.filter_by(filled_by_player_id=pid).update({"filled_by_player_id": cid})
        ReplacementApprovalPrompt.query.filter_by(declined_player_id=pid).update({"declined_player_id": cid})
        ReplacementApprovalPrompt.query.filter_by(waiting_list_player_id=pid).update({"waiting_list_player_id": cid})
        for inv in PlayerInvitation.query.filter_by(player_id=pid).all():
            inv.player_id = cid
            if inv.status == "pending":
                inv.status = "accepted"
        for req in PlayerClaimRequest.query.filter_by(player_id=pid).all():
            req.player_id = cid
            if req.status == "pending":
                req.status = "accepted"
                req.decided_at = utcnow_naive()
        db.session.flush()

        # e. the placeholder user's rows
        _merge_conversations(puid, cuid)
        Message.query.filter_by(sender_id=puid).update({"sender_id": cuid})
        CalendarBlock.query.filter_by(user_id=puid).update({"user_id": cuid})
        MessageReport.query.filter_by(reporter_id=puid).update({"reporter_id": cuid})
        PushSubscription.query.filter_by(user_id=puid).update({"user_id": cuid})
        for tok in DeviceToken.query.filter_by(user_id=puid).all():
            tok.user_id = cuid
        # Reactions and blocks carry unique pairs — re-point, dropping duplicates.
        _repoint_user_unique(MessageReaction, "user_id", ("message_id", "emoji"), puid, cuid)
        _repoint_user_unique(BlockedUser, "blocker_id", ("blocked_id",), puid, cuid)
        _repoint_user_unique(BlockedUser, "blocked_id", ("blocker_id",), puid, cuid)
        BlockedUser.query.filter(
            (BlockedUser.blocker_id == cuid) & (BlockedUser.blocked_id == cuid)
        ).delete(synchronize_session=False)
        db.session.flush()

        # f. retire the placeholder
        db.session.delete(placeholder_player)
        db.session.flush()
        placeholder_user.status = "disabled"
        placeholder_user.name = "Merged user"
        placeholder_user.email = None
        placeholder_user.phone = None
        placeholder_user.generated_code = None
        placeholder_user.user_image_id = None
        placeholder_user.username = unique_placeholder_username()
        db.session.flush()

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return claimant_player


def _repoint_user_unique(model, user_attr, other_attrs, from_id, to_id):
    existing = {
        tuple(getattr(r, a) for a in other_attrs)
        for r in model.query.filter(getattr(model, user_attr) == to_id).all()
    }
    for row in model.query.filter(getattr(model, user_attr) == from_id).all():
        key = tuple(getattr(row, a) for a in other_attrs)
        if key in existing:
            db.session.delete(row)
        else:
            setattr(row, user_attr, to_id)
            existing.add(key)
    db.session.flush()


# ── trigger B: coach-initiated claim requests ────────────────────────────────

def _resolve_target_student(username):
    if not username or not isinstance(username, str):
        abort(404, "No user with that username")
    user = (
        User.query.filter(func.lower(User.username) == username.strip().lower())
        .filter(User.status == "active")
        .first()
    )
    if user is None or user.player is None or user.coach is not None:
        abort(404, "No user with that username")
    return user


def _coach_relation(coach, player_id):
    if coach is None:
        abort(403, "Coach required")
    return Association_CoachPlayer.query.filter_by(coach_id=coach.id, player_id=player_id).first()


def create_claim_request_service(player_id, coach, username):
    player = Player.query.get_or_404(player_id)
    if _coach_relation(coach, player.id) is None:
        abort(403, "This player is not on your roster")
    if not is_claimable(player):
        abort(409, ALREADY_ACTIVATED)
    target = _resolve_target_student(username)
    if target.id == player.user_id:
        abort(404, "No user with that username")
    if PlayerClaimRequest.query.filter_by(player_id=player.id, status="pending").first():
        abort(409, "A link request is already pending for this player")

    req = PlayerClaimRequest(
        player_id=player.id,
        target_user_id=target.id,
        requested_by_coach_id=coach.id,
        status="pending",
    )
    db.session.add(req)
    db.session.commit()
    # PAD-232: the invited account hears about it — best-effort.
    from padel_app.services.request_alert_service import notify_request_event
    notify_request_event(
        "claim.received",
        [target],
        actor=coach.user.name if coach.user else "",
        player=player.user.name if player.user else "",
    )
    return req


def list_my_claim_requests_service(user):
    return (
        PlayerClaimRequest.query.filter_by(target_user_id=user.id, status="pending")
        .order_by(PlayerClaimRequest.id.asc())
        .all()
    )


def _get_pending(request_id):
    req = PlayerClaimRequest.query.get_or_404(request_id)
    if req.status != "pending":
        abort(410, f"Request is {req.status}")
    return req


def decide_claim_request_service(request_id, user, accept):
    req = _get_pending(request_id)
    if user is None or req.target_user_id != user.id:
        abort(403, "Only the invited account can decide this request")
    # PAD-232: capture what the coach must be told before the merge retires
    # the placeholder's name.
    coach_user = req.requested_by_coach.user if req.requested_by_coach else None
    placeholder_name = req.player.user.name if req.player and req.player.user else ""
    from padel_app.services.request_alert_service import notify_request_event
    if accept:
        merge_placeholder_player_into(req.player, user)   # marks the request accepted
        notify_request_event(
            "claim.decided", [coach_user], actor=user.name, player=placeholder_name,
            decision="approved",
        )
        return PlayerClaimRequest.query.get(request_id)
    req.status = "rejected"
    req.decided_at = utcnow_naive()
    db.session.commit()
    notify_request_event(
        "claim.decided", [coach_user], actor=user.name, player=placeholder_name,
        decision="rejected",
    )
    return req


def revoke_claim_request_service(request_id, coach):
    req = _get_pending(request_id)
    if coach is None or req.requested_by_coach_id != coach.id:
        abort(403, "Only the requesting coach can revoke this request")
    req.status = "revoked"
    req.decided_at = utcnow_naive()
    db.session.commit()
    return req


def serialize_claim_request(req):
    coach = req.requested_by_coach
    club = coach.current_club if coach else None
    player_user = req.player.user if req.player else None
    return {
        "id": req.id,
        "playerId": req.player_id,
        "placeholderName": player_user.name if player_user else None,
        "coachId": req.requested_by_coach_id,
        "coachName": coach.name if coach else None,
        "clubName": club.name if club else None,
        "status": req.status,
        "createdAt": req.created_at.isoformat() if getattr(req, "created_at", None) else None,
    }
