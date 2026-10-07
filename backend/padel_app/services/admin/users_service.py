"""admin.approvals-and-users rules 4–7 (PAD-532): find a user, look at them, disable / enable,
resend their verification code. Nothing here commits: the route's `@audited` does (rule 8)."""
import unicodedata

from flask import g

from padel_app.models import Coach, DeviceToken, PushSubscription, User
from padel_app.models.admin_audit_log import AdminAuditLog
from padel_app.models.admin_role import AdminRole
from padel_app.sql_db import db
from padel_app.utils.dates import to_utc_iso

PAGE_SIZE = 50
MIN_QUERY = 2


class UsersError(Exception):
    status = 400
    code = "USERS_ERROR"
    extra = None

    def payload(self):
        body = {"error": self.code}
        if self.extra:
            body.update(self.extra)
        return body


class QueryTooShort(UsersError):
    code = "QUERY_TOO_SHORT"


class ReasonRequired(UsersError):
    code = "REASON_REQUIRED"


class UserNotFound(UsersError):
    status = 404
    code = "USER_NOT_FOUND"


def _fold(text):
    """Lower-case, accents removed: "João" and "joao" match (rule 4)."""
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


def _roles(user):
    roles = []
    if user.coach is not None:
        roles.append("coach")
    if user.player is not None:
        roles.append("player")
    return roles


def _email_verified(user):
    from padel_app.services.email_verification_service import verification_state

    return verification_state(user) == "verified"


def row(user):
    return {
        "userId": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "emailVerified": _email_verified(user),
        "status": user.status,
        "roles": _roles(user),
        "createdAt": to_utc_iso(user.created_at),
    }


def _score(user, needle):
    """Best match first: exact field, then prefix, then contains (0 best)."""
    best = None
    for field in (user.name, user.username, user.email):
        folded = _fold(field)
        if not folded or needle not in folded:
            continue
        score = 0 if folded == needle else 1 if folded.startswith(needle) else 2
        best = score if best is None else min(best, score)
    return best


class BadCursor(UsersError):
    code = "BAD_CURSOR"


def _cursor(raw):
    """The offset a `nextCursor` names; anything else is 400 (never a 500, never a negative slice).
    It is an offset into a ranking recomputed per request: a sign-up between two pages can shift a
    row, which a staff search tolerates."""
    if raw in (None, ""):
        return 0
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise BadCursor()
    if value < 0:
        raise BadCursor()
    return value


def search(q, cursor=None):
    """Rule 4. Matching runs on folded text in Python: accent-insensitive on both databases."""
    needle = _fold((q or "").strip())
    if len(needle) < MIN_QUERY:
        raise QueryTooShort()
    hits = []
    for user in User.query.all():
        score = _score(user, needle)
        if score is not None:
            hits.append((score, -(user.created_at.timestamp() if user.created_at else 0), -user.id, user))
    hits.sort(key=lambda h: h[:3])
    start = _cursor(cursor)
    page = [h[3] for h in hits[start:start + PAGE_SIZE]]
    next_cursor = str(start + PAGE_SIZE) if len(hits) > start + PAGE_SIZE else None
    return [row(u) for u in page], next_cursor


def _user(user_id):
    user = User.query.get(user_id)
    if user is None:
        raise UserNotFound()
    return user


def view(user_id):
    """Rule 5. Never a password hash, a code, a token, a device token or a push key."""
    user = _user(user_id)
    body = row(user)
    coach = user.coach
    if coach is not None:
        body["coach"] = {
            "coachId": coach.id,
            "approvalStatus": coach.approval_status,
            "rejectionReason": coach.rejection_reason,
            "clubs": [{"clubId": c.id, "name": c.name} for c in coach.clubs],
        }
    player = user.player
    if player is not None:
        coaches = []
        for rel in player.coaches_relations:
            c = Coach.query.get(rel.coach_id)
            if c is not None and c.user is not None:
                coaches.append({"coachId": c.id, "name": c.user.name})
        body["player"] = {"playerId": player.id, "coaches": coaches}
    body["language"] = user.language
    body["pushRegistered"] = bool(
        DeviceToken.query.filter_by(user_id=user.id).first() or PushSubscription.query.filter_by(user_id=user.id).first()
    )
    body["isSuperadmin"] = bool(user.is_superadmin)
    role = AdminRole.query.filter(db.func.lower(AdminRole.email) == (user.email or "").lower()).first() if user.email else None
    body["adminRole"] = role.to_dict() if role is not None else None
    targets = [db.and_(AdminAuditLog.target_type == "user", AdminAuditLog.target_id == str(user.id))]
    if coach is not None:  # approvals are targeted at the coach (rule 2): they are this user's rows too
        targets.append(db.and_(AdminAuditLog.target_type == "coach", AdminAuditLog.target_id == str(coach.id)))
    audit = (
        AdminAuditLog.query.filter(db.or_(*targets))
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(20)
        .all()
    )
    body["audit"] = [a.to_dict() for a in audit]
    return body


def _audit(user, before, after):
    ctx = g.audit
    ctx.target("user", user.id)
    ctx.before = before
    ctx.after = after


def disable(user_id, reason):
    """Rule 6: `disabled` is the state the JWT blocklist loader already refuses: signed out everywhere."""
    reason = (reason or "").strip()
    if not reason:
        raise ReasonRequired()
    user = _user(user_id)
    before = {"status": user.status}
    user.status = "disabled"
    db.session.flush()
    _audit(user, before, {"status": user.status, "reason": reason[:500]})
    return user


def enable(user_id):
    """Rule 6: never changes a coach's approval_status (a rejected coach is re-approved, not enabled)."""
    user = _user(user_id)
    before = {"status": user.status}
    # Rule 6 undoes a disable, nothing else: an `inactive` account (coach-created, not yet
    # activated by its owner) stays inactive. Idempotent either way.
    if user.status == "disabled":
        user.status = "active"
        db.session.flush()
    _audit(user, before, {"status": user.status})
    return user


def resend_verification(user_id):
    """Rule 7: the product's own send, with its answers (NO_EMAIL, ALREADY_VERIFIED, RESEND_TOO_SOON)."""
    from padel_app.services.email_verification_service import EmailVerificationError, send_code

    user = _user(user_id)
    g.audit.target("user", user.id)
    try:
        body = send_code(user, defer=g.audit.defer)
    except EmailVerificationError as exc:
        err = UsersError()
        err.status, err.code = exc.status, exc.payload().get("error", "VERIFICATION_ERROR")
        err.extra = {k: v for k, v in exc.payload().items() if k != "error"}
        g.audit.after = {"error": err.code}
        raise err from exc
    g.audit.after = {"sent": True}
    return {"sent": True, "resendAvailableInSeconds": body["resendAvailableInSeconds"]}
