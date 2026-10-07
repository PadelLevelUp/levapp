"""
Semi-automatic replacement approval service.

In semi-automatic mode (`NotificationConfig.invitation_mode == "semi_automatic"`)
the invitation engine asks the coach for approval before sending replacement
invitations. Each vacancy gets a ReplacementApprovalPrompt showing who declined
and the FULL ordered invite queue; prompts created in one shot (e.g. one
confirm-presences call) share a bundle_id and are delivered as ONE message in
the coach's Assistant conversation. The bundle is the unit of decision.

Public API
----------
- get_or_create_assistant_user()
- compute_full_invite_queue(vacancy, instance, coach_id, config)
- create_approval_prompts(vacancies, instance, coach_id, config, *, now=None)
- respond_to_approval(bundle_id, action, coach_id, *, now=None)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from padel_app.models import Vacancy
from padel_app.sql_db import db
from padel_app.realtime import publish
from padel_app.services.conversation_access import message_recipient_ids
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive
from padel_app.utils.push_notifications import send_push_notification

ASSISTANT_USERNAME = "levelup-assistant"
ASSISTANT_NAME = "LevelUp Assistant"

VALID_ACTIONS = ("yes_now", "yes_at_window", "dismiss")


# ---------------------------------------------------------------------------
# Assistant user / conversation helpers
# ---------------------------------------------------------------------------

def get_or_create_assistant_user():
    """Dedicated system user that owns the Assistant conversations.

    MUST stay status="disabled" so GET /api/app/users (which filters
    status="active") never lists it.
    """
    from padel_app.models import User

    user = User.query.filter_by(username=ASSISTANT_USERNAME).first()
    if user is None:
        user = User(
            name=ASSISTANT_NAME,
            username=ASSISTANT_USERNAME,
            status="disabled",
            password=None,
        )
        db.session.add(user)
        # flush (not commit) so the user is created in the SAME transaction as
        # the prompts/conversation/message — the caller owns the commit, keeping
        # the whole bundle atomic (no orphaned prompts if a later step fails).
        db.session.flush()
    return user


def _get_or_create_assistant_conversation(coach_user_id: int):
    """Return (conversation, assistant_user) for the coach's Assistant
    conversation, creating both atomically when missing."""
    from padel_app.models import Conversation

    assistant = get_or_create_assistant_user()
    # PAD-411: race-safe; flush only — the caller (create_approval_prompts) commits once at
    # the end so prompts + conversation + message persist atomically.
    conv = Conversation.get_or_insert([assistant.id, coach_user_id])
    return conv, assistant


# ---------------------------------------------------------------------------
# Invite queue snapshot
# ---------------------------------------------------------------------------

def compute_full_invite_queue(vacancy, instance, coach_id: int, config) -> list[dict]:
    """
    Full ordered invite queue for a vacancy: all eligible candidates across
    ALL rounds/groups, in the exact order the engine would invite them,
    deduplicated by player (first occurrence wins).

    Exactness principle: this list is exactly the set of players who may
    receive invitations for this vacancy (eligibility is recomputed at send
    time with the same rules).
    """
    # PAD-196: the waves, their order and the dedupe live in
    # `ordered_invite_rounds` — the same function the "Understand invites"
    # simulation reads, so the prompt and the tutorial are one list
    # (notifications.invite-simulation rule 5).
    from padel_app.services.notification_service import (
        _serialize_cp_for_group,
        _waiting_list_candidates,
        ordered_invite_rounds,
    )

    # PAD-446 (semi-auto-approval rule 5): the waiting list is group 0 and heads the queue; their
    # offer keeps them out of every later round, so they are listed once, here.
    queue: list[dict] = [
        {**_serialize_cp_for_group(cp), "roundNumber": 0, "fromWaitingList": True}
        for _entry, cp in _waiting_list_candidates(vacancy, instance, coach_id, config, dry_run=True)
    ]
    asked_first = {int(row["id"]) for row in queue}
    for number, _kind, _rules, cps in ordered_invite_rounds(
        vacancy, instance, coach_id, config
    ):
        for cp in cps:
            if cp.player_id not in asked_first:
                queue.append({**_serialize_cp_for_group(cp), "roundNumber": number})
    return queue


# ---------------------------------------------------------------------------
# Prompt creation
# ---------------------------------------------------------------------------

def _player_name(player_id: int | None) -> str | None:
    if not player_id:
        return None
    from padel_app.models import Player

    player = Player.query.get(player_id)
    return player.user.name if player and player.user else None


def _build_prompt_text(vacancies_payload: list[dict]) -> str:
    parts = []
    for v in vacancies_payload:
        declined = v.get("declinedPlayerName") or "A player"
        queue_names = ", ".join(e["name"] for e in v.get("queue", []))
        part = f"{declined} dropped out."
        if queue_names:
            part += f" Invite queue: {queue_names}."
        else:
            part += " No eligible replacements found."
        # PAD-446: nobody is added directly any more; the waiting list heads the queue above.
        parts.append(part)
    parts.append("Send replacement invitations?")
    return " ".join(parts)


def create_approval_prompts(
    vacancies: list,
    instance,
    coach_id: int,
    config,
    *,
    now: datetime | None = None,
) -> dict | None:
    """
    Create one ReplacementApprovalPrompt per vacancy (idempotent — vacancies
    that already have a prompt are skipped) sharing a single bundle_id, and
    persist the bundle as ONE message in the coach's Assistant conversation.

    Returns the serialized bundle dict (same shape as the message
    msg_metadata), or the existing bundle when nothing new was created.
    """
    from padel_app.models import Coach, Message
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.scheduler import _compute_invite_start_dt
    from padel_app.serializers.message import serialize_message

    existing_prompts = []
    new_vacancies = []
    for vacancy in vacancies:
        prompt = ReplacementApprovalPrompt.query.filter_by(
            vacancy_id=vacancy.id
        ).first()
        if prompt is not None:
            existing_prompts.append(prompt)
        else:
            new_vacancies.append(vacancy)

    if not new_vacancies:
        # Idempotent: nothing new to ask — return the existing bundle.
        for prompt in existing_prompts:
            if prompt.message_id:
                msg = Message.query.get(prompt.message_id)
                if msg and msg.msg_metadata:
                    return msg.msg_metadata
        return None

    coach = Coach.query.get(coach_id)
    coach_user_id = coach.user_id if coach else None

    window_open_dt = _compute_invite_start_dt(
        instance, config.get_invitation_start_timing()
    )

    bundle_id = str(uuid.uuid4())
    prompts = []
    vacancies_payload = []
    for vacancy in new_vacancies:
        queue = compute_full_invite_queue(vacancy, instance, coach_id, config)

        # PAD-446 (rule 5): nobody is placed without an invitation any more; the waiting list is in
        # the queue (fromWaitingList). Null tells older builds "no disclosure".
        wl_player_id = None

        prompt = ReplacementApprovalPrompt(
            coach_id=coach_id,
            vacancy_id=vacancy.id,
            bundle_id=bundle_id,
            declined_player_id=vacancy.original_player_id,
            queue_snapshot=queue,
            waiting_list_player_id=wl_player_id,
            status="pending",
        )
        db.session.add(prompt)
        prompts.append(prompt)

        vacancies_payload.append({
            "vacancyId": vacancy.id,
            "declinedPlayerId": vacancy.original_player_id,
            "declinedPlayerName": _player_name(vacancy.original_player_id),
            "queue": queue,
            "waitingListPlayerId": wl_player_id,
            "waitingListPlayerName": _player_name(wl_player_id),
        })

    db.session.flush()
    return _post_bundle(bundle_id, instance, coach_user_id, window_open_dt, vacancies_payload, prompts)


def _post_bundle(bundle_id, instance, coach_user_id, window_open_dt, vacancies_payload, prompts) -> dict:
    """Persist ``vacancies_payload`` as ONE approval message in the coach's Assistant conversation
    (rule 6), point ``prompts`` at it, and commit: the prompts' writes and the message land in the
    caller's one commit. The push and the live event go out after it."""
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    bundle = {
        "bundleId": bundle_id,
        "lessonInstanceId": instance.id,
        # PAD-256: a UTC instant, sent on the club's wall clock like class times.
        "windowOpenAt": utc_to_wall_naive(window_open_dt).isoformat() if window_open_dt else None,
        "responded": False,
        "vacancies": vacancies_payload,
    }

    if coach_user_id:
        conv, assistant = _get_or_create_assistant_conversation(coach_user_id)
        text = _build_prompt_text(vacancies_payload)
        msg = Message(
            text=text,
            sender_id=assistant.id,
            conversation_id=conv.id,
            message_type="replacement_approval",
            msg_metadata=bundle,
        )
        db.session.add(msg)
        db.session.flush()
        for prompt in prompts:
            prompt.message_id = msg.id
        db.session.commit()

        # The assistant conversation holds the coach and the assistant user —
        # this prompt is addressed to them and nobody else (B-004).
        publish(
            {"type": "message_created", "payload": serialize_message(msg, None)},
            message_recipient_ids(msg),
        )
        # Push to the COACH (the recipient of the approval request)
        send_push_notification(
            user_id=coach_user_id,
            title="Replacement approval needed",
            body=text[:100],
            url=f"/messages/{conv.id}",
        )
    else:
        db.session.commit()

    return bundle


# ---------------------------------------------------------------------------
# Coach decision
# ---------------------------------------------------------------------------

def respond_to_approval(
    bundle_id: str,
    action: str,
    coach_id: int,
    *,
    now: datetime | None = None,
) -> dict:
    """
    Apply the coach's decision to every prompt in a bundle.

    action: "yes_now" | "yes_at_window" | "dismiss"

    Per-vacancy results: "approved_now" | "approved_at_window" | "dismissed"
    | "stale" (vacancy filled/expired or prompt already decided — no-op).
    """
    from flask import abort

    from padel_app.models import Message
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.scheduler import _compute_invite_start_dt
    from padel_app.serializers.message import serialize_message
    from padel_app.services.notification_service import (
        get_or_create_config,
        trigger_invitations,
    )

    if action not in VALID_ACTIONS:
        abort(400, "action must be one of: yes_now, yes_at_window, dismiss")

    prompts = ReplacementApprovalPrompt.query.filter_by(bundle_id=bundle_id).all()
    if not prompts:
        # PAD-545: a recompute moved this bundle's prompts to a newer bundle. The old message's
        # buttons decide nothing and say so (every vacancy "stale"), instead of a 404.
        superseded = _superseded_bundle(bundle_id, coach_id)
        if superseded is None:
            abort(404, "Approval bundle not found")
        return {"action": action, "vacancies": [
            {"vacancyId": v.get("vacancyId"), "result": "stale"} for v in superseded.get("vacancies", [])
        ]}
    if any(p.coach_id != coach_id for p in prompts):
        abort(403, "Not authorized")
    # One order for every multi-vacancy locker (recompute too): ascending vacancy id.
    prompts.sort(key=lambda p: p.vacancy_id or 0)

    _now = now or utcnow_naive()
    config = get_or_create_config(coach_id)

    results = []
    instances_to_trigger = {}
    for prompt in prompts:
        # PAD-545 (rule 12): the engine's one lock order starts with the vacancy. Lock it, then
        # re-read the prompt: a recompute that committed first moved the prompt to a newer bundle,
        # and this decision is then a no-op for it.
        vacancy = (
            Vacancy.query.filter_by(id=prompt.vacancy_id).with_for_update().populate_existing().first()
            if prompt.vacancy_id is not None else None
        )
        db.session.refresh(prompt)
        instance = vacancy.lesson_instance if vacancy else None
        if prompt.bundle_id != bundle_id:
            results.append({"vacancyId": prompt.vacancy_id, "result": "stale"})
            continue

        is_stale = (
            prompt.status != "pending"
            or vacancy is None
            or vacancy.status != "open"
            or instance is None
            or instance.start_datetime <= utc_to_wall_naive(_now)  # PAD-256: on the club's clock
        )
        if is_stale:
            # No-op decision; mark still-pending prompts whose vacancy closed.
            if prompt.status == "pending":
                prompt.status = "stale"
                prompt.decided_at = _now
            results.append({"vacancyId": prompt.vacancy_id, "result": "stale"})
            continue

        if action == "dismiss":
            # The engine never sends for this vacancy on its own, and the vacancy REMAINS OPEN for
            # the manual flow. PAD-545 (rule 12): the coach can bring it back only by recomputing
            # the suggestions from the class.
            vacancy.approval_status = "dismissed"
            prompt.status = "dismissed"
            prompt.decided_at = _now
            results.append({"vacancyId": vacancy.id, "result": "dismissed"})
            continue

        window_open_dt = _compute_invite_start_dt(
            instance, config.get_invitation_start_timing()
        )
        window_already_open = window_open_dt is None or _now >= window_open_dt

        if action == "yes_now" or (action == "yes_at_window" and window_already_open):
            # "Yes, at window" with the window already open executes as yes_now.
            vacancy.approval_status = "approved"
            prompt.status = "approved"
            prompt.decided_at = _now
            instances_to_trigger[instance.id] = instance
            results.append({"vacancyId": vacancy.id, "result": "approved_now"})
        else:  # yes_at_window, window not open yet
            vacancy.approval_status = "approved"
            vacancy.invite_not_before = window_open_dt
            prompt.status = "approved"
            prompt.decided_at = _now
            results.append({"vacancyId": vacancy.id, "result": "approved_at_window"})

    db.session.commit()

    # Mark the persisted assistant message as responded
    message_ids = {p.message_id for p in prompts if p.message_id}
    for message_id in message_ids:
        msg = Message.query.get(message_id)
        if msg and msg.msg_metadata is not None:
            msg.msg_metadata = {
                **msg.msg_metadata,
                "responded": True,
                "response": action,
                "decidedAt": _now.isoformat(),
            }
            msg.save()
            publish(
                {"type": "message_edited", "payload": serialize_message(msg, None)},
                message_recipient_ids(msg),
            )

    # Send invitations once per instance (not per vacancy)
    for instance in instances_to_trigger.values():
        trigger_invitations(instance, coach_id, now=now)

    return {"action": action, "vacancies": results}


# ---------------------------------------------------------------------------
# PAD-545 / PAD-542: the class's suggestions, and recomputing them
# ---------------------------------------------------------------------------

def _superseded_bundle(bundle_id: str, coach_id: int) -> dict | None:
    """The metadata of a bundle a recompute replaced, if this coach's Assistant conversation holds it."""
    from padel_app.models import Coach, Message

    coach = Coach.query.get(coach_id)
    if coach is None:
        return None
    conv, _assistant = _get_or_create_assistant_conversation(coach.user_id)
    for msg in Message.query.filter_by(conversation_id=conv.id, message_type="replacement_approval").all():
        if (msg.msg_metadata or {}).get("bundleId") == bundle_id:
            return msg.msg_metadata
    return None


def _coached_instance(instance_id: int, coach_id: int):
    from flask import abort

    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import coach_instance_ids

    instance = LessonInstance.query.get(instance_id)
    if instance is None:
        abort(404, "Class not found")
    if instance.id not in set(coach_instance_ids(coach_id)):
        abort(403, "Not authorized")
    return instance


def instance_suggestions(instance_id: int, coach_id: int) -> dict:
    """What the class view shows about semi-automatic suggestions (rule 12).

    ``{"state": "pending", "bundle": {...}}`` — a decision is waiting (the newest pending bundle);
    ``{"state": "dismissed"}`` — the coach ignored them and can recompute;
    ``{"state": "none"}`` — nothing to suggest (no open vacancy awaiting a decision).
    """
    from padel_app.models import Message
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    instance = _coached_instance(instance_id, coach_id)
    vacancies = Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open").all()
    pending = [v for v in vacancies if v.approval_status == "pending"]
    if pending:
        prompts = (
            ReplacementApprovalPrompt.query
            .filter(ReplacementApprovalPrompt.vacancy_id.in_([v.id for v in pending]),
                    ReplacementApprovalPrompt.status == "pending")
            .order_by(ReplacementApprovalPrompt.id.desc())
            .all()
        )
        for prompt in prompts:
            msg = Message.query.get(prompt.message_id) if prompt.message_id else None
            if msg is not None and (msg.msg_metadata or {}).get("bundleId") == prompt.bundle_id:
                return {"state": "pending", "bundle": msg.msg_metadata}
    if any(v.approval_status == "dismissed" for v in vacancies):
        return {"state": "dismissed"}
    return {"state": "none"}


def recompute_suggestions(instance_id: int, coach_id: int, *, now: datetime | None = None) -> dict:
    """PAD-545 (rule 12): build the class's suggestions again from its state NOW, and ask again.

    Every open vacancy of the class still awaiting a decision (``pending``) or ignored by the coach
    (``dismissed``) is locked (the engine's lock order starts with the vacancy), set back to
    ``pending``, and its one prompt is moved to a NEW bundle with a freshly computed queue; one new
    message carries that bundle to the Assistant conversation. All of it is one commit. Nothing is
    sent: the coach decides on the new bundle. An older message's buttons then answer "stale"
    (``respond_to_approval``), so a list computed before cannot be approved.

    Returns ``{"state": "pending", "bundle": ...}``, or ``{"state": "none"}`` when no open vacancy
    awaits a decision.
    """
    from flask import abort

    from padel_app.models import Coach
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.scheduler import _compute_invite_start_dt
    from padel_app.services.notification_service import _instance_is_over, get_or_create_config

    instance = _coached_instance(instance_id, coach_id)
    _now = now or utcnow_naive()
    if _instance_is_over(instance, _now):
        abort(409, "The class is over")

    vacancies = (
        Vacancy.query
        .filter(Vacancy.lesson_instance_id == instance.id, Vacancy.status == "open",
                Vacancy.approval_status.in_(("pending", "dismissed")))
        .order_by(Vacancy.id.asc())
        .with_for_update()
        .populate_existing()
        .all()
    )
    if not vacancies:
        db.session.commit()  # release the locks; nothing was written
        return {"state": "none"}

    config = get_or_create_config(coach_id)
    coach = Coach.query.get(coach_id)
    window_open_dt = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
    bundle_id = str(uuid.uuid4())
    prompts, payload = [], []
    for vacancy in vacancies:
        vacancy.approval_status = "pending"
        queue = compute_full_invite_queue(vacancy, instance, coach_id, config)
        prompt = ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).first()
        if prompt is None:
            prompt = ReplacementApprovalPrompt(coach_id=coach_id, vacancy_id=vacancy.id,
                                               declined_player_id=vacancy.original_player_id)
            db.session.add(prompt)
        prompt.bundle_id = bundle_id
        prompt.status = "pending"
        prompt.decided_at = None
        prompt.queue_snapshot = queue
        prompt.waiting_list_player_id = None
        prompts.append(prompt)
        payload.append({
            "vacancyId": vacancy.id,
            "declinedPlayerId": vacancy.original_player_id,
            "declinedPlayerName": _player_name(vacancy.original_player_id),
            "queue": queue,
            "waitingListPlayerId": None,
            "waitingListPlayerName": None,
        })
    db.session.flush()
    bundle = _post_bundle(bundle_id, instance, coach.user_id if coach else None, window_open_dt, payload, prompts)
    return {"state": "pending", "bundle": bundle}
