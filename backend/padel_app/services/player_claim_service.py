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
import unicodedata

from flask import abort
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from padel_app.services.level_service import set_roster_level
from padel_app.models import (
    Association_CoachPlayer,
    Association_PlayerClub,
    Association_PlayerLesson,
    BlockedUser,
    CalendarBlock,
    Coach,
    CoachPlayerNote,
    Conversation,
    ConversationParticipant,
    DeviceToken,
    EvaluationEntry,
    EvaluationRecord,
    EvaluationShare,
    Message,
    MessageReaction,
    MessageReport,
    NotificationEvent,
    ReminderAttempt,
    Player,
    PlayerClaimRequest,
    PlayerMerge,
    ClassRequest,
    ClassJoinRequest,
    NotificationConfig,
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
    "waiting_list_entries",
    "standing_waiting_list_entries",
    "presences",
    "player_level_history",
    "notification_events",
    "vacancies",
    "replacement_approval_prompts",
    "player_invitations",
    "player_claim_requests",
    "class_requests",
    "class_join_requests",
    "player_merges",  # rule 5i (PAD-528): target_player_id of earlier merges
})

# B-361 (PAD-528): rows that hang off the coach relation, not off players.id. The
# players.id guard above never saw them, and the merge used to cascade them away
# with the placeholder's relation when the claimant already had the coach.
MERGED_RELATION_FK_TABLES = frozenset({
    "evaluation_records",
    "evaluation_entries",
    "coach_player_notes",
})

ALREADY_ACTIVATED = "ALREADY_ACTIVATED"

# PAD-528 review (#563): every unique constraint or unique index on a table the merge
# writes, and how the merge keeps it. B-361's guards covered FKs, not uniques, and two
# uniques 500'd the merge. ``test_every_unique_key_the_merge_touches_is_accounted_for``
# fails when one appears that is in neither map. Keyed "<table>.<name or columns>".
MERGE_UNIQUE_KEYS_HANDLED = {
    "coach_in_player.uq_coach_player": "rule 5a: the claimant's relation is kept, children move (B-361)",
    "player_in_club.uq_player_club": "_repoint_unique_pairs on club_id: the claimant's row is kept",
    "player_in_lesson.uq_player_lesson": "_repoint_unique_pairs on lesson_id",
    "waiting_list_entries.uq_waiting_session_player": "_repoint_unique_pairs on lesson_instance_id",
    "standing_waiting_list_entries.uq_standing_entries_active_coach_player":
        "_merge_standing_entries: both active with one coach → the claimant's stays active, the placeholder's moves inactive",
    "presences.uq_presence_player_lesson_instance": "_repoint_unique_pairs on lesson_instance_id (R-018)",
    "vacancies.uq_vacancies_open_original_player":
        "_repoint_vacancies: both open on one occurrence → the placeholder's keeps its spot with original_player_id NULL",
    "class_join_requests.uq_class_join_request_pending": "_repoint_unique_pairs on lesson_instance_id",
    "evaluation_records.uq_evaluation_records_class_day": "_merge_relation_children: same (day, class) merges into the kept record",
    "evaluation_records.uq_evaluation_records_classless_day": "_merge_relation_children: same day merges into the kept record",
    "evaluation_entries.uq_evaluation_entries_record_category": "_merge_relation_children: a rated category stays as history",
    "evaluation_shares.uq_evaluation_shares_record_id": "_merge_relation_children: the kept record's share wins",
    "conversation_participants.uq_conversation_participant": "_merge_conversations: a shared thread drops the placeholder's seat",
    "conversations.participant_key": "_merge_conversations: a colliding key folds into the existing thread",
    "message_reactions.uq_reaction": "_repoint_user_unique on (message_id, emoji)",
    "blocked_users.uq_blocked_user": "_repoint_user_unique both ways; a self-block is deleted",
    "push_subscriptions.user_id": "_repoint_user_unique: the claimant's subscription is kept",
    "device_tokens.uq_device_tokens_user_token": "_repoint_user_unique on token",
}
MERGE_UNIQUE_KEYS_IMPOSSIBLE = {
    "player_claim_requests.uq_player_claim_request_pending":
        "the placeholder's pending request is marked accepted before it is re-pointed, and a claimant "
        "(never claimable) has no pending request of its own",
    "player_invitations.token_hash": "the merge never writes token_hash",
    "replacement_approval_prompts.vacancy_id": "the merge never writes vacancy_id",
    "notification_configs.coach_id": "the merge never writes coach_id",
}


class MergeCounts:
    """Rule 5j: what a merge moves, drops and merges, per table. The same object is
    filled by the dry run and by the real merge, so the two can never disagree."""

    def __init__(self):
        self.moves, self.dropped, self.merged = {}, {}, {}

    def _bump(self, bucket, table, n=1):
        if n:
            bucket[table] = bucket.get(table, 0) + int(n)

    def move(self, table, n=1):
        self._bump(self.moves, table, n)

    def drop(self, table, n=1):
        self._bump(self.dropped, table, n)

    def merge(self, table, n=1):
        self._bump(self.merged, table, n)

    def as_dict(self):
        return {"moves": dict(self.moves), "dropped": dict(self.dropped), "merged": dict(self.merged)}


def normalise_name(name):
    """Rule 4c: casefold, accents stripped, whitespace collapsed."""
    if not name:
        return ""
    stripped = "".join(
        ch for ch in unicodedata.normalize("NFKD", str(name)) if not unicodedata.combining(ch)
    )
    return " ".join(stripped.casefold().split())


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

def _repoint_unique_pairs(model, key_attr, placeholder_id, claimant_id, counts=None):
    """Re-point ``model.player_id`` rows, deleting the placeholder's where the
    claimant already has a row with the same ``key_attr`` value."""
    counts = counts or MergeCounts()
    table = model.__tablename__
    existing = {
        getattr(row, key_attr)
        for row in model.query.filter_by(player_id=claimant_id).all()
    }
    for row in model.query.filter_by(player_id=placeholder_id).all():
        if getattr(row, key_attr) in existing:
            db.session.delete(row)
            counts.drop(table)
        else:
            row.player_id = claimant_id
            existing.add(getattr(row, key_attr))
            counts.move(table)
    db.session.flush()


def _merge_coach_relations(placeholder_id, claimant_id, counts=None):
    """Rule 5a: keep the claimant's relation with a coach they already have,
    borrowing level/side/notes from the placeholder's where the claimant's are
    null; otherwise re-point the placeholder's relation."""
    counts = counts or MergeCounts()
    claimant_rels = {
        rel.coach_id: rel
        for rel in Association_CoachPlayer.query.filter_by(player_id=claimant_id).all()
    }
    for rel in Association_CoachPlayer.query.filter_by(player_id=placeholder_id).all():
        mine = claimant_rels.get(rel.coach_id)
        if mine is None:
            rel.player_id = claimant_id
            claimant_rels[rel.coach_id] = rel
            counts.move("coach_in_player")
            continue
        counts.merge("coach_in_player")
        if mine.level_id is None and rel.level_id is not None:
            # PAD-270 (B-061): a borrowed level is an assignment; record it.
            set_roster_level(mine, rel.level_id)
        if mine.side is None:
            mine.side = rel.side
        if not mine.notes:
            mine.notes = rel.notes
        # B-361: evaluations and notes hang off the relation; move them before it goes.
        _merge_relation_children(rel, mine, counts)
        db.session.expire(rel)
        db.session.delete(rel)
    db.session.flush()


def _merge_relation_children(dropped, kept, counts=None):
    """Rule 5a (B-361, PAD-528): nothing that hangs off the dropped coach relation is
    lost. Notes re-point. Evaluation records re-point, except where the kept relation
    already holds a record for the same (day, class): then the dropped record's
    ratings join the kept record for categories it has not rated, stay as history
    (``record_id`` NULL) for categories it has, its note is appended to the kept
    record's note, its share follows unless the kept record is already shared, and
    the emptied record is deleted. Every rating ends up on the kept relation."""
    counts = counts or MergeCounts()
    from_id, to_id = dropped.id, kept.id
    counts.move("coach_player_notes", CoachPlayerNote.query.filter_by(coach_player_id=from_id).update(
        {"coach_player_id": to_id}, synchronize_session=False
    ))
    twins = {
        (r.evaluated_on, r.lesson_instance_id): r
        for r in EvaluationRecord.query.filter_by(coach_player_id=to_id).all()
    }
    for rec in EvaluationRecord.query.filter_by(coach_player_id=from_id).all():
        twin = twins.get((rec.evaluated_on, rec.lesson_instance_id))
        if twin is None:
            rec.coach_player_id = to_id
            twins[(rec.evaluated_on, rec.lesson_instance_id)] = rec
            counts.move("evaluation_records")
            continue
        counts.merge("evaluation_records")
        rated = {
            e.category_id for e in EvaluationEntry.query.filter_by(record_id=twin.id).all()
        }
        for entry in EvaluationEntry.query.filter_by(record_id=rec.id).all():
            if entry.category_id in rated:
                entry.record_id = None          # history, as the record's own earlier scores are
            else:
                entry.record_id = twin.id
                rated.add(entry.category_id)
        if rec.note:
            twin.note = f"{twin.note}\n\n{rec.note}" if twin.note else rec.note
        share = EvaluationShare.query.filter_by(record_id=rec.id).first()
        if share is not None:
            if EvaluationShare.query.filter_by(record_id=twin.id).first() is None:
                share.record_id = twin.id
            else:
                db.session.delete(share)
        db.session.flush()
        # Bulk delete: nothing points at the record any more, and the ORM cascade
        # must not see a stale ``entries`` collection.
        EvaluationRecord.query.filter_by(id=rec.id).delete(synchronize_session=False)
        db.session.expunge(rec)
    db.session.flush()
    counts.move("evaluation_entries", EvaluationEntry.query.filter_by(coach_player_id=from_id).update(
        {"coach_player_id": to_id}, synchronize_session=False
    ))
    db.session.flush()


def _merge_conversations(placeholder_user_id, claimant_user_id, counts=None):
    """Rule 5e: the placeholder's conversations become the claimant's; when the
    claimant already has a conversation with the same participants, the
    placeholder's messages and reactions move into it and the empty one goes."""
    counts = counts or MergeCounts()
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
            counts.move("conversations")
            db.session.flush()
            continue

        # Merge conv INTO surviving.
        counts.merge("conversations")
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


def _merge_rows(placeholder_player, claimant_user, counts):
    """Rule 5, a–h, flushed but never committed. Fills ``counts`` (rule 5j).
    The dry run calls this inside a savepoint it rolls back; the merge calls it
    and commits. Returns (claimant_player, placeholder_user)."""
    if placeholder_player is None or not is_claimable(placeholder_player):
        abort(409, ALREADY_ACTIVATED)
    _require_claimant(claimant_user)
    claimant_player = claimant_user.player
    placeholder_user = placeholder_player.user
    if placeholder_user.id == claimant_user.id or placeholder_player.id == claimant_player.id:
        abort(409, "A player cannot claim itself")

    pid, cid = placeholder_player.id, claimant_player.id
    puid, cuid = placeholder_user.id, claimant_user.id

    # a. coach relations and club membership
    _merge_coach_relations(pid, cid, counts)
    _repoint_unique_pairs(Association_PlayerClub, "club_id", pid, cid, counts)

    # b. enrolments and waiting lists
    _repoint_unique_pairs(Association_PlayerLesson, "lesson_id", pid, cid, counts)
    _repoint_unique_pairs(WaitingListEntry, "lesson_instance_id", pid, cid, counts)
    # PAD-131: one pending join request per (class, player) — same rule
    _repoint_unique_pairs(ClassJoinRequest, "lesson_instance_id", pid, cid, counts)
    _merge_standing_entries(pid, cid, counts)

    # c. presences — unique per instance (R-018): keep the claimant's row
    _repoint_unique_pairs(Presence, "lesson_instance_id", pid, cid, counts)

    # d. plain re-points
    counts.move("player_level_history", PlayerLevelHistory.query.filter_by(player_id=pid).update({"player_id": cid}))
    counts.move("class_requests", ClassRequest.query.filter_by(player_id=pid).update({"player_id": cid}))  # PAD-104
    counts.move("notification_events", NotificationEvent.query.filter_by(player_id=pid).update({"player_id": cid}))
    counts.move("reminder_attempts", ReminderAttempt.query.filter_by(player_id=pid).update({"player_id": cid}))
    _repoint_vacancies(pid, cid, counts)
    counts.move("vacancies", Vacancy.query.filter_by(filled_by_player_id=pid).update({"filled_by_player_id": cid}))
    counts.move("replacement_approval_prompts", ReplacementApprovalPrompt.query.filter_by(declined_player_id=pid).update({"declined_player_id": cid}))
    counts.move("replacement_approval_prompts", ReplacementApprovalPrompt.query.filter_by(waiting_list_player_id=pid).update({"waiting_list_player_id": cid}))
    for inv in PlayerInvitation.query.filter_by(player_id=pid).all():
        inv.player_id = cid
        if inv.status == "pending":
            inv.status = "accepted"
        counts.move("player_invitations")
    for req in PlayerClaimRequest.query.filter_by(player_id=pid).all():
        req.player_id = cid
        if req.status == "pending":
            req.status = "accepted"
            req.decided_at = utcnow_naive()
        counts.move("player_claim_requests")
    counts.move("player_merges", PlayerMerge.query.filter_by(target_player_id=pid).update({"target_player_id": cid}))
    db.session.flush()

    # e. the placeholder user's rows
    _merge_conversations(puid, cuid, counts)
    counts.move("messages", Message.query.filter_by(sender_id=puid).update({"sender_id": cuid}))
    counts.move("calendar_blocks", CalendarBlock.query.filter_by(user_id=puid).update({"user_id": cuid}))
    counts.move("message_reports", MessageReport.query.filter_by(reporter_id=puid).update({"reporter_id": cuid}))
    _repoint_user_unique(PushSubscription, "user_id", (), puid, cuid, counts)
    _repoint_user_unique(DeviceToken, "user_id", ("token",), puid, cuid, counts)
    # Reactions and blocks carry unique pairs — re-point, dropping duplicates.
    _repoint_user_unique(MessageReaction, "user_id", ("message_id", "emoji"), puid, cuid, counts)
    _repoint_user_unique(BlockedUser, "blocker_id", ("blocked_id",), puid, cuid, counts)
    _repoint_user_unique(BlockedUser, "blocked_id", ("blocker_id",), puid, cuid, counts)
    BlockedUser.query.filter(
        (BlockedUser.blocker_id == cuid) & (BlockedUser.blocked_id == cuid)
    ).delete(synchronize_session=False)
    db.session.flush()

    # h. soft references (PAD-528): JSON lists of player ids with no FK
    _repoint_soft_references(pid, cid, counts)

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
    return claimant_player, placeholder_user


def _merge_standing_entries(pid, cid, counts):
    """Rule 5b, PAD-528 review: one ACTIVE standing entry per (coach, player). When both
    hold an active one with the same coach, the claimant's stays active; the placeholder's
    moves to the claimant as inactive (its credits stay readable as history). Inactive
    rows always move."""
    active = {
        e.coach_id
        for e in StandingWaitingListEntry.query.filter_by(player_id=cid, is_active=True).all()
    }
    for entry in StandingWaitingListEntry.query.filter_by(player_id=pid).all():
        if entry.is_active and entry.coach_id in active:
            entry.is_active = False
            counts.drop("standing_waiting_list_entries")
        else:
            counts.move("standing_waiting_list_entries")
            if entry.is_active:
                active.add(entry.coach_id)
        entry.player_id = cid
    db.session.flush()


def _repoint_vacancies(pid, cid, counts):
    """Rule 5d, PAD-528 review: one OPEN vacancy per (occurrence, original player). When
    both left the same occurrence, both spots stay open; the placeholder's keeps its spot
    with ``original_player_id`` NULL — what deleting the player would do (FK SET NULL)."""
    open_for_claimant = {
        v.lesson_instance_id
        for v in Vacancy.query.filter_by(original_player_id=cid, status="open").all()
    }
    for vac in Vacancy.query.filter_by(original_player_id=pid).all():
        if vac.status == "open" and vac.lesson_instance_id in open_for_claimant:
            vac.original_player_id = None
            counts.merge("vacancies")
        else:
            vac.original_player_id = cid
            counts.move("vacancies")
    db.session.flush()


def _repoint_soft_references(pid, cid, counts):
    """Rule 5h: ``NotificationConfig.excluded_player_ids`` (strings) and
    ``ClassRequest.invitee_player_ids`` (ints or strings) name players without a
    FK. The placeholder's id becomes the claimant's, once per list."""
    for cfg in NotificationConfig.query.all():
        ids = [str(i) for i in (cfg.excluded_player_ids or [])]
        if str(pid) not in ids:
            continue
        out = []
        for i in ids:
            i = str(cid) if i == str(pid) else i
            if i not in out:
                out.append(i)
        cfg.excluded_player_ids = out
        counts.move("notification_configs")
    for req in ClassRequest.query.filter(ClassRequest.invitee_player_ids.isnot(None)).all():
        ids = list(req.invitee_player_ids or [])
        if not any(int(i) == pid for i in ids):
            continue
        out = []
        for i in ids:
            v = cid if int(i) == pid else int(i)
            if v not in out:
                out.append(v)
        req.invitee_player_ids = out
        counts.move("class_requests_invitees")
    db.session.flush()


def merge_placeholder_player_into(placeholder_player, claimant_user, *, trigger="coach_request",
                                  confirmed_by=None, requested_by_coach_id=None):
    """Rule 5, a–i, in one transaction, with the audit row (5i). Returns the
    claimant's Player.

    Raises 409 ALREADY_ACTIVATED when the placeholder is not claimable and 403
    when the claimant is not an active student account.
    """
    counts = MergeCounts()
    placeholder_id = placeholder_player.id if placeholder_player is not None else None
    try:
        claimant_player, placeholder_user = _merge_rows(placeholder_player, claimant_user, counts)
        db.session.add(PlayerMerge(
            placeholder_player_id=placeholder_id,
            placeholder_user_id=placeholder_user.id,
            target_player_id=claimant_player.id,
            target_user_id=claimant_user.id,
            requested_by_coach_id=requested_by_coach_id,
            confirmed_by_user_id=(confirmed_by or claimant_user).id,
            trigger=trigger,
            counts=counts.as_dict(),
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return claimant_player


def preview_merge(placeholder_player, claimant_user):
    """Rule 5j: the merge's plan as ``{moves, dropped, merged}`` without running
    it. The same ``_merge_rows`` runs inside a savepoint that is rolled back, so
    the counts are exactly what the merge would then write to ``player_merges``.
    Raises what the merge would raise (409, 403)."""
    counts = MergeCounts()
    nested = db.session.begin_nested()
    try:
        _merge_rows(placeholder_player, claimant_user, counts)
    finally:
        nested.rollback()
        db.session.expire_all()
    return counts.as_dict()


def _repoint_user_unique(model, user_attr, other_attrs, from_id, to_id, counts=None):
    counts = counts or MergeCounts()
    existing = {
        tuple(getattr(r, a) for a in other_attrs)
        for r in model.query.filter(getattr(model, user_attr) == to_id).all()
    }
    for row in model.query.filter(getattr(model, user_attr) == from_id).all():
        key = tuple(getattr(row, a) for a in other_attrs)
        if key in existing:
            db.session.delete(row)
            counts.drop(model.__tablename__)
        else:
            setattr(row, user_attr, to_id)
            existing.add(key)
            counts.move(model.__tablename__)
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


def claim_consent_required(coach, placeholder_player, target_user):
    """Rule 4d (PAD-528): whether the student must accept before the merge runs.
    One function, so the owner's decision on a same-roster target (option B) is
    a one-line change here and nowhere else. Today: always."""
    return True


def _candidate_rows(coach, placeholder_player):
    """Rule 4b: the coach's students who could be the placeholder's real account —
    on this coach's roster, not claimable themselves, not the placeholder."""
    rows = (
        Association_CoachPlayer.query.options(
            joinedload(Association_CoachPlayer.player).joinedload(Player.user),
            joinedload(Association_CoachPlayer.level),
        )
        .filter_by(coach_id=coach.id)
        .all()
    )
    out = []
    for rel in rows:
        player = rel.player
        user = player.user if player else None
        if player is None or user is None or player.id == placeholder_player.id:
            continue
        if user.status != "active" or is_claimable(player) or user.coach is not None:
            continue
        out.append(rel)
    return out


def list_claim_candidates_service(player_id, coach, search=None, limit=50):
    player = Player.query.get_or_404(player_id)
    if _coach_relation(coach, player.id) is None:
        abort(403, "This player is not on your roster")
    wanted = normalise_name(player.user.name if player.user else "")
    term = normalise_name(search) if search else ""
    items = []
    for rel in _candidate_rows(coach, player):
        name = rel.player.user.name or ""
        norm = normalise_name(name)
        if term and term not in norm:
            continue
        items.append({
            "playerId": rel.player_id,
            "name": name,
            "levelLabel": rel.level.label if rel.level is not None else None,
            "sameName": bool(wanted) and norm == wanted,
        })
    items.sort(key=lambda it: (not it["sameName"], normalise_name(it["name"]), it["playerId"]))
    return items[:limit]


def _resolve_target_by_pick(coach, placeholder_player, target_player_id):
    """Rule 4b: the pick must be one of the roster candidates — 404 otherwise."""
    try:
        wanted = int(target_player_id)
    except (TypeError, ValueError):
        abort(404, "No such student on your roster")
    for rel in _candidate_rows(coach, placeholder_player):
        if rel.player_id == wanted:
            return rel.player.user
    abort(404, "No such student on your roster")


def create_claim_request_service(player_id, coach, username=None, target_player_id=None):
    player = Player.query.get_or_404(player_id)
    if _coach_relation(coach, player.id) is None:
        abort(403, "This player is not on your roster")
    if not is_claimable(player):
        abort(409, ALREADY_ACTIVATED)
    if target_player_id is not None:
        target = _resolve_target_by_pick(coach, player, target_player_id)
    else:
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
    if claim_consent_required(coach, player, target):
        db.session.commit()
    else:
        # Rule 4d, option B: the request and the merge are ONE commit (the merge's);
        # a failed merge leaves no request behind. The merge marks it accepted (5d).
        db.session.flush()
        request_id = req.id
        merge_placeholder_player_into(
            player, target, trigger="coach_request",
            confirmed_by=coach.user, requested_by_coach_id=coach.id,
        )
        return PlayerClaimRequest.query.get(request_id)
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
        merge_placeholder_player_into(   # marks the request accepted
            req.player, user, trigger="coach_request",
            confirmed_by=user, requested_by_coach_id=req.requested_by_coach_id,
        )
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


def preview_claim_request_service(request_id, user):
    """Rule 5j, the student's side: the plan of the pending request targeting them."""
    req = _get_pending(request_id)
    if user is None or req.target_user_id != user.id:
        abort(403, "Only the invited account can preview this request")
    return preview_merge(req.player, user)


def preview_merge_for_coach_service(player_id, coach, target_player_id):
    """Rule 5j, the coach's side: the plan before the request is sent."""
    player = Player.query.get_or_404(player_id)
    if _coach_relation(coach, player.id) is None:
        abort(403, "This player is not on your roster")
    if not is_claimable(player):
        abort(409, ALREADY_ACTIVATED)
    target = _resolve_target_by_pick(coach, player, target_player_id)
    return preview_merge(player, target)


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
