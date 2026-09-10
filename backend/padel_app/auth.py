from padel_app.models import User, TokenBlocklist
from flask_jwt_extended import JWTManager

from padel_app.utils.tokens import session_over

def register_jwt_handlers(jwt):

    @jwt.unauthorized_loader
    def unauthorized(reason):
        return {"error": "Missing or invalid token"}, 401

    @jwt.invalid_token_loader
    def invalid(reason):
        return {"error": "Invalid token"}, 422

    @jwt.expired_token_loader
    def expired(jwt_header, jwt_payload):
        return {"error": "Token expired"}, 401

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        if TokenBlocklist.query.filter_by(jti=jti).first() is not None:
            return True

        # auth.token-refresh rule 6 (PAD-269): a session older than the cap is
        # over, however recently its token was refreshed.
        if session_over(jwt_payload):
            return True

        # Session kill for deleted/disabled accounts: reject any token
        # belonging to a user whose status is "disabled", regardless of
        # which device/jti issued it. This invalidates all sessions at
        # once without per-token tracking.
        identity = jwt_payload.get("sub")
        if identity is not None:
            try:
                user_id = int(identity)
            except (TypeError, ValueError):
                user_id = None

            if user_id is not None:
                user = User.query.get(user_id)
                if user is not None and user.status == "disabled":
                    return True
                # auth.parental-consent rule 4 (PAD-198): no session for a
                # minor whose guardian has not consented, or has withdrawn —
                # whatever path issued the token.
                if user is not None and getattr(user, "guardian_consent_status", None) in ("pending", "revoked"):
                    return True

        return False


def setup_login_manager(login_manager):
    @login_manager.user_loader
    def load_user(user_id):
        # PAD-268 (auth.account-deletion rule 3): an open legacy session of a
        # disabled (deleted) account ends; the loader never hands it back.
        user = User.query.get(int(user_id))
        if user is None or user.status == "disabled":
            return None
        return user
