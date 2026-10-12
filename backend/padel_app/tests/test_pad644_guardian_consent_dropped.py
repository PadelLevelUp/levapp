"""PAD-644 — the retired parental-consent data is gone (auth.parental-consent, deprecated by PAD-457).

The guardian_consents and digital_consent_ages tables, users.guardian_consent_status, the
`guardianConsent` key of /api/auth/me, config.LEGAL_TERMS_VERSION and the two login gates that
read the status are removed. users.birth_date and users.country stay: auth.register rule 18
(adults only) still reads them.
"""
import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

PASSWORD = "Segura1234"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def test_no_model_maps_the_consent_tables_or_the_status_column():
    from padel_app import models
    from padel_app.models import User

    assert not hasattr(models, "GuardianConsent")
    assert not hasattr(models, "DigitalConsentAge")
    assert {"guardian_consents", "digital_consent_ages"}.isdisjoint(db.metadata.tables)
    columns = set(User.__table__.columns.keys())
    assert "guardian_consent_status" not in columns
    assert {"birth_date", "country"} <= columns


def test_the_legal_terms_version_and_the_redaction_entry_are_gone():
    from padel_app.config import Config
    from padel_app.tools.redaction import REDACTED_COLUMNS

    assert not hasattr(Config, "LEGAL_TERMS_VERSION")
    assert "guardian_consents" not in REDACTED_COLUMNS


def test_me_has_no_guardian_consent_key_and_a_signed_in_user_keeps_their_session(client, app):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name="Ana", username="ana644", email="ana644@example.com",
                    password=generate_password_hash(PASSWORD), status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()

    res = client.post("/api/auth/login", json={"username": "ana644", "password": PASSWORD})
    assert res.status_code == 200, res.get_json()
    headers = {"Authorization": f"Bearer {res.get_json()['accessToken']}"}

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert "guardianConsent" not in me.get_json()
