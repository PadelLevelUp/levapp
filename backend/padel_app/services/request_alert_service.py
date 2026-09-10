"""PAD-232 — push + email for pending requests (notifications.request-alerts).

Three request types only ever surfaced as in-app badges: club join requests
(Settings → Club), player claim requests (the student's claim banner) and coach
approvals (Settings → Admin). Nobody was told when one arrived, so requests sat
unanswered. This module tells the people who can act, and the requester once a
decision lands, over every channel they have — web push, native push, email —
unless they switched request alerts off (`users.notif_request_alerts`).

Copy lives here (rule 4), not in the coach's editable message templates: the
recipients span students, coaches of another club and superadmins, none of
whom own the sending coach's NotificationConfig.

Everything is best-effort (rule 5): a failed channel is logged and never fails
the request, the decision or the signup.
"""
from __future__ import annotations

from flask import current_app

from padel_app.models import User

#: Event kind → where the web push and the email button point.
PATHS = {
    "club_join.received": "/settings?section=club",
    "club_join.decided": "/settings?section=club",
    "claim.received": "/players",
    "claim.decided": "/players",
    "coach_approval.received": "/settings?section=admin",
    "coach_approval.decided": "/dashboard",
}

#: kind → language → (title, body). Placeholders: {actor}, {club}, {player},
#: {decision}.
COPY = {
    "club_join.received": {
        "pt": ("Pedido para entrar no clube", "{actor} pediu para entrar em {club}. Aprova ou recusa em Definições → Clube."),
        "en": ("Club join request", "{actor} asked to join {club}. Approve or decline under Settings → Club."),
    },
    "club_join.decided": {
        "pt": ("Resposta ao teu pedido", "{club} {decision} o teu pedido para entrar."),
        "en": ("Your join request", "{club} {decision} your request to join."),
    },
    "claim.received": {
        "pt": ("Pedido para ligar uma conta", "{actor} quer ligar a conta \"{player}\" à tua. Aceita ou recusa na app."),
        "en": ("Account link request", "{actor} wants to link the account \"{player}\" to yours. Accept or decline in the app."),
    },
    "claim.decided": {
        "pt": ("Resposta ao pedido de ligação", "{actor} {decision} ligar a conta \"{player}\"."),
        "en": ("Account link decision", "{actor} {decision} linking the account \"{player}\"."),
    },
    "coach_approval.received": {
        "pt": ("Treinador à espera de aprovação", "{actor} registou-se como treinador e aguarda aprovação em Definições → Admin."),
        "en": ("Coach waiting for approval", "{actor} signed up as a coach and is waiting for approval under Settings → Admin."),
    },
    "coach_approval.decided": {
        "pt": ("A tua conta foi aprovada", "Já podes usar a LevApp: cria ou junta-te ao teu clube."),
        "en": ("Your account is approved", "You can start using LevApp: create or join your club."),
    },
}

DECISION_WORDS = {
    "pt": {"approved": "aceitou", "rejected": "recusou"},
    "en": {"approved": "accepted", "rejected": "declined"},
}


def _lang(user) -> str:
    return "pt" if (getattr(user, "language", None) or "pt") == "pt" else "en"


def render_copy(kind: str, lang: str, **ctx) -> tuple[str, str]:
    """(title, body) for ``kind`` in ``lang``; every placeholder substituted."""
    title, body = COPY[kind][lang]
    decision = ctx.get("decision")
    words = {
        "actor": ctx.get("actor") or "",
        "club": ctx.get("club") or "",
        "player": ctx.get("player") or "",
        "decision": DECISION_WORDS[lang].get(decision, decision or ""),
    }
    return title.format(**words), body.format(**words)


def wants_request_alerts(user) -> bool:
    """Rule 3: only an explicit ``false`` opts out (NULL from an old row = on)."""
    return getattr(user, "notif_request_alerts", None) is not False


def notify_request_event(kind: str, recipients, **ctx) -> int:
    """Tell ``recipients`` (User rows) about ``kind``. Returns how many were
    alerted (opted-out recipients are skipped and not counted)."""
    if kind not in COPY:
        raise ValueError(f"unknown request-alert kind {kind!r}")
    from padel_app.utils.push_notifications import send_push_notification
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.tools.email_tools import send_email
    from padel_app.tools.email_templates import render_request_alert_email

    seen = set()
    alerted = 0
    for user in recipients:
        if user is None or user.id in seen:
            continue
        seen.add(user.id)
        if not wants_request_alerts(user):
            continue
        alerted += 1
        lang = _lang(user)
        title, body = render_copy(kind, lang, **ctx)
        path = PATHS[kind]
        try:
            send_push_notification(user.id, title, body, url=path)
        except Exception as exc:  # noqa: BLE001 — best-effort (rule 5)
            current_app.logger.warning("request-alert web push to %s failed: %s", user.id, exc)
        try:
            send_expo_push_to_user(user.id, title, body, data={"type": "request", "kind": kind})
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("request-alert native push to %s failed: %s", user.id, exc)
        if user.email:
            try:
                subject, text, html = render_request_alert_email(user, title, body, path)
                send_email(subject, [user.email], body=text, html=html)
            except Exception as exc:  # noqa: BLE001
                current_app.logger.warning("request-alert mail to %s failed: %s", user.email, exc)
    return alerted


# ── recipient helpers ───────────────────────────────────────────────────────

def club_member_users(club_id: int, exclude_coach_id: int | None = None):
    from padel_app.models import Association_CoachClub
    from padel_app.models.coaches import Coach

    rows = Association_CoachClub.query.filter_by(club_id=club_id).all()
    users = []
    for row in rows:
        if exclude_coach_id is not None and row.coach_id == exclude_coach_id:
            continue
        coach = Coach.query.get(row.coach_id)
        if coach is not None and coach.user is not None:
            users.append(coach.user)
    return users


def superadmin_users():
    return User.query.filter_by(is_superadmin=True).all()
