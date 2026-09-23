"""PAD-402 (evaluations.student-view) — RED: `GET /api/app/my_evaluations` (does
not exist yet) and the `evaluations` dashboard block (the dashboard route
already exists; only the block is missing).

Every test seeds its `EvaluationShare` row(s) directly through the ORM instead
of going through `POST .../share` (tested in test_pad402_sharing_api.py) — the
model and migration already exist (evaluations.sharing rule 7 / decision 1: the
stored `card` is served "untouched", never recomputed), so this isolates the
READ side under test here: `my_evaluations` and
`helpers/dashboard/player.py build_player_dashboard_blocks`. `my_evaluations`
tests are 404 (no route) until Batch A2; the dashboard-block tests are real
assertion failures (no `evaluations` block is emitted yet) — a more precise RED
than a blanket 404, since that route already exists.
"""
import datetime as dt

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    _coach_headers,
    _headers,
    _jwt_secret,
    _seed,
)

BASE = "/api/app"
# evaluations/sharing.spec.md rule 3 — not used directly in this (student-side) file,
# kept here so all four endpoints are named in one place per file.
SHARE_PREVIEW_PATH = BASE + "/evaluation_record/{id}/share_preview"
SHARE_PATH = BASE + "/evaluation_record/{id}/share"
UNSHARE_PATH = SHARE_PATH
# evaluations/student-view.spec.md rule 2: "GET /api/app/my_evaluations"
MY_EVALUATIONS_PATH = BASE + "/my_evaluations"
DASHBOARD_PATH = BASE + "/dashboard"

CAPABILITIES_HEADER = {"X-LevApp-Capabilities": "evaluations"}


def _rated(app, ids, category_id, score, when):
    from padel_app.services import evaluation_record_service as record_svc

    with app.app_context():
        record = record_svc.get_or_create_record(ids["rel_id"], day=record_svc.record_day(when))
        record_svc.upsert_rating(record, category_id, score, evaluated_at=when)
        return record.id


def _bare_record(app, coach_player_id, evaluated_on):
    """An EvaluationRecord with no ratings — the shared `card` is hand-built and
    independent of the record's own rows, so tests that only need an id (the
    dashboard cap test) don't need real ratings."""
    from padel_app.models import EvaluationRecord

    with app.app_context():
        record = EvaluationRecord(coach_player_id=coach_player_id, evaluated_on=evaluated_on)
        db.session.add(record)
        db.session.commit()
        return record.id


def _second_coach_linked_to(app, ids, *, name, username):
    """A second coach who also coaches `ids`' student (student-view rule 3:
    "each coach's sharing is independent")."""
    from padel_app.models import Association_CoachPlayer, Coach, User

    with app.app_context():
        user = User(name=name, username=username, email=f"{username}@test.com", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        link = Association_CoachPlayer(coach_id=coach.id, player_id=ids["student_id"])
        db.session.add(link)
        db.session.commit()
        return {"coach_id": coach.id, "user_id": user.id, "rel_id": link.id}


def _seed_share(app, *, record_id, coach_name, shared_at, evaluated_on, ratings=(), evolution=(),
                 evolution_period="none", note=None, category_ids=None):
    """Writes the `EvaluationShare` row and its frozen `card` snapshot directly —
    the shape evaluations.sharing rule 3 defines, never recomputed at read time
    (rule 2 of this leaf)."""
    from padel_app.models import EvaluationShare

    card = {
        "recordId": record_id, "coachName": coach_name, "evaluatedOn": evaluated_on, "className": None,
        "sharedAt": shared_at.isoformat(), "ratings": list(ratings), "evolution": list(evolution),
        "evolutionPeriod": evolution_period, "note": note,
    }
    with app.app_context():
        share = EvaluationShare(
            record_id=record_id, shared_at=shared_at,
            category_ids=list(category_ids) if category_ids is not None else [],
            evolution=evolution_period, include_note=note is not None, card=card,
        )
        db.session.add(share)
        db.session.commit()
        return share.id


def _lone_player(app, *, name, username):
    """A player with no coach at all — used for "no shared card" (Sara)."""
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name=name, username=username, email=f"{username}@test.com", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.commit()
        return {"user_id": user.id, "player_id": player.id}


def _block(payload, block_type):
    return next((b for b in payload["blocks"] if b.get("type") == block_type), None)


def _blocks_minus_evaluations(payload):
    return [b for b in payload["blocks"] if b.get("type") != "evaluations"]


# ── a player sees only shared cards, and only what was chosen (rules 1, 2) ──


def test_a_player_sees_only_shared_cards_and_only_what_was_chosen(app, client):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        tecnica = EvaluationCategory(coach_id=ids["coach_id"], name="Técnica", scale_min=1, scale_max=5,
                                     competency_group="technique", catalogue_key="technique.tecnica")
        tatica = EvaluationCategory(coach_id=ids["coach_id"], name="Tática", scale_min=1, scale_max=5,
                                    competency_group="tactics", catalogue_key="tactics.tatica")
        db.session.add_all([tecnica, tatica])
        db.session.commit()
        ids.update(tecnica_id=tecnica.id, tatica_id=tatica.id)
    record_id = _rated(app, ids, ids["tecnica_id"], 4, dt.datetime(2026, 9, 21, 9, 0))
    _rated(app, ids, ids["tatica_id"], 3, dt.datetime(2026, 9, 21, 9, 0))
    with app.app_context():
        from padel_app.services import evaluation_record_service as record_svc
        from padel_app.models import EvaluationRecord

        record = db.session.get(EvaluationRecord, record_id)
        record_svc.set_note(record, "Boa sessão")
    _seed_share(
        app, record_id=record_id, coach_name="Test Coach", shared_at=dt.datetime(2026, 9, 21, 14, 5, 11),
        evaluated_on="2026-09-21",
        ratings=[{"name": "Técnica", "key": "technique.tecnica", "score": 4, "scaleMin": 1, "scaleMax": 5}],
        evolution_period="last", category_ids=[ids["tecnica_id"]],
    )  # includeNote False, the note "Boa sessão" is NOT in this card

    res = client.get(MY_EVALUATIONS_PATH, headers=_headers(app, ids["student_user_id"]))

    assert res.status_code == 200, res.get_data(as_text=True)
    raw = res.get_data(as_text=True)
    assert "Tática" not in raw and "Boa sessão" not in raw and "categoryId" not in raw
    body = res.get_json()
    assert len(body["cards"]) == 1
    (card,) = body["cards"]
    assert card["evaluatedOn"] == "2026-09-21"
    assert card["coachName"] == "Test Coach"
    assert card["ratings"] == [{"name": "Técnica", "key": "technique.tecnica", "score": 4, "scaleMin": 1, "scaleMax": 5}]
    assert card["note"] is None


def test_a_coach_cannot_read_the_student_endpoint(app, client):
    ids = _seed(app)

    res = client.get(MY_EVALUATIONS_PATH, headers=_coach_headers(app, ids))

    assert res.status_code == 403, res.get_data(as_text=True)
    assert res.get_json() == {"error": "not_a_player"}


# ── both coaches' cards appear, each named (rule 3) ──────────────────────────


def test_both_coaches_cards_appear_newest_first_each_named(app, client):
    ids = _seed(app)
    bruno = _second_coach_linked_to(app, ids, name="Coach Bruno", username="pad402-bruno")
    ana_record_id = _rated(app, ids, ids["forehand_id"], 4, dt.datetime(2026, 9, 14, 9, 0))
    bruno_record_id = _bare_record(app, bruno["rel_id"], dt.date(2026, 9, 20))

    _seed_share(app, record_id=ana_record_id, coach_name="Test Coach",
                shared_at=dt.datetime(2026, 9, 14, 10, 0, 0), evaluated_on="2026-09-14",
                ratings=[{"name": "Forehand", "key": None, "score": 4, "scaleMin": 1, "scaleMax": 10}])
    _seed_share(app, record_id=bruno_record_id, coach_name="Coach Bruno",
                shared_at=dt.datetime(2026, 9, 20, 10, 0, 0), evaluated_on="2026-09-20",
                ratings=[{"name": "Serve", "key": None, "score": 3, "scaleMin": 1, "scaleMax": 5}])

    res = client.get(MY_EVALUATIONS_PATH, headers=_headers(app, ids["student_user_id"]))

    assert res.status_code == 200, res.get_data(as_text=True)
    cards = res.get_json()["cards"]
    assert len(cards) == 2
    assert [c["coachName"] for c in cards] == ["Coach Bruno", "Test Coach"]  # Bruno's is later: newest first


# ── the dashboard block is gated by the token and omitted when empty (4, 5) ─


def test_the_dashboard_block_is_gated_by_the_capability_header_and_omitted_when_empty(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 4, dt.datetime(2026, 9, 21, 9, 0))
    _seed_share(app, record_id=record_id, coach_name="Test Coach", shared_at=dt.datetime(2026, 9, 21, 10, 0, 0),
                evaluated_on="2026-09-21",
                ratings=[{"name": "Forehand", "key": None, "score": 4, "scaleMin": 1, "scaleMax": 10}])
    rui_headers = _headers(app, ids["student_user_id"])
    sara = _lone_player(app, name="Sara", username="pad402-sara")
    sara_headers = _headers(app, sara["user_id"])

    rui_with_header = client.get(DASHBOARD_PATH, headers={**rui_headers, **CAPABILITIES_HEADER}).get_json()
    rui_without_header = client.get(DASHBOARD_PATH, headers=rui_headers).get_json()
    sara_with_header = client.get(DASHBOARD_PATH, headers={**sara_headers, **CAPABILITIES_HEADER}).get_json()
    sara_without_header = client.get(DASHBOARD_PATH, headers=sara_headers).get_json()

    block = _block(rui_with_header, "evaluations")
    assert block is not None, "declares the token and has a card: the block must be present"
    assert len(block["data"]["cards"]) == 1
    assert block["data"]["href"] == "/evaluations"
    assert _block(rui_without_header, "evaluations") is None  # no header: fails closed even though Rui has a card
    assert _block(sara_with_header, "evaluations") is None  # header declared, but Sara has no shared card
    assert _block(sara_without_header, "evaluations") is None

    # every OTHER block is byte-identical whether or not the token is declared
    assert _blocks_minus_evaluations(rui_with_header) == _blocks_minus_evaluations(rui_without_header)
    assert _blocks_minus_evaluations(sara_with_header) == _blocks_minus_evaluations(sara_without_header)


def test_the_dashboard_block_caps_at_three_newest_first(app, client):
    ids = _seed(app)
    shared_ats = [dt.datetime(2026, 9, d, 10, 0, 0) for d in (10, 14, 18, 21)]
    record_ids = [_bare_record(app, ids["rel_id"], dt.date(2026, 9, d)) for d in (10, 14, 18, 21)]
    for record_id, shared_at in zip(record_ids, shared_ats):
        _seed_share(app, record_id=record_id, coach_name="Test Coach", shared_at=shared_at,
                    evaluated_on=shared_at.date().isoformat(), ratings=[])

    payload = client.get(DASHBOARD_PATH, headers={
        **_headers(app, ids["student_user_id"]), **CAPABILITIES_HEADER,
    }).get_json()

    block = _block(payload, "evaluations")
    assert block is not None
    assert len(block["data"]["cards"]) == 3  # 4 shared, capped at 3
    assert [c["sharedAt"] for c in block["data"]["cards"]] == [
        shared_ats[3].isoformat(), shared_ats[2].isoformat(), shared_ats[1].isoformat(),
    ]  # newest sharedAt first — 2026-09-10 (the oldest) drops off


# ── the player's card survives the coach's later changes (rules 1, 6) ──────


def test_the_players_card_survives_the_coachs_later_changes(app, client):
    """student-view spec: "Ana's preview showed Técnica 4 with a delta of +1.0.
    Ana later switches Técnica off and rates Rui again. Rui's card still shows
    Técnica 4 and +1.0." — the frozen card is unaffected by anything the coach
    does afterwards (this is the player-facing half of sharing rule 7; the
    coach-facing half is test_pad402_sharing_api.py's switched-off-competency
    test)."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        tecnica = EvaluationCategory(coach_id=ids["coach_id"], name="Técnica", scale_min=1, scale_max=5,
                                     competency_group="technique", catalogue_key="technique.tecnica")
        db.session.add(tecnica)
        db.session.commit()
        ids["tecnica_id"] = tecnica.id
    record_id = _rated(app, ids, ids["tecnica_id"], 4, dt.datetime(2026, 9, 21, 9, 0))
    _seed_share(app, record_id=record_id, coach_name="Test Coach", shared_at=dt.datetime(2026, 9, 21, 10, 0, 0),
                evaluated_on="2026-09-21",
                ratings=[{"name": "Técnica", "key": "technique.tecnica", "score": 4, "scaleMin": 1, "scaleMax": 5}],
                evolution=[{"name": "Técnica", "key": "technique.tecnica", "delta": 1.0}], evolution_period="last")

    off = client.patch(f"{BASE}/evaluation_competency/{ids['tecnica_id']}", json={"isActive": False},
                        headers=_coach_headers(app, ids))
    assert off.status_code == 200, off.get_data(as_text=True)
    later = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json={
        "playerId": ids["student_id"], "recordId": record_id, "ratings": {str(ids["tecnica_id"]): 2},
    })
    assert later.status_code in (200, 409), later.get_data(as_text=True)  # 409 if the switch-off blocks a re-rate

    res = client.get(MY_EVALUATIONS_PATH, headers=_headers(app, ids["student_user_id"]))

    assert res.status_code == 200, res.get_data(as_text=True)
    (card,) = res.get_json()["cards"]
    assert card["ratings"] == [{"name": "Técnica", "key": "technique.tecnica", "score": 4, "scaleMin": 1, "scaleMax": 5}]
    assert card["evolution"] == [{"name": "Técnica", "key": "technique.tecnica", "delta": 1.0}]
