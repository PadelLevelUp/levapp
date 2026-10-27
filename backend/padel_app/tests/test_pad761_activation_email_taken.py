"""PAD-761 — auth.activate rule 11a: an email another account already holds is answered 409 on
`email`, in sign-up's error shape, before anything is written.

Prod, 2026-10-27: a student activating a coach-created account typed the email of the account they
already had. The single UPDATE on `users` hit users_email_key and the route answered 500. The
coach then linked the two accounts (players.claim); this is the answer the student should have had.

    pytest padel_app/tests/test_pad761_activation_email_taken.py -v
"""
import pytest

from padel_app.tests.test_pad254_activation_token import _fresh, _inactive_user, _token


def _activate(client, app, user_id, **extra):
    body = {"token": _token(app, user_id), "name": "Bruno", "username": "bruno761",
            "password": "NewPass1!", "birthDate": "1990-01-01"}
    body.update(extra)
    return client.post(f"/api/app/activate/user/{user_id}", json=body)


def _email(app, user_id):
    from padel_app.models import User

    with app.app_context():
        return User.query.get(user_id).email


@pytest.mark.parametrize("typed", ["taken@example.com", "Taken@Example.COM", " taken@example.com "])
def test_an_email_another_account_holds_is_409_and_nothing_is_written(client, app, typed):
    _inactive_user(app, username="own-account", email="taken@example.com", status="active")
    uid = _inactive_user(app)
    res = _activate(client, app, uid, email=typed)
    assert res.status_code == 409, res.get_json()
    body = res.get_json()
    assert (body["field"], body["code"], body["error"]) == ("email", "EMAIL_TAKEN", "Email already registered")
    after = _fresh(app, uid)
    assert after["status"] == "inactive" and after["password"] in (None, "")
    assert after["username"] == "pending-b034"
    assert _email(app, uid) == "bruno@example.com"


def test_keeping_the_accounts_own_email_activates(client, app):
    uid = _inactive_user(app)  # holds bruno@example.com, prefilled by the GET
    res = _activate(client, app, uid, email="Bruno@example.com")
    assert res.status_code == 200, res.get_json()
    assert _fresh(app, uid)["status"] == "active"


def test_an_emptied_email_is_not_a_collision(client, app):
    _inactive_user(app, username="other", email=None, status="disabled")  # a merged husk has none
    uid = _inactive_user(app)
    res = _activate(client, app, uid, email="")
    assert res.status_code == 200, res.get_json()
    assert _email(app, uid) is None
