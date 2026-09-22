"""PAD-402 (evaluations.sharing) — RED: the three coach-side endpoints that do
not exist yet: `POST .../share_preview`, `POST .../share`, `DELETE .../share`.

Paths are quoted verbatim from evaluations/sharing.spec.md (rules 3, 7, 9),
which names them with the SAME singular "evaluation_record" the rest of
`modules/evaluations_api.py` already uses (`PUT /evaluation_record`,
`DELETE /evaluation_record/<id>`) — kept here as module constants so a
route-naming change is a one-line fix.

Every test that calls one of the three missing endpoints is written for the
Batch A2 contract (decisions 1-8 of the plan) and is expected to fail with a
404 today (no route registered) — the suite should go green with NO edits once
A2 lands. Two tests ("delete cascades the share", the stale-flag lifecycle)
seed an `EvaluationShare` row directly through the ORM instead — the model and
its migration already exist — so their RED is a real assertion failure
(`serialize_record` still hard-codes `"share": None`, evaluation_api_service.py
:304) or, for the cascade test, may already be GREEN (the FK + `delete-orphan`
backref are already wired and SQLite FKs are enforced in tests, see
conftest.py `_sqlite_fk_on`).
"""
import datetime as dt
import time
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    _coach_headers,
    _headers,
    _jwt_secret,
    _other_coach,
    _seed,
)
from padel_app.tests.test_pad364_evolution_and_class_api import _leaf_bandeja  # noqa: F401 — João/Bandeja dataset

BASE = "/api/app"
# evaluations/sharing.spec.md rule 3: "POST /api/app/evaluation_record/<id>/share_preview"
SHARE_PREVIEW_PATH = BASE + "/evaluation_record/{id}/share_preview"
# evaluations/sharing.spec.md rule 7: "POST /api/app/evaluation_record/<id>/share" (same body as preview)
SHARE_PATH = BASE + "/evaluation_record/{id}/share"
# evaluations/sharing.spec.md rule 9: "DELETE /api/app/evaluation_record/<id>/share" — same URL, POST vs DELETE
UNSHARE_PATH = SHARE_PATH
# evaluations/student-view.spec.md rule 2: "GET /api/app/my_evaluations" — not called from this (coach-side) file,
# kept here so all four endpoints are named in one place per file.
MY_EVALUATIONS_PATH = BASE + "/my_evaluations"

PATCH_PUBLISH = "padel_app.services.notification_service.publish"
PATCH_WEB_PUSH = "padel_app.services.notification_service.send_push_notification"
PATCH_EXPO_PUSH = "padel_app.utils.expo_push.send_expo_push_to_user"


def _rated(app, ids, category_id, score, when):
    """File a rating the way the record API does: in the class-less record of
    `when`'s club day (`evaluation_record_service`, unchanged by this ticket).
    Returns the record's id."""
    from padel_app.services import evaluation_record_service as record_svc

    with app.app_context():
        record = record_svc.get_or_create_record(ids["rel_id"], day=record_svc.record_day(when))
        record_svc.upsert_rating(record, category_id, score, evaluated_at=when)
        return record.id


def _three_competencies(app, ids):
    """Técnica, Tática, Consistência — the sharing spec's own worked example
    ("One line per chosen competency, over the chosen period"), 1-5, in this
    sort order so `_entry_order` (evaluation_api_service.py:288) gives the
    competency order the criterion asserts."""
    from padel_app.models import EvaluationCategory

    with app.app_context():
        tecnica = EvaluationCategory(coach_id=ids["coach_id"], name="Técnica", scale_min=1, scale_max=5,
                                     competency_group="technique", catalogue_key="technique.tecnica", sort_order=0)
        tatica = EvaluationCategory(coach_id=ids["coach_id"], name="Tática", scale_min=1, scale_max=5,
                                    competency_group="tactics", catalogue_key="tactics.tatica", sort_order=1)
        consistencia = EvaluationCategory(coach_id=ids["coach_id"], name="Consistência", scale_min=1, scale_max=5,
                                          competency_group="tactics", catalogue_key="tactics.consistencia", sort_order=2)
        db.session.add_all([tecnica, tatica, consistencia])
        db.session.commit()
        ids.update(tecnica_id=tecnica.id, tatica_id=tatica.id, consistencia_id=consistencia.id)
    return ids


def _player_records(app, client, ids):
    res = client.get(f"{BASE}/player/{ids['student_id']}/evaluations", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()["records"]


def _record_share(app, client, ids, record_id):
    (record,) = [r for r in _player_records(app, client, ids) if r["id"] == record_id]
    return record["share"]


def _quiet_share(client, record_id, headers, body):
    """POST .../share with every push sender patched out — the setup step for
    tests whose subject is something other than the zero-push guarantee."""
    with patch(PATCH_PUBLISH), patch(PATCH_WEB_PUSH), patch(PATCH_EXPO_PUSH):
        return client.post(SHARE_PATH.format(id=record_id), json=body, headers=headers)


# ── nothing shared by default (rule 1) ───────────────────────────────────────


def test_nothing_is_shared_by_default(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 4, dt.datetime(2026, 9, 21, 9, 0))

    assert _record_share(app, client, ids, record_id) is None

    res = client.get(MY_EVALUATIONS_PATH, headers=_headers(app, ids["student_user_id"]))
    assert res.status_code == 200 and res.get_json() == {"cards": []}, res.get_data(as_text=True)


# ── sharing nothing is refused (rule 6) ──────────────────────────────────────


def test_sharing_with_no_competency_chosen_is_refused_and_share_stays_null(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))

    res = client.post(SHARE_PATH.format(id=record_id),
                       json={"categoryIds": [], "evolution": "none", "includeNote": False},
                       headers=_coach_headers(app, ids))

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "category_ids_invalid"}
    assert _record_share(app, client, ids, record_id) is None


# ── each 400 of decision 2 ───────────────────────────────────────────────────


def test_category_ids_invalid_when_not_a_list_or_an_id_is_not_rated_in_the_record(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    headers = _coach_headers(app, ids)

    not_a_list = client.post(SHARE_PREVIEW_PATH.format(id=record_id),
                              json={"categoryIds": "abc", "evolution": "none", "includeNote": False}, headers=headers)
    # volley was never rated in this record
    unrated = client.post(SHARE_PATH.format(id=record_id),
                           json={"categoryIds": [ids["volley_id"]], "evolution": "none", "includeNote": False},
                           headers=headers)

    for res in (not_a_list, unrated):
        assert res.status_code == 400, res.get_data(as_text=True)
        assert res.get_json() == {"error": "category_ids_invalid"}
    assert _record_share(app, client, ids, record_id) is None


def test_evolution_400_when_missing_or_not_one_of_the_four_values(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    headers = _coach_headers(app, ids)

    missing = client.post(SHARE_PREVIEW_PATH.format(id=record_id),
                           json={"categoryIds": [ids["forehand_id"]], "includeNote": False}, headers=headers)
    unknown = client.post(SHARE_PREVIEW_PATH.format(id=record_id),
                           json={"categoryIds": [ids["forehand_id"]], "evolution": "yearly", "includeNote": False},
                           headers=headers)

    for res in (missing, unknown):
        assert res.status_code == 400, res.get_data(as_text=True)
        assert res.get_json() == {"error": "evolution_invalid"}


def test_include_note_400_when_missing_or_not_a_bool(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    headers = _coach_headers(app, ids)

    missing = client.post(SHARE_PREVIEW_PATH.format(id=record_id),
                           json={"categoryIds": [ids["forehand_id"]], "evolution": "none"}, headers=headers)
    not_bool = client.post(SHARE_PREVIEW_PATH.format(id=record_id),
                            json={"categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": "true"},
                            headers=headers)

    for res in (missing, not_bool):
        assert res.status_code == 400, res.get_data(as_text=True)
        assert res.get_json() == {"error": "include_note_required"}


# ── 403 not-owner, 404 unknown record (rule 12) ──────────────────────────────


def test_403_when_the_record_belongs_to_another_coach(app, client):
    ids = _seed(app)
    other = _other_coach(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    headers = _headers(app, other["user_id"])
    body = {"categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": False}

    preview = client.post(SHARE_PREVIEW_PATH.format(id=record_id), json=body, headers=headers)
    share = client.post(SHARE_PATH.format(id=record_id), json=body, headers=headers)
    unshare = client.delete(UNSHARE_PATH.format(id=record_id), headers=headers)

    for res in (preview, share, unshare):
        assert res.status_code == 403, res.get_data(as_text=True)
        assert res.get_json() == {"error": "not_your_record"}


def test_404_when_the_record_does_not_exist(app, client):
    ids = _seed(app)
    headers = _coach_headers(app, ids)
    body = {"categoryIds": [1], "evolution": "none", "includeNote": False}

    preview = client.post(SHARE_PREVIEW_PATH.format(id=999999), json=body, headers=headers)
    share = client.post(SHARE_PATH.format(id=999999), json=body, headers=headers)
    unshare = client.delete(UNSHARE_PATH.format(id=999999), headers=headers)

    for res in (preview, share, unshare):
        assert res.status_code == 404, res.get_data(as_text=True)
        assert res.get_json() == {"error": "record_not_found"}


# ── one line per chosen competency, over the chosen period (rules 3, 5) ─────


def test_one_evolution_line_per_chosen_competency_over_last_in_competency_order(app, client):
    ids = _three_competencies(app, _seed(app))
    # the earlier record (2026-09-14): Técnica 3, Tática 3 — no Consistência yet
    _rated(app, ids, ids["tecnica_id"], 3, dt.datetime(2026, 9, 14, 9, 0))
    _rated(app, ids, ids["tatica_id"], 3, dt.datetime(2026, 9, 14, 9, 0))
    # this record (2026-09-21): Técnica 4, Tática 3, Consistência 4 (first time)
    record_id = _rated(app, ids, ids["tecnica_id"], 4, dt.datetime(2026, 9, 21, 9, 0))
    _rated(app, ids, ids["tatica_id"], 3, dt.datetime(2026, 9, 21, 9, 0))
    _rated(app, ids, ids["consistencia_id"], 4, dt.datetime(2026, 9, 21, 9, 0))

    res = client.post(SHARE_PREVIEW_PATH.format(id=record_id), headers=_coach_headers(app, ids), json={
        "categoryIds": [ids["tecnica_id"], ids["tatica_id"], ids["consistencia_id"]],
        "evolution": "last", "includeNote": False,
    })

    assert res.status_code == 200, res.get_data(as_text=True)
    card = res.get_json()
    assert card["ratings"] == [
        {"name": "Técnica", "key": "technique.tecnica", "score": 4, "scaleMin": 1, "scaleMax": 5},
        {"name": "Tática", "key": "tactics.tatica", "score": 3, "scaleMin": 1, "scaleMax": 5},
        {"name": "Consistência", "key": "tactics.consistencia", "score": 4, "scaleMin": 1, "scaleMax": 5},
    ]
    assert card["evolution"] == [
        {"name": "Técnica", "key": "technique.tecnica", "delta": 1.0},
        {"name": "Tática", "key": "tactics.tatica", "delta": 0.0},
    ]  # Consistência has a rating and no line — nothing earlier to compare


def test_the_joao_silva_card_over_six_months_deltas_half_a_point(app, client):
    """evaluations/sharing.spec.md "The João Silva card over six months": the
    evolution.spec.md dataset (also test_pad364_evolution_and_class_api.LEAF_DATASET) —
    reused here so the two leaves cannot silently disagree on the arithmetic."""
    ids = _seed(app)
    bandeja_id = _leaf_bandeja(app, ids)
    from padel_app.models import EvaluationRecord

    with app.app_context():
        record_id = EvaluationRecord.query.filter_by(
            coach_player_id=ids["rel_id"], evaluated_on=dt.date(2026, 9, 21)
        ).one().id

    res = client.post(SHARE_PREVIEW_PATH.format(id=record_id), headers=_coach_headers(app, ids), json={
        "categoryIds": [bandeja_id], "evolution": "6m", "includeNote": False,
    })

    assert res.status_code == 200, res.get_data(as_text=True)
    # September 4.0 minus June 3.5; March (2026-03-05, -19) is entirely before the
    # 2026-03-21 cutoff (today − 6 months) and so is out of the window.
    assert res.get_json()["evolution"] == [{"name": "Bandeja", "key": "bandeja", "delta": 0.5}]


# ── sharing stores an instant and sends one message, no push (rules 7, 8) ───


def test_sharing_stores_the_instant_and_sends_exactly_one_system_message_no_push(app, client, monkeypatch):
    from padel_app.models import EvaluationShare, Message

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 13, 0))
    instant = dt.datetime(2026, 9, 21, 14, 5, 11)
    pin_clock(monkeypatch, instant)

    with patch(PATCH_PUBLISH) as mock_publish, patch(PATCH_WEB_PUSH) as mock_web_push, \
         patch(PATCH_EXPO_PUSH) as mock_expo_push:
        res = client.post(SHARE_PATH.format(id=record_id), headers=_coach_headers(app, ids), json={
            "categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": False,
        })

    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        share = EvaluationShare.query.filter_by(record_id=record_id).first()
        assert share is not None
        assert share.shared_at == instant
        assert share.category_ids == [ids["forehand_id"]]
        assert share.card["note"] is None
        assert Message.query.filter_by(message_type="system").count() == 1
    mock_publish.assert_called_once()
    mock_web_push.assert_not_called()
    mock_expo_push.assert_not_called()


# ── preview writes nothing (rule 3 / AV-042) ─────────────────────────────────


def test_preview_writes_nothing(app, client):
    from padel_app.models import EvaluationShare, Message

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))

    with patch(PATCH_PUBLISH) as mock_publish, patch(PATCH_WEB_PUSH), patch(PATCH_EXPO_PUSH):
        res = client.post(SHARE_PREVIEW_PATH.format(id=record_id), headers=_coach_headers(app, ids), json={
            "categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": False,
        })

    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert EvaluationShare.query.count() == 0
        assert Message.query.count() == 0
    mock_publish.assert_not_called()
    assert _record_share(app, client, ids, record_id) is None


# ── switching a competency off later changes no shared card (rule 7) ────────


def test_switching_a_shared_competency_off_does_not_change_the_stored_card(app, client):
    from padel_app.models import EvaluationShare

    ids = _three_competencies(app, _seed(app))
    record_id = _rated(app, ids, ids["tecnica_id"], 4, dt.datetime(2026, 9, 21, 9, 0))
    headers = _coach_headers(app, ids)
    shared = _quiet_share(client, record_id, headers, {
        "categoryIds": [ids["tecnica_id"]], "evolution": "none", "includeNote": False,
    })
    assert shared.status_code == 200, shared.get_data(as_text=True)
    with app.app_context():
        original_card = EvaluationShare.query.filter_by(record_id=record_id).first().card

    off = client.patch(f"{BASE}/evaluation_competency/{ids['tecnica_id']}", json={"isActive": False}, headers=headers)
    assert off.status_code == 200, off.get_data(as_text=True)

    with app.app_context():
        assert EvaluationShare.query.filter_by(record_id=record_id).first().card == original_card


# ── Record.share populated after share (decision 6) ──────────────────────────


def test_record_share_is_populated_from_the_row_after_sharing(app, client):
    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    headers = _coach_headers(app, ids)

    res = _quiet_share(client, record_id, headers, {
        "categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": False,
    })

    assert res.status_code == 200, res.get_data(as_text=True)
    share = _record_share(app, client, ids, record_id)
    assert share is not None
    assert set(share) >= {"sharedAt", "categoryIds", "evolution", "includeNote", "stale"}
    assert share["categoryIds"] == [ids["forehand_id"]]
    assert share["evolution"] == "none"
    assert share["includeNote"] is False
    assert share["stale"] is False


# ── un-share is silent (rule 9) ──────────────────────────────────────────────


def test_unsharing_is_silent(app, client):
    """Seeds the share directly through the ORM (the model/migration already
    exist) so this test's RED, if any, is about DELETE .../share alone —
    not entangled with the also-missing POST .../share."""
    from padel_app.models import EvaluationShare, Message

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    with app.app_context():
        db.session.add(EvaluationShare(
            record_id=record_id, shared_at=dt.datetime(2026, 9, 21, 9, 5, 0),
            category_ids=[ids["forehand_id"]], evolution="none", include_note=False,
            card={"recordId": record_id, "coachName": "Test Coach", "evaluatedOn": "2026-09-21",
                  "className": None, "sharedAt": "2026-09-21T09:05:00",
                  "ratings": [{"name": "Forehand", "key": None, "score": 7, "scaleMin": 1, "scaleMax": 10}],
                  "evolution": [], "evolutionPeriod": "none", "note": None},
        ))
        db.session.commit()
        messages_before = Message.query.count()

    with patch(PATCH_PUBLISH) as mock_publish, patch(PATCH_WEB_PUSH) as mock_web_push, \
         patch(PATCH_EXPO_PUSH) as mock_expo_push:
        res = client.delete(UNSHARE_PATH.format(id=record_id), headers=_coach_headers(app, ids))

    assert res.status_code == 200, res.get_data(as_text=True)
    mock_publish.assert_not_called()
    mock_web_push.assert_not_called()
    mock_expo_push.assert_not_called()
    with app.app_context():
        assert EvaluationShare.query.filter_by(record_id=record_id).first() is None
        assert Message.query.count() == messages_before  # un-sharing notifies nobody
    assert _record_share(app, client, ids, record_id) is None


# ── deleting a shared record removes the share (rule 9) ─────────────────────


def test_deleting_a_shared_record_removes_the_share(app, client):
    """Seeded directly through the ORM: this is the FK CASCADE + `delete-orphan`
    backref the model/migration already carry, independent of the not-yet-built
    write path — it may already be GREEN, which is fine (see module docstring)."""
    from padel_app.models import EvaluationShare

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime(2026, 9, 21, 9, 0))
    with app.app_context():
        db.session.add(EvaluationShare(
            record_id=record_id, shared_at=dt.datetime(2026, 9, 21, 9, 5, 0),
            category_ids=[ids["forehand_id"]], evolution="none", include_note=False,
            card={"recordId": record_id, "coachName": "Test Coach", "evaluatedOn": "2026-09-21",
                  "className": None, "sharedAt": "2026-09-21T09:05:00", "ratings": [], "evolution": [],
                  "evolutionPeriod": "none", "note": None},
        ))
        db.session.commit()

    res = client.delete(f"{BASE}/evaluation_record/{record_id}", headers=_coach_headers(app, ids))

    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert EvaluationShare.query.filter_by(record_id=record_id).first() is None


# ── the stale flag (decision 7) — real clock only, NEVER pin_clock ──────────
#
# `stale` is `record.updated_at > share.shared_at`. `updated_at` is the base
# model mixin's column default/onupdate (`padel_app/model.py:96-99`, plain
# `datetime.utcnow`) — `pin_clock` only rebinds `padel_app.utils.dates.
# utcnow_naive` by name, so it does NOT touch `updated_at`. Pinning the clock in
# these tests would make `shared_at` (set through `utcnow_naive()`, once A2
# wires it) follow the pin while `updated_at` keeps following the real clock —
# an accidental, environment-dependent ordering. So these two tests run
# entirely on the real wall clock, with short sleeps to guarantee ordering.


def test_stale_is_false_right_after_sharing_and_true_after_an_edit(app, client):
    """Seeded directly through the ORM (see module docstring): isolates the
    READ side (`serialize_record`'s future `share.stale`) from the also-missing
    POST .../share, and from pin_clock entirely."""
    from padel_app.models import EvaluationShare

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 7, dt.datetime.utcnow())
    time.sleep(0.1)  # real clock: guarantee shared_at strictly follows the record's creation
    shared_at = dt.datetime.utcnow()
    with app.app_context():
        db.session.add(EvaluationShare(
            record_id=record_id, shared_at=shared_at, category_ids=[ids["forehand_id"]],
            evolution="none", include_note=False,
            card={"recordId": record_id, "coachName": "Test Coach", "evaluatedOn": None, "className": None,
                  "sharedAt": shared_at.isoformat(), "ratings": [], "evolution": [], "evolutionPeriod": "none",
                  "note": None},
        ))
        db.session.commit()

    share = _record_share(app, client, ids, record_id)
    assert share is not None, 'serialize_record must read record.share from the row (currently hard-coded None)'
    assert share["stale"] is False

    time.sleep(0.1)  # real clock: guarantee the edit's updated_at strictly follows shared_at
    edit = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json={
        "playerId": ids["student_id"], "recordId": record_id, "note": "edited after sharing",
    })
    assert edit.status_code == 200, edit.get_data(as_text=True)

    assert _record_share(app, client, ids, record_id)["stale"] is True


def test_resharing_moves_sharedat_updates_the_card_and_clears_staleness_with_no_second_message(app, client):
    from padel_app.models import EvaluationShare, Message

    ids = _seed(app)
    record_id = _rated(app, ids, ids["forehand_id"], 4, dt.datetime.utcnow())
    headers = _coach_headers(app, ids)
    body = {"categoryIds": [ids["forehand_id"]], "evolution": "none", "includeNote": False}

    first = _quiet_share(client, record_id, headers, body)
    assert first.status_code == 200, first.get_data(as_text=True)
    with app.app_context():
        first_share = EvaluationShare.query.filter_by(record_id=record_id).first()
        first_shared_at, first_card = first_share.shared_at, first_share.card

    time.sleep(0.1)
    edit = client.put(f"{BASE}/evaluation_record", headers=headers, json={
        "playerId": ids["student_id"], "recordId": record_id, "ratings": {str(ids["forehand_id"]): 9},
    })
    assert edit.status_code == 200, edit.get_data(as_text=True)
    assert _record_share(app, client, ids, record_id)["stale"] is True  # unchanged card, but stale now

    time.sleep(0.1)
    with patch(PATCH_PUBLISH) as mock_publish, patch(PATCH_WEB_PUSH) as mock_web_push, \
         patch(PATCH_EXPO_PUSH) as mock_expo_push:
        second = client.post(SHARE_PATH.format(id=record_id), headers=headers, json=body)
    assert second.status_code == 200, second.get_data(as_text=True)
    mock_publish.assert_not_called()  # re-sharing (rule 7) sends no message
    mock_web_push.assert_not_called()
    mock_expo_push.assert_not_called()

    with app.app_context():
        second_share = EvaluationShare.query.filter_by(record_id=record_id).first()
        assert second_share.shared_at > first_shared_at
        assert second_share.card != first_card  # the frozen snapshot picked up the new score
        assert Message.query.filter_by(message_type="system").count() == 1  # only the FIRST share notified
    assert _record_share(app, client, ids, record_id)["stale"] is False
