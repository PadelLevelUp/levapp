"""Shared helpers for the PAD-531 admin console tests (admin.foundation)."""
from padel_app.sql_db import db

CLIENT_ID = "test-google-client-id.apps.googleusercontent.com"


def signing(app):
    """Test apps load config from a mapping: give them a signing secret, as the product tests do."""
    # Flask-JWT-Extended's init_app sets the key to None, so setdefault is a no-op.
    if not app.config.get("JWT_SECRET_KEY"):
        app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    return app


def make_role(app, email, role="operator", revoked=False, user_id=None):
    """An admin_roles row; returns its id."""
    from padel_app.models.admin_role import AdminRole
    from padel_app.utils.dates import utcnow_naive

    signing(app)
    with app.app_context():
        row = AdminRole(email=email.lower(), role=role, user_id=user_id, granted_by_email=None)
        if revoked:
            row.revoked_at = utcnow_naive()
        db.session.add(row)
        db.session.commit()
        return row.id


def admin_token(app, role_id):
    """A real admin token for that role row (aud = levapp-admin, 12 h)."""
    from padel_app.models.admin_role import AdminRole
    from padel_app.services.admin.auth_service import mint_admin_token

    signing(app)
    with app.app_context():
        token, _ = mint_admin_token(AdminRole.query.get(role_id))
        return token


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def google_claims(email, **overrides):
    """The claims a verified company Google ID token carries; overrides replace or remove keys."""
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "email": email,
        "email_verified": True,
        "hd": "levapp.app",
        "sub": "1234567890",
    }
    for key, value in overrides.items():
        if value is None:
            claims.pop(key, None)
        else:
            claims[key] = value
    return claims


def stub_verifier(monkeypatch, claims=None, exc=None):
    """Replace the Google verifier: returns ``claims`` or raises ``exc``. Records calls."""
    from padel_app.services.admin import google_verifier

    calls = []

    def fake(credential, client_id):
        calls.append((credential, client_id))
        if exc is not None:
            raise exc
        return claims

    monkeypatch.setattr(google_verifier, "verify", fake)
    return calls


def audit_rows(app, action=None):
    from padel_app.models.admin_audit_log import AdminAuditLog

    with app.app_context():
        q = AdminAuditLog.query.order_by(AdminAuditLog.id)
        if action:
            q = q.filter_by(action=action)
        return [r.to_dict() for r in q.all()]


def make_user(app, username, email=None, superadmin=False, status="active"):
    from padel_app.models import User

    signing(app)
    with app.app_context():
        user = User(name=username, username=username, email=email, password="x", status=status,
                    is_superadmin=superadmin)
        db.session.add(user)
        db.session.commit()
        return user.id
