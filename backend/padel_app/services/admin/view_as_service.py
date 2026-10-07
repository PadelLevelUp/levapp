"""admin.approvals-and-users rule 9 (PAD-532): mint a read-only "view as" product token.

A product token (no `aud`: the product accepts it) for the user, 30 minutes, with
`view_as = true` and `actor = <staff email>`; the product backend enforces the read-only rules
(`utils/view_as.py`). The console opens `<PUBLIC_WEB_ORIGIN>/view-as#<token>` in a new tab; the
token rides in the fragment, which browsers never send to a server or write to a log.
"""
from datetime import datetime, timedelta, timezone

from flask import current_app, g
from flask_jwt_extended import create_access_token

from padel_app.services.admin.users_service import UserNotFound, UsersError

VIEW_AS_TTL = timedelta(minutes=30)


class UserDisabled(UsersError):
    status = 409
    code = "USER_DISABLED"


def mint(user_id, actor_email):
    from padel_app.models import User

    user = User.query.get(user_id)
    g.audit.target("user", user_id)
    if user is None:
        raise UserNotFound()
    if user.status == "disabled":
        raise UserDisabled()  # the product would refuse the token anyway
    now = datetime.now(timezone.utc)
    token = create_access_token(
        identity=str(user.id),
        expires_delta=VIEW_AS_TTL,
        additional_claims={"auth_time": int(now.timestamp()), "view_as": True, "actor": actor_email},
    )
    g.audit.after = {"viewAs": True, "expiresInMinutes": int(VIEW_AS_TTL.total_seconds() // 60)}
    origin = (current_app.config.get("PUBLIC_WEB_ORIGIN") or "").rstrip("/")
    return {
        "url": f"{origin}/view-as#{token}",
        "expiresAt": (now + VIEW_AS_TTL).replace(microsecond=0).isoformat(),
        "name": user.name,
    }
