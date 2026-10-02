"""
auth.register rule 12 and clubs.coach-invitation (PAD-476, B-246): creating a coach account is
one transaction. A failure after the default levels exist leaves no account, and the same
request can then be retried.

The failure is injected AFTER the real `create_default_levels_for_coach` has run, so the
helper's own writes (and, before PAD-476, its own commit) are inside what is tested.
`test_registration_is_atomic` replaced the helper with a stub that raised before doing
anything, so the helper's commit never ran there (B-246).

Run:
    pytest padel_app/tests/test_pad476_registration_is_one_transaction.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_coach_invitation import _inv, _make_coach_with_club, _make_invitation
from padel_app.tests.test_registration import _coach, _count, _student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    app.config["PROPAGATE_EXCEPTIONS"] = False  # Flask answers 500, as in prod


def _fail_after_real_levels(monkeypatch):
    """Run the real default-levels helper, then fail: the step after the levels."""
    from padel_app.services import coach_service

    real = coach_service.create_default_levels_for_coach

    def real_then_fail(coach):
        real(coach)
        raise RuntimeError("failure after the default levels")

    monkeypatch.setattr(coach_service, "create_default_levels_for_coach", real_then_fail)


# --- Self-registration (auth.register rule 12) ---------------------------------------


def test_coach_signup_failing_after_the_levels_leaves_no_account(client, app, monkeypatch):
    from padel_app.models import Coach, CoachLevel, User

    _fail_after_real_levels(monkeypatch)
    res = client.post("/api/auth/register", json=_coach())

    assert res.status_code == 500
    assert (_count(app, User), _count(app, Coach), _count(app, CoachLevel)) == (0, 0, 0)


def test_a_failed_coach_signup_can_be_retried(client, app, monkeypatch):
    from padel_app.models import Coach, CoachLevel, User

    _fail_after_real_levels(monkeypatch)
    assert client.post("/api/auth/register", json=_coach()).status_code == 500
    monkeypatch.undo()
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"

    retry = client.post("/api/auth/register", json=_coach())

    assert retry.status_code == 201, retry.get_json()
    assert (_count(app, User), _count(app, Coach), _count(app, CoachLevel)) == (1, 1, 3)


def test_a_failed_coach_signup_sends_no_mail_no_admin_notice_and_no_sync(client, app, monkeypatch):
    """Outside effects run only after the transaction commits, never when it rolls back."""
    from padel_app.services import coach_approval_service, email_verification_service, hubspot_sync

    sent = []
    monkeypatch.setattr(email_verification_service, "begin_verification", lambda user: sent.append("mail"))
    monkeypatch.setattr(coach_approval_service, "notify_admin_of_pending_coach", lambda coach: sent.append("admin"))
    monkeypatch.setattr(hubspot_sync, "sync_coach_signup", lambda user, coach: sent.append("sync"))
    _fail_after_real_levels(monkeypatch)

    assert client.post("/api/auth/register", json=_coach()).status_code == 500
    assert sent == []


def test_a_successful_coach_signup_sends_them_after_the_commit(client, app, monkeypatch):
    """The other half: the same spies see all three on a good sign-up, so the test above is not
    green because the spies are wired wrong. (That they run after the commit is pinned by
    test_pad471_hubspot_coach_sync.test_signup_syncs_only_after_its_commit.)"""
    from padel_app.services import coach_approval_service, email_verification_service, hubspot_sync

    seen = []
    monkeypatch.setattr(email_verification_service, "begin_verification", lambda user: seen.append("mail"))
    monkeypatch.setattr(coach_approval_service, "notify_admin_of_pending_coach", lambda coach: seen.append("admin"))
    monkeypatch.setattr(hubspot_sync, "sync_coach_signup", lambda user, coach: seen.append("sync"))
    monkeypatch.setattr("padel_app.services.app_settings_service.coach_approval_required", lambda: True)

    assert client.post("/api/auth/register", json=_coach()).status_code == 201
    assert seen == ["mail", "admin", "sync"]


def test_student_signup_failing_at_its_commit_leaves_no_account(client, app, monkeypatch):
    """Control: the student path has one commit. A failure there leaves nothing."""
    from padel_app.models import Player, User

    real_commit = db.session.commit

    def fail_commit():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    res = client.post("/api/auth/register", json=_student())
    monkeypatch.setattr(db.session, "commit", real_commit)

    assert res.status_code == 500
    assert (_count(app, User), _count(app, Player)) == (0, 0)


# --- Invited coach accepts as a new user (clubs.coach-invitation) ---------------------


def _accept_body():
    return {"birthDate": "1990-01-01", "name": "New Coach", "username": "new_coach", "password": "Secret123!"}


def test_invited_coach_failing_after_the_levels_leaves_no_account(client, app, monkeypatch):
    from padel_app.models import Association_CoachClub, Coach, CoachLevel, User

    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    _fail_after_real_levels(monkeypatch)

    res = client.post(f"/api/app/coach-invitations/{token}/accept", json=_accept_body())

    assert res.status_code == 500
    with app.app_context():
        assert User.query.filter_by(username="new_coach").count() == 0
        # Only the inviter's Coach row, its club link, and no levels at all.
        assert Coach.query.count() == 1
        assert CoachLevel.query.count() == 0
        assert Association_CoachClub.query.count() == 1
        assert _inv(token).one().status == "pending"


def test_invited_coach_failing_at_the_club_link_leaves_no_account(client, app, monkeypatch):
    """A later failure point than the levels: the commit that would write the club link fails.
    Any commit before it (the B-246 shape) would already have persisted the account."""
    from padel_app.models import Association_CoachClub, User

    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    real_commit = db.session.commit

    def commit_unless_club_link():
        if any(isinstance(o, Association_CoachClub) for o in db.session.new):
            raise RuntimeError("club link failed")
        return real_commit()

    monkeypatch.setattr(db.session, "commit", commit_unless_club_link)
    res = client.post(f"/api/app/coach-invitations/{token}/accept", json=_accept_body())
    monkeypatch.setattr(db.session, "commit", real_commit)

    assert res.status_code == 500
    with app.app_context():
        assert User.query.filter_by(username="new_coach").count() == 0
        assert _inv(token).one().status == "pending"


def test_a_failed_invitation_accept_can_be_retried(client, app, monkeypatch):
    from padel_app.models import CoachLevel, User

    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    _fail_after_real_levels(monkeypatch)
    assert client.post(f"/api/app/coach-invitations/{token}/accept", json=_accept_body()).status_code == 500
    monkeypatch.undo()
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"

    retry = client.post(f"/api/app/coach-invitations/{token}/accept", json=_accept_body())

    assert retry.status_code == 200, retry.get_json()
    with app.app_context():
        user = User.query.filter_by(username="new_coach").one()
        assert CoachLevel.query.filter_by(coach_id=user.coach.id).count() == 3
        assert _inv(token).one().status == "accepted"



# --- The helper inside a unit of work ------------------------------------------------


def test_the_levels_helper_inside_a_unit_returns_its_levels_and_stays_idempotent(app):
    """Inside a unit the helper flushes instead of committing. Its return value and its
    "already has levels" check must still see the rows it just wrote."""
    from padel_app.models import Coach, CoachLevel, User
    from padel_app.services.coach_service import create_default_levels_for_coach
    from padel_app.tools.unit_of_work import unit_of_work

    with app.app_context():
        with unit_of_work():
            user = User(name="Lia", username="lia", password="pw", status="active")
            db.session.add(user)
            db.session.flush()
            coach = Coach(user_id=user.id)
            db.session.add(coach)
            db.session.flush()

            first = create_default_levels_for_coach(coach)
            second = create_default_levels_for_coach(coach)

            assert len(first) == 3
            assert len(second) == 3
        assert CoachLevel.query.filter_by(coach_id=coach.id).count() == 3
