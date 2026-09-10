from padel_app.models import (
    Player,
    User,
    Association_CoachPlayer,
    PlayerLevelHistory,
)
from sqlalchemy.orm import joinedload
from sqlalchemy import func, case
from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.models.players import _is_claimable_user, _is_deletable_by_coach
from padel_app.tools.username_tools import unique_placeholder_username


# ---------------------------------------------------------------------------
# Moved from helpers/player_services.py
# ---------------------------------------------------------------------------

def create_player_helper(data):
    player = Player()
    player_form = player.get_create_form()

    user = User()
    user_form = user.get_create_form()

    user_fake_request = JsonRequestAdapter(data['user'], user_form)
    user_values = user_form.set_values(user_fake_request)

    user.update_with_dict(user_values)
    user.create()

    player_data = {'user': user.id}

    player_fake_request = JsonRequestAdapter(player_data, player_form)
    player_values = player_form.set_values(player_fake_request)

    player.update_with_dict(player_values)
    player.create()

    if data.get("coach"):
        rel_data = {
            'coach': data.get("coach"),
            'player': player.id,
            'level': data.get('level', None),
            'side': data.get('side', None),
            'notes': data.get('notes', None),
        }
        rel = Association_CoachPlayer()

        rel_form = rel.get_create_form()

        rel_fake_request = JsonRequestAdapter(rel_data, rel_form)
        rel_values = rel_form.set_values(rel_fake_request)

        rel.update_with_dict(rel_values)
        rel.create()

    if data.get("coach") and data['level']:
        PlayerLevelHistory(
            coach_id=data["coach"],
            player_id=player.id,
            level_id=data['level']
        ).create()

    return player.coach_player_info(data["coach"])


def edit_player_helper(player, rel, data):
    user_form = player.user.get_edit_form()
    user_fake_request = JsonRequestAdapter(data['user'], user_form)
    user_values = user_form.set_values(user_fake_request)

    player.user.update_with_dict(user_values)
    player.user.save()

    rel_form = rel.get_edit_form()
    rel_fake_request = JsonRequestAdapter(data['relation'], rel_form)
    rel_values = rel_form.set_values(rel_fake_request)

    rel.update_with_dict(rel_values)
    rel.save()

    return player.coach_player_info(data["coach"])


# ---------------------------------------------------------------------------
# Route-level service functions (extracted from frontend_api.py)
# ---------------------------------------------------------------------------

def create_player_service(data):
    """Creates a Player record via form, and optionally links it to a coach."""
    player = Player()
    form = player.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    player.update_with_dict(values)
    player.create()

    if data.get("coach"):
        Association_CoachPlayer(
            coach_id=data["coach"],
            player_id=player.id,
        ).create()

    return player


def _is_deleted(player):
    """PAD-268: a deleted account is ``disabled``; it never appears in a roster
    list or picker (auth.account-deletion rule 8, privacy policy §11)."""
    return player is not None and player.user is not None and player.user.status == "disabled"


def get_players_list(coach, club):
    """Returns the appropriate player list based on the caller's role."""
    if coach:
        players = coach.players
    elif club:
        players = club.players
    else:
        players = Player.query.all()
    return [p for p in players if not _is_deleted(p)]


def _activation_token_if_inactive(user):
    from padel_app.tools.activation_token import activation_token_for

    if user is None or user.status != "inactive":
        return None
    return activation_token_for(user)


def _serialize_coach_player_relation(rel):
    player = rel.player
    user = player.user if player else None
    level = rel.level if rel.level_id else None
    result = {
        "id": f"p-{rel.player_id}_c-{rel.coach_id}",
        "coachId": rel.coach_id,
        "playerId": rel.player_id,
        "levelId": str(rel.level_id) if rel.level_id else None,
        "notes": rel.notes,
        "name": user.name if user else None,
        "email": user.email if user else None,
        "phone": user.phone if user else None,
        "username": user.username if user else None,
        "side": rel.side,
        "userId": player.user_id if player else None,
        "isActive": user.status == "active" if user else False,
        # auth.activate rule 3 (PAD-254): the secret the activation link needs,
        # visible to the owning coach only and only while there is something to
        # activate. `None` afterwards so a shared roster never carries it.
        "activationToken": _activation_token_if_inactive(user),
        # PAD-30: a player who has completed self-service registration
        # (PAD-32) has a password set. Coach-disabled players keep their
        # password, so this is a precise "profile complete" signal that does
        # not conflate with isActive.
        "validated": (user.password is not None) if user else False,
        # PAD-213: `Player.coach_player_info` carries the same key.
        "claimable": _is_claimable_user(user),
        # players.remove rule 5 (PAD-274): same key as `Player.coach_player_info`.
        "deletable": _is_deletable_by_coach(player),
    }
    # PAD-112: the student's own notification block preferences + reason, so the
    # coach can tell "deliberately silent" from "ignoring me". Shared helper —
    # `Player.coach_player_info` must return the identical keys.
    from padel_app.services.student_notification_preferences import (
        notification_block_payload,
    )
    result.update(notification_block_payload(user))
    if level:
        result["level"] = {
            "id": str(level.id),
            "coachId": level.coach_id,
            "code": level.code,
            "label": level.label,
            "displayOrder": level.display_order,
        }
    return result


def get_coach_players_list(coach):
    relations = (
        Association_CoachPlayer.query.options(
            joinedload(Association_CoachPlayer.player).joinedload(Player.user)
        )
        .filter_by(coach_id=coach.id)
        # PAD-268: the roster row of a deleted account stays, hidden.
        .join(Association_CoachPlayer.player)
        .join(Player.user)
        .filter(User.status != "disabled")
        .order_by(Association_CoachPlayer.id.desc())
        .all()
    )
    return [_serialize_coach_player_relation(rel) for rel in relations]


def search_coach_players(coach_id, term, limit=20):
    """PAD-109: type-ahead search over a single coach's own roster.

    Returns ``[{"id": <Player.id as str>, "name": <User.name>}]`` — the id is the
    ``Player.id``, which is what the standing-waiting-list and notification
    restriction endpoints expect (never the ``User.id``).

    A blank/whitespace-only term returns an empty list rather than the whole
    roster, so an empty search box never dumps every student into the dropdown.
    Inactive players (invited but not yet registered) are included: the coach can
    legitimately put them on a waiting list.
    """
    term = (term or "").strip()
    if not term:
        return []

    # Escape LIKE wildcards so a literal "%" or "_" typed by the coach doesn't
    # turn into a match-everything pattern.
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    relations = (
        Association_CoachPlayer.query.options(
            joinedload(Association_CoachPlayer.player).joinedload(Player.user)
        )
        .filter_by(coach_id=coach_id)
        .join(Association_CoachPlayer.player)
        .join(Player.user)
        .filter(User.name.ilike(f"%{escaped}%", escape="\\"))
        # PAD-268: invited-but-inactive players stay pickable; deleted ones never.
        .filter(User.status != "disabled")
        .order_by(User.name.asc())
        .limit(limit)
        .all()
    )

    results = []
    for rel in relations:
        player = rel.player
        user = player.user if player else None
        if not player or not user:
            continue
        results.append({"id": str(player.id), "name": user.name})
    return results


def get_coach_players_paginated(coach, page=1, per_page=25, search=None,
                                sort_by="name", sort_dir="asc",
                                missing_level=False, missing_side=False):
    from padel_app.models.coach_levels import CoachLevel

    query = (
        Association_CoachPlayer.query.options(
            joinedload(Association_CoachPlayer.player).joinedload(Player.user),
            joinedload(Association_CoachPlayer.level),
        )
        .filter_by(coach_id=coach.id)
    )

    # Always join Player/User for sorting and filtering
    query = query.join(Association_CoachPlayer.player).join(Player.user)
    # PAD-268: a deleted account's roster row stays, hidden from the list.
    query = query.filter(User.status != "disabled")

    if search:
        query = query.filter(User.name.ilike(f"%{search}%"))

    # Alert-based filters
    if missing_level:
        query = query.filter(Association_CoachPlayer.level_id.is_(None))
    if missing_side:
        query = query.filter(Association_CoachPlayer.side.is_(None))

    # Sorting
    if sort_by == "level":
        query = query.outerjoin(CoachLevel, Association_CoachPlayer.level_id == CoachLevel.id)
        # Use case() to push NULLs last (portable across SQLite and PostgreSQL)
        null_last = case((CoachLevel.display_order.is_(None), 1), else_=0)
        if sort_dir == "desc":
            query = query.order_by(null_last, CoachLevel.display_order.desc(), User.name.asc())
        else:
            query = query.order_by(null_last, CoachLevel.display_order.asc(), User.name.asc())
    else:
        if sort_dir == "desc":
            query = query.order_by(User.name.desc())
        else:
            query = query.order_by(User.name.asc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # Compute alert counts across ALL coach players (not just current page)
    base_query = (
        Association_CoachPlayer.query.filter_by(coach_id=coach.id)
        .join(Association_CoachPlayer.player)
        .join(Player.user)
        .filter(User.status != "disabled")
    )
    missing_level_count = base_query.filter(Association_CoachPlayer.level_id.is_(None)).count()
    missing_side_count = base_query.filter(Association_CoachPlayer.side.is_(None)).count()

    return {
        "items": [_serialize_coach_player_relation(rel) for rel in pagination.items],
        "pagination": {
            "page": pagination.page,
            "perPage": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
            "hasNext": pagination.has_next,
            "hasPrev": pagination.has_prev,
        },
        "alerts": {
            "missingLevel": missing_level_count,
            "missingSide": missing_side_count,
        },
    }


def get_player_profile(coach, player_id):
    """Returns evaluation profile data for a player under a coach."""
    coach_player = (
        Association_CoachPlayer.query
        .filter_by(coach_id=coach.id, player_id=player_id)
        .first_or_404()
    )

    evaluations = [
        {
            "categoryId": entry.category_id,
            "categoryName": entry.category.name,
            "score": entry.score,
            "scaleMin": entry.category.scale_min,
            "scaleMax": entry.category.scale_max,
            "evaluatedAt": entry.evaluated_at.isoformat(),
        }
        for entry in coach_player.current_evaluations
    ]

    return {
        "playerId": str(player_id),
        "evaluations": evaluations,
        "strengths": [{"id": n.id, "text": n.text} for n in coach_player.strengths],
        "weaknesses": [{"id": n.id, "text": n.text} for n in coach_player.weaknesses],
    }


def add_player_service(data):
    """Builds the full player creation payload and delegates to create_player_helper.

    PAD-105: a coach never chooses the player's username — that is the player's
    own credential, picked when they activate their account. Any `username` in
    the payload is therefore ignored and a placeholder is generated instead
    (same mechanism as the invite flow, `players.invite-completion`), which the
    player replaces at activation.
    """
    payload = {
        'coach': int(data['coachId']) if data['coachId'] else None,
        'level': int(data['levelId']) if data.get('levelId', None) else None,
        'side': data.get('side', None),
        'notes': data.get('notes', None),
        'user': {
            'name': data.get('name', None),
            'username': unique_placeholder_username(),
            'email': data.get('email', None),
            'phone': data.get('phone', None),
        },
    }
    return create_player_helper(payload)


def edit_player_service(data):
    """Computes changed fields and delegates to edit_player_helper."""
    updates = data['updates']
    player_info = data['player']

    changes = {k: v for k, v in updates.items() if v != player_info.get(k)}

    # PAD-105: `username` is deliberately absent — a coach cannot set or change
    # a player's username, only the player themselves can (at activation).
    payload = {
        'coach': player_info['coachId'],
        'relation': {
            'level': int(changes['levelId']) if changes.get('levelId', None) else None,
            'side': changes.get('side', None),
            'notes': changes.get('notes', None),
        },
        'user': {
            'name': changes.get('name', None),
            'email': changes.get('email', None),
            'phone': changes.get('phone', None),
        },
    }

    player = Player.query.get_or_404(player_info['playerId'])
    rel = Association_CoachPlayer.query.filter_by(
        coach_id=player_info['coachId'],
        player_id=player_info["playerId"],
    ).first_or_404()

    return edit_player_helper(player, rel, payload)


REMOVE_ACTIONS = ("disconnect", "delete")


def _link_counts(rel):
    from padel_app.models import CoachPlayerNote, EvaluationEntry

    return {
        "notes": CoachPlayerNote.query.filter_by(coach_player_id=rel.id).count(),
        "evaluations": EvaluationEntry.query.filter_by(coach_player_id=rel.id).count(),
    }


def _can_delete(player, coach_count):
    """players.remove rule 5: only a placeholder (never activated, no password,
    whatever the username) that no other coach has."""
    from padel_app.models.players import _is_placeholder_user

    return _is_placeholder_user(player.user) and coach_count <= 1


def player_removal_impact(coach_id, player_id):
    """players.remove rule 7: which removal this coach gets for this player, and
    what it takes with it. ``disconnect`` takes the link with this coach's notes
    and evaluations; ``delete`` (a placeholder) also takes its presences."""
    from padel_app.models import Presence

    player = Player.query.get_or_404(player_id)
    rel = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player_id).first_or_404()
    coach_count = Association_CoachPlayer.query.filter_by(player_id=player_id).count()
    action = "delete" if _can_delete(player, coach_count) else "disconnect"
    impact = {"action": action, **_link_counts(rel)}
    if action == "delete":
        impact["presences"] = Presence.query.filter_by(player_id=player.id).count()
    return impact


def remove_player_service(data, actor_user_id=None):
    """Take a player off a coach's roster (players.remove, PAD-274).

    - ``disconnect``: only the ``coach_in_player`` link goes, with this coach's
      own notes and evaluations. The Player, User, presences and level history
      stay. Before PAD-274 an active student removed by their only coach lost
      all of that (B-057).
    - ``delete``: only for a placeholder (never activated, no password, whatever
      the username) that no other coach has; profile first, then account (PAD-260 rule 3). A delete
      of anyone else is refused with 409 and nothing changes.
    - No action (every client before PAD-274): delete a deletable placeholder,
      disconnect from everyone else. It never deletes an account.
    Every removal writes a ``deletion_audit`` row in the same transaction.
    """
    from padel_app.models import Presence
    from padel_app.models.players import _is_placeholder_user
    from padel_app.services.deletion_audit_service import record_deletion

    coach_id = data.get("coachId", None)
    player_id = data.get("playerId", None)
    action = data.get("action", None)
    if action not in (None, *REMOVE_ACTIONS):
        return {"error": "action must be 'disconnect' or 'delete'", "code": "INVALID_ACTION"}, 400

    player = Player.query.get_or_404(player_id)
    user = player.user
    rel = Association_CoachPlayer.query.filter_by(
        coach_id=coach_id,
        player_id=player_id,
    ).first_or_404()
    coach_count = Association_CoachPlayer.query.filter_by(player_id=player_id).count()

    if action == "delete":
        if not _is_placeholder_user(user):
            return {
                "error": "This player has an account. You can disconnect from them, not delete them.",
                "code": "PLAYER_HAS_ACCOUNT",
            }, 409
        if coach_count > 1:
            return {
                "error": "Another coach also has this player. You can disconnect from them, not delete them.",
                "code": "PLAYER_HAS_OTHER_COACHES",
            }, 409
    elif action is None:
        action = "delete" if _can_delete(player, coach_count) else "disconnect"

    details = {"coach_id": coach_id, **_link_counts(rel)}
    label = user.name if user is not None else None
    if action == "disconnect":
        record_deletion(actor_user_id=actor_user_id, entity="player", entity_id=player.id,
                        action="disconnected", label=label, details=details)
        rel.delete()
        return {"status": "Disconnected from player", "action": "disconnected"}, 200

    details["presences"] = Presence.query.filter_by(player_id=player.id).count()
    record_deletion(actor_user_id=actor_user_id, entity="player", entity_id=player.id,
                    action="deleted", label=label, details=details)
    player.delete()
    user.delete()
    return {"status": "Deleted placeholder player", "action": "deleted"}, 200
