#!/usr/bin/env python
"""
Seeds the staff console's own rows for the phone E2E specs and prints a console session as JSON.

admin.phone-console rule 7: sign-in in E2E does not go through Google. This script inserts an
active `admin_roles` row, then mints the token with the backend's own issuer, the function
`/admin/api/auth/google` calls once it has verified the Google credential. No test-only endpoint
exists. The role is inserted BEFORE the token is minted: `load_role_for_claims` refuses a token
whose `iat` is older than the role's `granted_at`.

Run after reset-test-db.sh, with the backend's Python and the E2E database env set:
    python admin_session.py --db <name> --email staff.e2e@levapp.app --role operator
The last stdout line is `{"token", "expiresAt", "role", "email", "roleId", "pendingCoachIds", "userIds"}`.
"""
import argparse
import json
import os
import sys
from datetime import timedelta

parser = argparse.ArgumentParser()
parser.add_argument("--db", required=True)
parser.add_argument("--email", required=True)
parser.add_argument("--role", required=True, choices=["support", "operator", "owner"])
args = parser.parse_args()

# The config reads its environment at import time: set the database before importing padel_app.
os.environ["POSTGRES_DB"] = args.db
os.environ.setdefault("FLASK_APP", "padel_app")
os.environ.setdefault("FLASK_ENV", "development")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../../../../../backend")

from werkzeug.security import generate_password_hash  # noqa: E402

from padel_app import create_app  # noqa: E402
from padel_app.models.admin_audit_log import AdminAuditLog  # noqa: E402
from padel_app.models.admin_role import AdminRole  # noqa: E402
from padel_app.models.coaches import Coach  # noqa: E402
from padel_app.models.users import User  # noqa: E402
from padel_app.services.admin import auth_service  # noqa: E402
from padel_app.sql_db import db  # noqa: E402
from padel_app.utils.dates import utcnow_naive  # noqa: E402

PENDING_COACHES = [
    ("Rui Pires", "e2e-pending-rui", "e2e-pending-rui@test.com"),
    ("Ines Matos", "e2e-pending-ines", "e2e-pending-ines@test.com"),
]
AUDIT_ACTIONS = ["auth.sign_in", "coach.approve", "switch.put"]

app = create_app()
with app.app_context():
    email = args.email.strip().lower()
    now = utcnow_naive()
    role = AdminRole(email=email, role=args.role, granted_by_email=None, granted_at=now - timedelta(seconds=5))
    db.session.add(role)

    # admin.phone-console "Approvals keep both actions reachable": coaches waiting for a decision.
    # A Coach row defaults to "approved" in Python, so the status is explicit.
    pending_ids = []
    user_ids = []
    for name, username, user_email in PENDING_COACHES:
        user = User(
            name=name,
            username=username,
            email=user_email,
            password=generate_password_hash("E2ePending123!"),
            status="active",
            language="en",
        )
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="pending")
        db.session.add(coach)
        db.session.flush()
        pending_ids.append(coach.id)
        user_ids.append(user.id)

    # "The audit log scrolls inside its own container": rows to render.
    for i, action in enumerate(AUDIT_ACTIONS):
        db.session.add(
            AdminAuditLog(
                created_at=now - timedelta(minutes=i + 1),
                actor_email=email,
                actor_role=args.role,
                action=action,
                outcome="ok",
                request_id=f"e2e-phone-{i}",
            )
        )
    db.session.commit()

    token, expires_at = auth_service.mint_admin_token(role)
    print(
        json.dumps(
            {
                "token": token,
                "expiresAt": expires_at.isoformat(),
                "role": role.role,
                "email": role.email,
                "roleId": role.id,
                "pendingCoachIds": pending_ids,
                "userIds": user_ids,
            }
        )
    )
