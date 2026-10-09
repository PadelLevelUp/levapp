"""admin.engine-health (PAD-534): the read-only health of the invitation and reminder engine.

Every answer is computed at request time, in UTC (R-023), from aggregate queries; nothing here
writes. Personal data is limited to coach names on the per-coach view (no email, no student data).
"""
from __future__ import annotations

import os
from datetime import timedelta

from sqlalchemy import func, text

from padel_app.sql_db import db
from padel_app.utils.dates import to_utc_iso, utcnow_naive

#: Job id families (R-010), longest prefix first so `invite_start_lesson_` is not counted as
#: `invite_start_`.
JOB_FAMILIES = (
    "reminder_lesson_", "invite_start_lesson_", "invite_start_", "pastdue_", "ask_", "reminder_",
)
SINGLETONS = ("process_batches", "extend_schedule_window", "prune_delivery_incidents")
OVERDUE_AFTER = timedelta(minutes=5)
PEER_TIMEOUT_SECONDS = 2


def _family(job_id: str) -> str:
    if job_id in SINGLETONS:
        return job_id
    for prefix in JOB_FAMILIES:
        if job_id.startswith(prefix):
            return prefix.rstrip("_") + "_*"
    return "other"


def _naive_utc(dt):
    if dt is None:
        return None
    from datetime import timezone
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _vacancies(now) -> dict:
    from padel_app.models.vacancy import Vacancy

    rows = (
        db.session.query(Vacancy.current_round_number, Vacancy.current_batch_number, func.count())
        .filter(Vacancy.status == "open")
        .group_by(Vacancy.current_round_number, Vacancy.current_batch_number)
        .order_by(Vacancy.current_round_number, Vacancy.current_batch_number)
        .all()
    )
    oldest = db.session.query(func.min(Vacancy.created_at)).filter(Vacancy.status == "open").scalar()
    pending = Vacancy.query.filter_by(status="open", approval_status="pending").count()
    return {
        "open": sum(n for _, _, n in rows),
        "byRoundAndBatch": [{"round": r, "batch": b, "count": n} for r, b, n in rows],
        "pendingApproval": pending,
        "oldestOpenAgeSeconds": int((now - oldest).total_seconds()) if oldest else None,
    }


def _invitations() -> dict:
    from padel_app.models.notification_event import NotificationEvent

    rows = (
        db.session.query(NotificationEvent.round_number, func.count())
        .filter(NotificationEvent.status.in_(("sent", "queued")))
        .group_by(NotificationEvent.round_number)
        .order_by(NotificationEvent.round_number)
        .all()
    )
    return {"live": sum(n for _, n in rows),
            "byRound": [{"round": r, "count": n} for r, n in rows]}


def _scheduler(now) -> dict:
    from padel_app import scheduler as sched

    if sched._scheduler is None:
        return {"available": False}
    jobs = sched._scheduler.get_jobs()
    families: dict[str, int] = {}
    overdue = 0
    for job in jobs:
        families[_family(job.id)] = families.get(_family(job.id), 0) + 1
        nxt = _naive_utc(getattr(job, "next_run_time", None) or getattr(job.trigger, "run_date", None))
        if nxt is not None and now - nxt > OVERDUE_AFTER:
            overdue += 1
    present = {j.id for j in jobs}
    return {
        "available": True,
        "total": len(jobs),
        "byFamily": dict(sorted(families.items())),
        "overdue": overdue,
        "singletons": {name: name in present for name in SINGLETONS},
    }


def _incidents(now) -> dict:
    from padel_app.models.delivery_incident import KINDS, DeliveryIncident

    def counts(since):
        rows = (
            db.session.query(DeliveryIncident.kind, func.count())
            .filter(DeliveryIncident.created_at >= since)
            .group_by(DeliveryIncident.kind)
            .all()
        )
        found = dict(rows)
        return {kind: found.get(kind, 0) for kind in KINDS}

    recent = DeliveryIncident.query.order_by(DeliveryIncident.created_at.desc(),
                                             DeliveryIncident.id.desc()).limit(20).all()
    return {"last24h": counts(now - timedelta(hours=24)), "last7d": counts(now - timedelta(days=7)),
            "recent": [r.to_dict() for r in recent]}


def _accounts(now) -> dict:
    from padel_app.models import Coach, Player, User

    users = dict(db.session.query(User.status, func.count()).group_by(User.status).all())
    coaches = dict(db.session.query(Coach.approval_status, func.count()).group_by(Coach.approval_status).all())
    return {
        "users": {k: users.get(k, 0) for k in ("inactive", "active", "disabled")},
        "coaches": {k: coaches.get(k, 0) for k in ("pending", "approved", "rejected")},
        "players": Player.query.count(),
        "createdLast7d": User.query.filter(User.created_at >= now - timedelta(days=7)).count(),
    }


def this_identity() -> dict:
    try:
        with db.engine.connect() as conn:  # its own connection: a missing table aborts nothing
            head = conn.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    except Exception:  # noqa: BLE001 — a database built without Alembic (tests) has no table
        head = []
    return {"gitSha": os.environ.get("GIT_SHA") or "unknown",
            "alembicHead": ",".join(sorted(head)) or None}


def other_identity(config) -> dict | str:
    """Rule 5: the other environment's identity from its admin API, with a 2-second timeout. A
    console without the peer configured answers "unreachable — not configured"."""
    url = (config.get("ADMIN_PEER_URL") or "").rstrip("/")
    token = config.get("ADMIN_PEER_TOKEN") or ""
    if not url or not token:
        return "unreachable — not configured"
    try:
        import requests

        resp = requests.get(f"{url}/admin/api/deploy-identity",
                            headers={"Authorization": f"Peer {token}"}, timeout=PEER_TIMEOUT_SECONDS)
        resp.raise_for_status()
        body = resp.json()
        return {"gitSha": body.get("gitSha"), "alembicHead": body.get("alembicHead")}
    except Exception:  # noqa: BLE001 — any failure is the same answer to the operator
        return "unreachable"


def summary(config, now=None) -> dict:
    now = now or utcnow_naive()
    return {
        "computedAt": to_utc_iso(now),
        "vacancies": _vacancies(now),
        "invitations": _invitations(),
        "scheduler": _scheduler(now),
        "incidents": _incidents(now),
        "accounts": _accounts(now),
        "deploy": {"this": this_identity(), "other": other_identity(config)},
    }


def coaches(q: str | None) -> list[dict]:
    from padel_app.models import Coach, User

    query = db.session.query(Coach.id, User.name).join(User, User.id == Coach.user_id)
    q = (q or "").strip()
    if len(q) >= 2:
        query = query.filter(User.name.ilike(f"%{q}%"))
    return [{"coachId": cid, "name": name} for cid, name in query.order_by(User.name).limit(50).all()]


def coach_detail(coach_id: int, now=None) -> dict | None:
    from padel_app import scheduler as sched
    from padel_app.models import Coach, NotificationConfig, User
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import coach_instance_ids

    coach = Coach.query.get(coach_id)
    if coach is None:
        return None
    name = db.session.query(User.name).filter(User.id == coach.user_id).scalar()
    cfg = NotificationConfig.query.filter_by(coach_id=coach_id).first() or NotificationConfig(coach_id=coach_id)
    restrictions = cfg.get_restrictions()
    instance_ids = set(coach_instance_ids(coach_id))
    jobs = []
    if sched._scheduler is not None and instance_ids:
        for job in sched._scheduler.get_jobs():
            fam = _family(job.id)
            if fam in ("invite_start_*", "pastdue_*", "ask_*", "reminder_*"):
                digits = job.id.split("_")[-1] if fam == "reminder_*" else job.id.split("_")[2 if fam == "invite_start_*" else 1]
                if digits.isdigit() and int(digits) in instance_ids:
                    nxt = _naive_utc(getattr(job, "next_run_time", None) or getattr(job.trigger, "run_date", None))
                    jobs.append({"id": job.id, "nextRunTime": to_utc_iso(nxt) if nxt else None})
    return {
        "coachId": coach_id,
        "name": name,
        "settings": {
            "autoNotifyEnabled": bool(cfg.auto_notify_enabled),
            "invitationMode": cfg.get_invitation_mode(),
            "reminder": cfg.get_reminder_timing(),
            "reminderCount": cfg.get_reminder_count(),
            "hoursBetweenReminders": cfg.get_hours_between_reminders(),
            "invitationStart": cfg.get_invitation_start_timing(),
            "quietHours": restrictions.get("quietHours"),
            "restrictions": {k: v for k, v in restrictions.items() if k not in ("excludedPlayers",)},
            "eligibilityRules": cfg.eligibility_rules,
            "invitationGroups": cfg.invitation_groups,
        },
        "openVacancies": Vacancy.query.filter(Vacancy.coach_id == coach_id, Vacancy.status == "open").count(),
        "liveInvitations": NotificationEvent.query.filter(
            NotificationEvent.coach_id == coach_id,
            NotificationEvent.status.in_(("sent", "queued"))).count(),
        "scheduledJobs": sorted(jobs, key=lambda j: j["nextRunTime"] or ""),
    }
