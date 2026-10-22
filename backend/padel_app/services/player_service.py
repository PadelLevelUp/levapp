import re
from padel_app.models import (
    Player,
    User,
    Association_CoachPlayer,
    PlayerLevelHistory,
)
from sqlalchemy.orm import joinedload
from sqlalchemy import case, func, or_
from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.sql_db import db
from padel_app.services.level_service import set_roster_level
from padel_app.model import NotNullableFieldError
from padel_app.models.players import _is_claimable_user, _is_deletable_by_coach
from padel_app.tools.unit_of_work import transactional
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
            'side': data.get('side', None),
            'notes': data.get('notes', None),
        }
        rel = Association_CoachPlayer()

        rel_form = rel.get_create_form()

        rel_fake_request = JsonRequestAdapter(rel_data, rel_form)
        rel_values = rel_form.set_values(rel_fake_request)

        rel.update_with_dict(rel_values)
        rel.create()
        # PAD-270: the one writer of a roster level also records the history row.
        set_roster_level(rel, data.get("level"))
        db.session.commit()

    return player.coach_player_info(data["coach"])


_LEVEL_NOT_SENT = object()


def edit_player_helper(player, rel, data):
    # PAD-388 (B-136 step 3): both forms are read in present mode — the keys the
    # client sent, and only those; "" / null clear, an absent key is left alone.
    # `data['user']` and `data['relation']` are whitelisted by edit_player_service,
    # so nothing else on the user form (username, status, password…) is reachable.
    user_form = player.user.get_edit_form()
    user_fake_request = JsonRequestAdapter(data['user'], user_form, mode="present")
    user_values = user_form.set_values(user_fake_request)

    player.user.update_with_dict(user_values, write_none=True)
    player.user.save()

    # PAD-270 (B-061): the level goes through the one writer, which records the
    # history row an edit used to skip. Only a SENT level reaches here — sent
    # empty clears it (no history row: history records assignments).
    relation = dict(data['relation'])
    level = relation.pop('level', _LEVEL_NOT_SENT)
    rel_form = rel.get_edit_form()
    rel_fake_request = JsonRequestAdapter(relation, rel_form, mode="present")
    rel_values = rel_form.set_values(rel_fake_request)

    rel.update_with_dict(rel_values, write_none=True)
    if level is not _LEVEL_NOT_SENT:
        set_roster_level(rel, level)
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


def possible_duplicates_for(coach, relations):
    """players.claim rule 4c (PAD-528): for each claimable relation on the page,
    the coach's non-claimable student with the same normalised name, or None.
    One query over the coach's roster for the whole page, never one per row."""
    from padel_app.services.player_claim_service import normalise_name

    claimable = [rel for rel in relations if rel.player is not None and _is_claimable_user(rel.player.user)]
    if not claimable or coach is None:
        return {}
    from padel_app.models import Coach

    # The picker's exclusions (rule 4b): an active student account, not a coach, not
    # claimable — so a flag never points at someone the merge would refuse.
    rows = (
        db.session.query(Player.id, User, Association_CoachPlayer)
        .join(Association_CoachPlayer, Association_CoachPlayer.player_id == Player.id)
        .join(User, Player.user_id == User.id)
        .outerjoin(Coach, Coach.user_id == User.id)
        .filter(Association_CoachPlayer.coach_id == coach.id, User.status == "active", Coach.id.is_(None))
        .all()
    )
    by_name = {}
    for player_id, user, rel_row in rows:
        if _is_claimable_user(user):      # rule 1's one definition, not a second copy
            continue
        key = normalise_name(user.name)
        if key and (key not in by_name or player_id < by_name[key]["playerId"]):
            # PAD-683 (rule 9a): the other student as THIS coach names them (coach-private payload).
            by_name[key] = {
                "playerId": player_id,
                "name": user.name,
                "displayName": nickname_payload(rel_row, user.name)["displayName"],
            }
    out = {}
    for rel in claimable:
        key = normalise_name(rel.player.user.name)
        out[rel.id] = by_name.get(key) if key else None
    return out


NICKNAME_MAX = 60


def nickname_payload(rel, real_name):
    """PAD-660 (players.nickname rule 2): the coach's own nickname keys for one roster row.

    Only ever called with the REQUESTING coach's relation row, so another coach's nickname cannot
    reach this payload. `name` stays the real name; `displayName` is what the coach's views show.
    """
    nickname = rel.nickname if rel is not None else None
    as_name = bool(rel.nickname_as_name) if rel is not None else False
    return {
        "nickname": nickname,
        "nicknameAsName": as_name,
        "displayName": nickname if (as_name and nickname) else real_name,
    }


def relations_by_player(coach_id, player_ids=None):
    """PAD-683 (rule 9a): ``{player_id: relation row}`` for ONE coach, in a single query, so a
    coach-private payload with many student rows reads each nickname without a query per row."""
    if not coach_id:
        return {}
    q = Association_CoachPlayer.query.filter(Association_CoachPlayer.coach_id == coach_id)
    if player_ids is not None:
        ids = list(player_ids)
        if not ids:
            return {}
        q = q.filter(Association_CoachPlayer.player_id.in_(ids))
    return {rel.player_id: rel for rel in q.all()}


def coach_relation_payloads(coach_id, rows, real_name_of):
    """PAD-683 (rule 9a): add the requesting coach's ``nickname`` / ``nicknameAsName`` /
    ``displayName`` to every dict in ``rows`` that has a ``playerId`` (in place; returns ``rows``).
    ``real_name_of(row)`` gives the row's real name. ``name`` is left untouched (rule 2)."""
    rels = relations_by_player(coach_id, {r.get("playerId") for r in rows if r.get("playerId")})
    for row in rows:
        row.update(nickname_payload(rels.get(row.get("playerId")), real_name_of(row)))
    return rows


def coach_display_name(coach_user_id, player_id, real_name):
    """PAD-683 (players.nickname rule 9c): the name text sent ONLY to a coach uses for a student.

    Keyed on the RECIPIENT coach's user id, so the nickname is that coach's own (rule 1); a
    recipient who is not a coach, or not this student's coach, gets ``real_name``. Never use it
    for text the student can read — the shared coach–student conversation keeps the real name.
    """
    from padel_app.models import Coach

    if not coach_user_id or not player_id:
        return real_name
    rel = (
        Association_CoachPlayer.query.join(Coach, Coach.id == Association_CoachPlayer.coach_id)
        .filter(Coach.user_id == coach_user_id, Association_CoachPlayer.player_id == player_id)
        .first()
    )
    if rel is None:
        return real_name
    return nickname_payload(rel, real_name)["displayName"]


def coach_facing_text(text, coach_user_id, player_id, real_name):
    """PAD-683 (rule 9c): ``text`` with the student's real name replaced by the recipient coach's
    display name — for a push title/body that repeats a notice whose stored copy stays real.

    Only the FIRST whole-word occurrence is replaced: every coach notice opens on the student's
    name, and a later occurrence (inside a class title or the student's own note) is left as is."""
    if not text or not real_name:
        return text
    shown = coach_display_name(coach_user_id, player_id, real_name)
    if shown == real_name:
        return text
    return re.sub(rf"(?<!\w){re.escape(real_name)}(?!\w)", lambda _m: shown, text, count=1)


def _serialize_coach_player_relation(rel, due=None, duplicates=None):
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
        # evaluations.reminders rule 4 (PAD-404): computed by the server only (R-048).
        "due": bool((due or {}).get(rel.id, False)),
        # players.claim rule 4c (PAD-528): only a claimable row can carry one.
        "possibleDuplicateOf": (duplicates or {}).get(rel.id),
        **nickname_payload(rel, user.name if user else None),
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


# ── players.search (PAD-665): the one coach-side player search rule ──────────────────────────────
# The TypeScript twin is `@levelup/config` name-search.ts; both run name-search.cases.json
# (test_name_search_cases.py), so the server and the apps' pickers cannot drift.

# B-531: letters NFKD cannot take apart, mapped before folding — the same table as the twin.
_SPECIAL_LETTERS = {
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "ß": "ss", "ẞ": "ss", "đ": "d", "Đ": "d",
    "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ı": "i",
}
_MIN_TYPO_WORD = 4
_MIN_PHONE_DIGITS = 3


def fold_search_text(text):
    """Special letters mapped, lower-cased, accents dropped (NFKD minus combining marks), anything
    that is not a letter, a digit or a space dropped, spaces collapsed. Every script's letters are
    kept (B-531: "Łukasz" folds to "lukasz", never "ukasz"). `lower()`, not `casefold()`: the twin
    is `toLowerCase()`, and ß is already mapped."""
    import unicodedata

    mapped = "".join(_SPECIAL_LETTERS.get(ch, ch) for ch in (text or "")).lower()
    decomposed = unicodedata.normalize("NFKD", mapped)
    kept = "".join(
        ch for ch in decomposed
        if not unicodedata.category(ch).startswith("M") and (ch.isalnum() or ch.isspace())
    )
    return " ".join(kept.split())


# PAD-516's name for the fold.
normalize_search_text = fold_search_text


def _typo_distance(a, b):
    """Optimal string alignment: Levenshtein plus one adjacent swap ("Marinoh")."""
    d = [[i if j == 0 else (j if i == 0 else 0) for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def rank_player_match(fields, query):
    """players.search rule 5: the best tier this player reaches — 0 the whole query starts a field,
    1 every word starts a word, 2 every word appears anywhere (PAD-516's rule), 3 every word is
    there or a small typo away — or None. ``fields`` holds ``name`` and, only where the surface's
    payload already carries them, ``nickname``, ``email``, ``phone``. A blank query is tier 0
    (everyone); a query with no letter or digit ("%") matches nobody."""
    import re

    if not (query or "").strip():
        return 0
    words = fold_search_text(query).split()
    if not words:
        return None
    # Decision 2026-10-14 (b): an email is searched by its local part — never the domain, which
    # every address on a roster shares ("a" would otherwise match "example.com").
    email_local = (fields.get("email") or "").split("@", 1)[0]
    texts = [t for t in (fold_search_text(v) for v in (fields.get("name"), fields.get("nickname"), email_local)) if t]
    phone = re.sub(r"\D", "", fields.get("phone") or "")
    if not texts and not phone:
        return None
    tokens = [tok for t in texts for tok in t.split(" ")]

    whole = " ".join(words)
    if any(t.startswith(whole) for t in texts):
        return 0
    if all(any(tok.startswith(w) for tok in tokens) for w in words):
        return 1

    def anywhere(w):
        if any(w in t for t in texts):
            return True
        return len(w) >= _MIN_PHONE_DIGITS and w.isdigit() and w in phone

    if all(anywhere(w) for w in words):
        return 2

    def nearly(w):
        if anywhere(w):
            return True
        if len(w) < _MIN_TYPO_WORD or any(ch.isdigit() for ch in w):
            return False
        limit = 2 if len(w) >= 7 else 1
        return any(
            _typo_distance(w, tok) <= limit or _typo_distance(w, tok[: len(w)]) <= limit for tok in tokens
        )

    if all(nearly(w) for w in words):
        return 3
    return None


def name_matches_query(name, query):
    """players.list rule 3 (PAD-516), now players.search: the name matches at any tier. Applied
    in Python after the coach scope: rosters are small, and SQL cannot fold accents without the
    unaccent extension (not installed in prod; decision 2026-10-14)."""
    return rank_player_match({"name": name}, query) is not None


def search_players(items, query, fields_of):
    """players.search rule 6: the matches best first — tier, folded name, name, id. A blank query
    returns ``items`` in their own order. Call it BEFORE any limit or pagination."""
    if not (query or "").strip():
        return list(items)
    ranked = []
    for item in items:
        fields = fields_of(item)
        tier = rank_player_match(fields, query)
        if tier is None:
            continue
        name = fields.get("name") or ""
        ranked.append((tier, fold_search_text(name), name, _id_key(fields.get("id")), item))
    ranked.sort(key=lambda r: r[:4])
    return [r[4] for r in ranked]


def _id_key(value):
    """Ids made of ASCII digits sort as numbers, first; then the id as written — the twin's
    `idKey` (``"²".isdigit()`` is true in Python, so the check is ASCII-only on purpose)."""
    s = "" if value is None else str(value)
    numeric = s.isascii() and s.isdigit()
    return (0 if numeric else 1, int(s) if numeric else 0, s)


class _ListPage:
    """The slice of ``Pagination`` the roster serializer reads, for a list filtered in Python."""

    def __init__(self, items, page, per_page):
        self.page, self.per_page, self.total = page, per_page, len(items)
        self.pages = max(1, -(-self.total // per_page)) if per_page else 1
        start = (page - 1) * per_page
        self.items = items[start:start + per_page]
        self.has_prev = page > 1
        self.has_next = page < self.pages


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
    from padel_app.services.evaluation_api_service import due_for_links

    due = due_for_links(coach, relations)
    duplicates = possible_duplicates_for(coach, relations)
    return [_serialize_coach_player_relation(rel, due, duplicates) for rel in relations]


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
    # A blank term, or one with no searchable characters ("%", "_"), never lists the roster.
    if not normalize_search_text(term).split():
        return []


    relations = (
        Association_CoachPlayer.query.options(
            joinedload(Association_CoachPlayer.player).joinedload(Player.user)
        )
        .filter_by(coach_id=coach_id)
        .join(Association_CoachPlayer.player)
        .join(Player.user)
        # PAD-268: invited-but-inactive players stay pickable; deleted ones never.
        .filter(User.status != "disabled")
        .order_by(User.name.asc())
        .all()
    )
    # players.search (PAD-665): the shared rule, best match first, and the limit AFTER the order
    # (rule 6) — the name, and THIS coach's nickname for the student (PAD-660, players.nickname rule 5).
    relations = search_players(
        relations, term, lambda rel: {"name": rel.player.user.name, "nickname": rel.nickname, "id": rel.player_id}
    )[:limit]

    results = []
    for rel in relations:
        player = rel.player
        user = player.user if player else None
        if not player or not user:
            continue
        # PAD-683 (players.nickname rules 2, 9a): this coach's own nickname keys beside the real name.
        results.append({"id": str(player.id), "name": user.name, **nickname_payload(rel, user.name)})
    return results


def get_coach_players_paginated(coach, page=1, per_page=25, search=None,
                                sort_by="name", sort_dir="asc",
                                missing_level=False, missing_side=False, incomplete=False):
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


    # Alert-based filters
    if missing_level:
        query = query.filter(Association_CoachPlayer.level_id.is_(None))
    if missing_side:
        query = query.filter(Association_CoachPlayer.side.is_(None))
    # dashboard.profile-completeness rule 3: the dashboard's "see all" (no level OR no side).
    if incomplete:
        query = query.filter(or_(Association_CoachPlayer.level_id.is_(None), Association_CoachPlayer.side.is_(None)))

    # Sorting
    if sort_by == "level":
        query = query.outerjoin(CoachLevel, Association_CoachPlayer.level_id == CoachLevel.id)
        # players.list rule 4 (PAD-521, B-363): "desc" is Level High→Low, i.e. the ladder
        # strongest first — and LOWER display_order is STRONGER (levels rule 3). The canonical
        # key (levels rule 10): ordered levels by display_order, unordered (NULL/0) levels at
        # the weak end, id as tie-break. "asc" (Low→High) is that ladder reversed. Players with
        # no level stay last either way. case() keeps it portable across SQLite and Postgres.
        no_level = case((Association_CoachPlayer.level_id.is_(None), 1), else_=0)
        unordered = case(
            (or_(CoachLevel.display_order.is_(None), CoachLevel.display_order <= 0), 1), else_=0
        )
        if sort_dir == "desc":
            query = query.order_by(no_level, unordered.asc(), CoachLevel.display_order.asc(),
                                   CoachLevel.id.asc(), User.name.asc())
        else:
            query = query.order_by(no_level, unordered.desc(), CoachLevel.display_order.desc(),
                                   CoachLevel.id.desc(), User.name.asc())
    else:
        if sort_dir == "desc":
            query = query.order_by(User.name.desc())
        else:
            query = query.order_by(User.name.asc())

    if search and search.strip():
        # players.search (PAD-665): the shared rule in Python (accent folding), after every SQL
        # filter, then paginate. The Players tab is always sorted (name or level), so the rule
        # only filters here and the coach's sort stands (rule 6, decision 2026-10-14 (a)). The row
        # carries email and phone, so they are searched too (rule 4). The coach scope keeps this small.
        matched = [
            rel for rel in query.all()
            if rank_player_match(
                {
                    "name": rel.player.user.name,
                    "nickname": rel.nickname,  # PAD-660: this coach's own row
                    "email": rel.player.user.email,
                    "phone": rel.player.user.phone,
                },
                search,
            ) is not None
        ]
        pagination = _ListPage(matched, max(1, int(page or 1)), int(per_page or 25))
    else:
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

    from padel_app.services.evaluation_api_service import due_for_links

    due = due_for_links(coach, pagination.items)
    duplicates = possible_duplicates_for(coach, pagination.items)
    return {
        "items": [_serialize_coach_player_relation(rel, due, duplicates) for rel in pagination.items],
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


def evaluated_at_iso(entry) -> str:
    """`evaluations[].evaluatedAt`: the NAIVE ISO timestamp it has always been — no
    offset, no "Z" — and never null (evaluations.legacy-client-contract, R-047).
    App Store 1.0/1.1.0 call `parseISO` on it unguarded and read it as device-local
    time. The column is NOT NULL since PAD-273, but that migration is guarded and
    production drifts, so a missing value falls back rather than reach a client."""
    from datetime import datetime

    # A FIXED last resort, never "now": the same row must read the same on every call.
    instant = entry.evaluated_at or entry.created_at or datetime(1970, 1, 1)
    return instant.replace(tzinfo=None).isoformat()


def get_player_profile(coach, player_id):
    """Returns evaluation profile data for a player under a coach."""
    coach_player = (
        Association_CoachPlayer.query
        .filter_by(coach_id=coach.id, player_id=player_id)
        .first_or_404()
    )

    from padel_app.services.evaluation_record_service import latest_legacy_entries

    evaluations = [
        {
            "categoryId": entry.category_id,
            "categoryName": entry.category.name,
            "score": entry.score,
            "scaleMin": entry.category.scale_min,
            "scaleMax": entry.category.scale_max,
            "evaluatedAt": evaluated_at_iso(entry),
        }
        # R-047 (PAD-363): legacy categories only — never a competency's rating.
        for entry in latest_legacy_entries(coach_player)
    ]

    return {
        "playerId": str(player_id),
        "evaluations": evaluations,
        "strengths": [{"id": n.id, "text": n.text} for n in coach_player.strengths],
        "weaknesses": [{"id": n.id, "text": n.text} for n in coach_player.weaknesses],
    }


def require_adults_confirmation(data):
    """PAD-642 (players.create rule 10, import.confirm rule 9; owner decision 2026-10-12, "forbid
    under-18"): a client declaring `adult-roster-confirmation` sends the coach's `confirmsAdults: true`
    when creating or importing players; without it, 400 before anything is written. An older build is
    not asked."""
    from flask import abort, jsonify, make_response

    from padel_app.utils.client_capabilities import ADULT_ROSTER_CONFIRMATION, client_declares

    if client_declares(ADULT_ROSTER_CONFIRMATION) and (data or {}).get("confirmsAdults") is not True:
        abort(make_response(jsonify({
            "error": "Confirma que os alunos têm 18 anos ou mais. / Confirm the students are 18 or older.",
            "field": "confirmsAdults",
            "code": "ADULTS_CONFIRMATION_REQUIRED",
        }), 400))


@transactional
def add_player_service(data):
    """Builds the full player creation payload and delegates to create_player_helper.

    PAD-272 pilot (players.create rule 9): the User, Player, coach link and
    level-history rows are one transaction — a failure part-way (a level that
    does not exist) leaves nothing behind instead of an orphan user and player.

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


#: `updates` keys a coach may write, and where (PAD-388). `userId` is sent by
#: every shell and read by nobody.
_EDIT_PLAYER_USER = ("name", "email", "phone")
_EDIT_PLAYER_RELATION = {"levelId": "level", "side": "side", "notes": "notes"}


def edit_player_service(data):
    """Computes changed fields and delegates to edit_player_helper.

    Raises NotNullableFieldError (→ 400 naming the fields) for what may not be
    written: an empty name, an account holder's e-mail, a 0/false level.
    """
    updates = data['updates']
    player_info = data['player']

    changes = {k: v for k, v in updates.items() if v != player_info.get(k)}

    # PAD-105: `username` is deliberately absent — a coach cannot set or change
    # a player's username, only the player themselves can (at activation).
    # PAD-388 (B-136 step 3): each dict holds a key iff the client sent it AND it
    # is whitelisted — nothing is invented for an unchanged key (the old None
    # placeholders would now CLEAR), and nothing else on the user form is reachable.
    player = Player.query.get_or_404(player_info['playerId'])
    refused = []
    if 'name' in changes and (changes['name'] is None or not str(changes['name']).strip()):
        refused.append("name")
    # PAD-388 (Coordinator, 2026-09-22, widened after review): once a student has an
    # account (a password), the e-mail is their login and password recovery — the
    # student's own field. A coach may neither clear nor CHANGE it; the student does,
    # from their own settings. A placeholder's e-mail is the coach's.
    if 'email' in changes and player.user.password is not None:
        refused.append("email")
    # 0 / false are not a level: the old code read them as "not sent"; present mode
    # would hand them to set_roster_level and hit the FK after the user part committed.
    if 'levelId' in changes and changes['levelId'] in (0, False, "0"):
        refused.append("level")
    # PAD-660 (players.nickname rule 6): the coach's own nickname for this student — trimmed,
    # blank clears it, longer than NICKNAME_MAX is refused. Written to the coach's relation only.
    nickname_set = {}
    if "nickname" in updates:
        raw = updates["nickname"]
        value = "" if raw is None else str(raw).strip()
        if len(value) > NICKNAME_MAX:
            refused.append("nickname")
        else:
            nickname_set["nickname"] = value or None
    if "nicknameAsName" in updates:
        # A boolean, never a truthy string: "false" is not on (review finding).
        nickname_set["nickname_as_name"] = updates["nicknameAsName"] in (True, 1, "true", "1")
    if refused:
        raise NotNullableFieldError(refused)  # the blueprint answers 400 {"error": "invalid_fields", "fields": [...]}
    payload = {
        'coach': player_info['coachId'],
        'relation': {
            field: changes[key] for key, field in _EDIT_PLAYER_RELATION.items() if key in changes
        },
        'user': {
            key: changes[key] for key in _EDIT_PLAYER_USER if key in changes
        },
    }

    rel = Association_CoachPlayer.query.filter_by(
        coach_id=player_info['coachId'],
        player_id=player_info["playerId"],
    ).first_or_404()

    # Saved with the rest of the relation by edit_player_helper's one rel.save().
    for field, value in nickname_set.items():
        setattr(rel, field, value)
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
