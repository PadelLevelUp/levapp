"""PAD-498 (B-276, auth.password-recovery rule 9): a password-recovery code belongs to the address it was
mailed to. When an account's email changes or is cleared, any pending recovery code is discarded, so it
can never vouch for an address it was not sent to. A recovery started and finished on the same address
is unchanged.
"""
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_password_recovery import (  # noqa: F401
    NEW,
    OLD,
    _code_from,
    _confirm,
    _jwt_secret,
    _request,
    _user,
    ana,
    outbox,
)

NEW_ADDRESS = "ana.new@example.com"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _code_for_ana(client, outbox):
    assert _request(client).status_code == 200
    return _code_from(outbox[-1])


def _pending_code(app, user_id):
    user = _user(app, user_id)
    return (user.password_reset_code_hash, user.password_reset_expires_at, user.password_reset_sent_at)


def test_a_code_does_not_survive_a_change_of_address(client, app, ana, outbox):
    """Criterion "A recovery code does not survive an email change"."""
    code = _code_for_ana(client, outbox)
    assert client.patch("/api/auth/me", json={"email": NEW_ADDRESS}, headers=_auth(app, ana)).status_code == 200
    assert _pending_code(app, ana) == (None, None, None)

    res = _confirm(client, code, email=NEW_ADDRESS)

    assert res.status_code == 410 and res.get_json()["error"] == "CODE_EXPIRED"
    user = _user(app, ana)
    assert user.email_verified_at is None, "the new address was never proved"
    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": OLD}).status_code == 200


def test_a_code_does_not_survive_clearing_the_address_and_adding_another(client, app, ana, outbox):
    code = _code_for_ana(client, outbox)
    headers = _auth(app, ana)
    assert client.patch("/api/auth/me", json={"email": ""}, headers=headers).status_code == 200
    assert client.patch("/api/auth/me", json={"email": NEW_ADDRESS}, headers=headers).status_code == 200

    res = _confirm(client, code, email=NEW_ADDRESS)

    assert res.status_code == 410
    assert _user(app, ana).email_verified_at is None


def test_re_saving_the_same_address_keeps_the_code(client, app, ana, outbox):
    """Not a change: the same address in another case leaves a pending recovery alone."""
    code = _code_for_ana(client, outbox)
    assert client.patch("/api/auth/me", json={"email": "ANA@example.com"}, headers=_auth(app, ana)).status_code == 200

    res = _confirm(client, code)

    assert res.status_code == 200
    assert _user(app, ana).email_verified_at is not None


def test_a_recovery_on_an_unchanged_address_works_as_before(client, app, ana, outbox):
    """Criterion "A recovery on an unchanged address is unchanged": it resets the password and, as it
    always did, marks that address verified."""
    code = _code_for_ana(client, outbox)

    res = _confirm(client, code)

    assert res.status_code == 200 and res.get_json()["accessToken"]
    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": NEW}).status_code == 200
    assert _user(app, ana).email_verified_at is not None


def test_any_write_of_a_new_address_discards_the_code(client, app, ana, outbox):
    """The rule holds for every path that writes `users.email` (activation, claim, deletion, a form), not
    only the profile endpoint: it lives on the model."""
    from padel_app.models import User

    _code_for_ana(client, outbox)
    with app.app_context():
        user = db.session.get(User, ana)
        user.email = NEW_ADDRESS
        db.session.commit()

    assert _pending_code(app, ana) == (None, None, None)


def test_a_write_after_a_commit_that_never_read_the_address_still_discards_the_code(client, app, ana, outbox):
    """The old value is expired after a commit; the rule must not depend on someone having read it."""
    from padel_app.models import User

    _code_for_ana(client, outbox)
    with app.app_context():
        user = db.session.get(User, ana)
        user.name = "Ana S."
        db.session.commit()  # expires every attribute, email included
        user.email = NEW_ADDRESS
        db.session.commit()

    assert _pending_code(app, ana) == (None, None, None)

