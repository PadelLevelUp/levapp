"""
clubs.coach-invitation rule 9 (PAD-477, B-241): a coach who joins by club invitation as a new
user gives an email, validated as sign-up validates it, and confirms it with the same code
(auth.email-verification). Owner decision 2026-10-02.

Run:
    pytest padel_app/tests/test_pad477_invited_coach_confirms_email.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_coach_invitation import (
    _auth_header,
    _inv,
    _make_coach_with_club,
    _make_coach_without_club,
    _make_invitation,
)
from padel_app.tests.test_email_verification import outbox  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    app.config["PROPAGATE_EXCEPTIONS"] = False


def _body(**over):
    body = {
        "name": "Rita Coach",
        "username": "rita_coach",
        "password": "Secret123!",
        "birthDate": "1990-01-01",
        "email": "Rita@Example.com",
    }
    body.update(over)
    return body


def _invitation(app):
    _, coach_id, club_id = _make_coach_with_club(app)
    return _make_invitation(app, club_id, coach_id), club_id


# The token a client declares when its accept form sends the email (rule 9).
CAPABLE = {"X-LevApp-Capabilities": "open-spots, coach-invite-email"}


def _accept(client, token, headers=CAPABLE, **over):
    return client.post(f"/api/app/coach-invitations/{token}/accept", json=_body(**over), headers=headers)


def test_an_invited_coach_is_pending_with_a_code_sent_to_their_email(client, app, outbox):
    from padel_app.models import Association_CoachClub, User

    token, club_id = _invitation(app)
    res = _accept(client, token)

    assert res.status_code == 200, res.get_json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {res.get_json()['accessToken']}"})
    assert me.get_json()["emailVerification"] == "pending"
    assert [m["recipients"] for m in outbox] == [["rita@example.com"]]
    with app.app_context():
        user = User.query.filter_by(username="rita_coach").one()
        assert user.email == "rita@example.com"
        assert Association_CoachClub.query.filter_by(coach_id=user.coach.id, club_id=club_id).count() == 1
        assert _inv(token).one().status == "accepted"


def test_a_capable_client_without_an_email_is_400_email_required_and_writes_nothing(client, app, outbox):
    """Criterion (e)."""
    from padel_app.models import User

    token, _ = _invitation(app)
    body = _body()
    del body["email"]
    res = client.post(f"/api/app/coach-invitations/{token}/accept", json=body, headers=CAPABLE)

    assert res.status_code == 400
    assert res.get_json()["field"] == "email"
    assert res.get_json()["code"] == "EMAIL_REQUIRED"
    with app.app_context():
        assert User.query.filter_by(username="rita_coach").count() == 0
        assert _inv(token).one().status == "pending"
    assert outbox == []


def test_a_build_that_predates_the_field_accepts_as_before_pad_477(client, app, outbox):
    """Criterion (d), the legacy path: builds up to 1.2.1 (28) declare no `coach-invite-email`
    and send no email. They keep today's behaviour: the account is created without an email,
    no code is sent, and the state is "unverified" (never held). Remove with the token."""
    from padel_app.models import User

    token, club_id = _invitation(app)
    body = _body()
    del body["email"]
    res = client.post(
        f"/api/app/coach-invitations/{token}/accept",
        json=body,
        headers={"X-LevApp-Capabilities": "open-spots, evaluations, class-type-defaults"},
    )

    assert res.status_code == 200, res.get_json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {res.get_json()['accessToken']}"})
    assert me.get_json()["emailVerification"] == "unverified"
    assert outbox == []
    with app.app_context():
        user = User.query.filter_by(username="rita_coach").one()
        assert user.email is None
        assert _inv(token).one().status == "accepted"


def test_an_old_build_that_does_send_an_email_gets_the_full_rule(client, app, outbox):
    """Any request that sends an email, from any build, is validated and verified."""
    token, _ = _invitation(app)
    res = _accept(client, token, headers={})

    assert res.status_code == 200, res.get_json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {res.get_json()['accessToken']}"})
    assert me.get_json()["emailVerification"] == "pending"
    assert [m["recipients"] for m in outbox] == [["rita@example.com"]]


def test_a_malformed_email_is_400_on_the_email_field(client, app):
    token, _ = _invitation(app)
    res = _accept(client, token, email="not-an-address")

    assert res.status_code == 400
    assert res.get_json()["field"] == "email"


def test_a_taken_email_in_any_case_is_409_on_the_email_field(client, app, outbox):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Owner", username="owner", password="pw", status="active", email="rita@example.com"))
        db.session.commit()
    token, _ = _invitation(app)
    res = _accept(client, token, email="RITA@example.com")

    assert res.status_code == 409, res.get_json()
    assert res.get_json()["field"] == "email"
    with app.app_context():
        assert User.query.filter_by(username="rita_coach").count() == 0
        assert _inv(token).one().status == "pending"
    assert outbox == []


def test_no_code_is_sent_when_the_accept_rolls_back(client, app, outbox, monkeypatch):
    """The code is an outside effect: it goes out only after the unit of work commits."""
    from padel_app.models import User
    from padel_app.services import coach_service

    real = coach_service.create_default_levels_for_coach

    def real_then_fail(coach):
        real(coach)
        raise RuntimeError("failure after the default levels")

    monkeypatch.setattr(coach_service, "create_default_levels_for_coach", real_then_fail)
    token, _ = _invitation(app)
    res = _accept(client, token)

    assert res.status_code == 500
    assert outbox == []
    with app.app_context():
        assert User.query.filter_by(username="rita_coach").count() == 0


def test_an_existing_coach_accepting_keeps_their_verification_state_and_gets_no_code(client, app, outbox):
    """Rule 5, unchanged by PAD-477 (no client calls it today): it only links the club."""
    from padel_app.models import User

    _, inviter_coach_id, club_id = _make_coach_with_club(app)
    outsider_user_id, _ = _make_coach_without_club(app)
    with app.app_context():
        user = db.session.get(User, outsider_user_id)
        user.email = "outsider@example.com"
        db.session.commit()
    token = _make_invitation(app, club_id, inviter_coach_id)

    res = client.post(
        f"/api/app/coach-invitations/{token}/accept",
        json={},
        headers=_auth_header(app, outsider_user_id),
    )

    assert res.status_code == 200
    assert res.get_json() == {"success": True}
    assert outbox == []
    with app.app_context():
        user = db.session.get(User, outsider_user_id)
        assert user.email_verified_at is None
        assert not user.email_verification_required


@pytest.mark.parametrize("headers,expected", [(CAPABLE, 400), ({}, 200)])
def test_a_blank_email_counts_as_none(client, app, outbox, headers, expected):
    """Whitespace only is no email: refused from a declaring client, the legacy accept otherwise."""
    token, _ = _invitation(app)
    res = _accept(client, token, headers=headers, email="   ")

    assert res.status_code == expected, res.get_json()
    assert outbox == []


def test_pad477_capability_spelling_matches_both_shells():
    """Each shell pins its own declaration; this ties both to the server's constant, so a typo in a
    shell cannot put a capable build on the legacy path."""
    from pathlib import Path

    from padel_app.utils.client_capabilities import COACH_INVITE_EMAIL

    frontend = Path(__file__).resolve().parents[3] / "frontend"
    for shell in ("apps/web/src/api/client.ts", "apps/mobile/src/lib/api.ts"):
        source = (frontend / shell).read_text()
        assert f'"{COACH_INVITE_EMAIL}"' in source, f"{shell} does not declare {COACH_INVITE_EMAIL}"


# --- #500 independent review ------------------------------------------------------------


def test_the_code_is_mailed_with_no_unit_of_work_open(client, app, monkeypatch):
    """Rule 4/9: the code goes out AFTER the unit has committed, not at its end inside it."""
    from padel_app.tools import email_tools, unit_of_work

    at_send = []
    monkeypatch.setattr(
        email_tools, "send_email",
        lambda subject, recipients, body=None, html=None: at_send.append(unit_of_work.active()) or "Sent",
    )
    token, _ = _invitation(app)

    assert _accept(client, token).status_code == 200
    assert at_send == [False]


def test_the_legacy_path_ignores_the_invitations_own_email(client, app, outbox):
    """Rule 9: the invitation's optional email is not used for the account, legacy path included."""
    from padel_app.models import User

    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id, email="typed-by-inviter@example.com")
    body = _body()
    del body["email"]
    res = client.post(f"/api/app/coach-invitations/{token}/accept", json=body)

    assert res.status_code == 200, res.get_json()
    assert outbox == []
    with app.app_context():
        assert User.query.filter_by(username="rita_coach").one().email is None


def test_a_stored_mixed_case_email_is_still_taken(client, app, outbox):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Owner", username="owner", password="pw", status="active", email="Rita@Example.com"))
        db.session.commit()
    token, _ = _invitation(app)
    res = _accept(client, token, email="rita@example.com")

    assert res.status_code == 409, res.get_json()
    assert res.get_json()["field"] == "email"


def test_the_birth_date_is_judged_before_the_email(client, app, outbox):
    """Order of checks: birthDate (PAD-457), then email. An underage capable client with no email
    hears about its age, not its email."""
    token, _ = _invitation(app)
    body = _body(birthDate="2015-01-01")
    del body["email"]
    res = client.post(f"/api/app/coach-invitations/{token}/accept", json=body, headers=CAPABLE)

    assert res.status_code == 400
    assert res.get_json()["field"] == "birthDate"
    assert res.get_json()["code"] == "UNDERAGE"


def test_a_failure_after_the_commit_still_answers_with_the_session(client, app, monkeypatch):
    """The account exists and the invitation is used, so the answer is the success; the failure is
    logged and Settings / the verify screen can send a new code (as for a mail failure)."""
    from padel_app.models import User
    from padel_app.services import email_verification_service

    def broken(user, now=None):
        raise RuntimeError("code issue failed")

    monkeypatch.setattr(email_verification_service, "begin_verification", broken)
    token, _ = _invitation(app)
    res = _accept(client, token)

    assert res.status_code == 200, res.get_json()
    assert res.get_json()["accessToken"]
    with app.app_context():
        assert User.query.filter_by(username="rita_coach").count() == 1
        assert _inv(token).one().status == "accepted"


def test_an_error_without_a_code_carries_no_code_key(client, app):
    """As sign-up's errors: `code` only when there is one."""
    with app.app_context():
        from padel_app.models import User

        db.session.add(User(name="Owner", username="owner", password="pw", status="active", email="rita@example.com"))
        db.session.commit()
    token, _ = _invitation(app)
    res = _accept(client, token)

    assert res.status_code == 409
    assert "code" not in res.get_json()


def test_the_accept_is_throttled_like_sign_up(client, app):
    """A 409 does not use the invitation, so without a throttle a pending link would answer "does
    this email have an account" for a week. The accept shares sign-up's limiter."""
    from padel_app.models import User
    from padel_app.utils.rate_limit import limiter_for

    app.config["AUTH_RATE_LIMIT_ENABLED"] = True
    app.config["AUTH_RATE_LIMIT_REGISTER"] = "2/600"
    limiter_for(app).clock = lambda: 1000
    with app.app_context():
        db.session.add(User(name="Owner", username="owner", password="pw", status="active", email="rita@example.com"))
        db.session.commit()
    token, _ = _invitation(app)

    def probe(ip):
        return client.post(
            f"/api/app/coach-invitations/{token}/accept", json=_body(), headers=CAPABLE,
            environ_base={"REMOTE_ADDR": ip},
        )

    assert probe("203.0.113.7").status_code == 409
    assert probe("203.0.113.7").status_code == 409
    third = probe("203.0.113.7")
    assert third.status_code == 429
    assert third.get_json()["error"] == "RATE_LIMITED"
    assert probe("203.0.113.8").status_code == 409
