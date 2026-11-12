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
SINGLETONS = (
    "process_batches", "extend_schedule_window", "prune_delivery_incidents", "retention_sweep",
    "finance_gcp_import",  # admin.finance rule 9 (PAD-742)
    "read_push_receipts",  # messaging.push-notifications rule 10b (PAD-745)
    "engine_tick",  # notifications.engine-store rule 7 (PAD-918)
)
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


def _push_receipts(now) -> dict:
    """messaging.push-notifications rule 10b (PAD-745): what Apple and Google answered Expo."""
    from padel_app.services import push_receipts

    return push_receipts.summary(now)


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


#: Rule 8: who counts as an active student (PAD-741's baseline definition, kept as is).
ACTIVE_STUDENT_WINDOW = timedelta(days=7)


def _push(now) -> dict:
    """Rule 8 (PAD-746): the push reach of active students, and the clients' failed registrations.

    An active student is a user with a `players` row who has a conversation marked read in the
    last 7 days (`conversation_participants.last_read_at`), whatever their status and even if they
    also coach: PAD-741's definition, so the count compares with its 2026-10-22 baseline. One
    aggregate query; counts only, no ids.
    """
    from padel_app.models import ConversationParticipant, DeviceToken, Player, PushSubscription
    from padel_app.models.delivery_incident import DeliveryIncident

    since = now - ACTIVE_STUDENT_WINDOW
    active = (
        db.session.query(Player.user_id.label("user_id"))
        .join(ConversationParticipant, ConversationParticipant.user_id == Player.user_id)
        .filter(ConversationParticipant.last_read_at > since)
        .distinct()
        .subquery()
    )
    has_token = db.session.query(DeviceToken.id).filter(DeviceToken.user_id == active.c.user_id).exists()
    has_webpush = (db.session.query(PushSubscription.id)
                   .filter(PushSubscription.user_id == active.c.user_id).exists())
    cells = db.session.query(has_token, has_webpush, func.count()).select_from(active).group_by(
        has_token, has_webpush).all()
    found = {(bool(t), bool(w)): n for t, w, n in cells}

    failures = dict(
        db.session.query(DeliveryIncident.channel, func.count())
        .filter(DeliveryIncident.kind == "push_registration_failed",
                DeliveryIncident.created_at >= now - timedelta(days=7))
        .group_by(DeliveryIncident.channel)
        .all()
    )
    return {
        "activeStudents7d": {
            "total": sum(found.values()),
            "noChannel": found.get((False, False), 0),
            "webPushOnly": found.get((False, True), 0),
            "nativeOnly": found.get((True, False), 0),
            "nativeAndWebPush": found.get((True, True), 0),
        },
        "registrationFailures7d": {platform: failures.get(channel, 0)
                                   for platform, channel in (("ios", "apns"), ("android", "fcm"),
                                                             ("web", "webpush"))},
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


def _app_side(side):
    return {"L": "left", "R": "right"}.get(side)


def _level_names(coach_id: int) -> dict:
    """The coach's ladder as the engine numbers it: ``{position (1 the best): (level id, label)}``."""
    from padel_app.services.level_ladder import get_level_ladder

    return {i + 1: (lv.id, lv.label) for i, lv in enumerate(get_level_ladder(coach_id))}


def _open_spots(session: str, coach_id: int, names: dict, invitations, now) -> tuple[list[dict], int]:
    """A session's open spots by type as the engine counts them (engine-spots rule 6), and how many
    are uncovered: per type, its spots minus the counting invitations whose offer counts for it."""
    from padel_app.invitation_engine import planner
    from padel_app.services.engine_store import TableStore, settings_for

    snapshot = TableStore(clock=lambda: now).snapshot(session)
    try:
        settings = settings_for(session)
    except Exception:  # noqa: BLE001 — a coach whose settings do not map still shows their spots
        settings = None
    counts = planner.spot_counts(snapshot, settings) if settings is not None else planner.spot_counts(snapshot)
    out, uncovered = [], 0
    for spot_type, n in planner.spot_types(snapshot, counts):
        covered = sum(1 for inv in invitations if spot_type in inv.offer_types)
        uncovered += max(0, n - covered)
        level_id, label = names.get(spot_type.level, (None, None)) if spot_type.level is not None else (None, None)
        out.append({"side": _app_side(spot_type.side), "levelId": level_id, "levelLabel": label, "open": n})
    return out, uncovered


def _invitation_rows(session_ids, now):
    """The open invitations of these sessions, each with ``counting`` and its offer as spot types."""
    from types import SimpleNamespace

    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.models import EngineInvitation

    rows = (EngineInvitation.query.filter(EngineInvitation.lesson_instance_id.in_(list(session_ids) or [-1]),
                                          EngineInvitation.answer.is_(None),
                                          EngineInvitation.closed_at.is_(None)).all())
    return [SimpleNamespace(session=r.lesson_instance_id, tier=r.tier,
                            counting=r.sorry_at is None and r.counts_until is not None and r.counts_until > now,
                            offer_types={SpotType(side, level) for side, level in (r.offer or [])})
            for r in rows]


def _engine(now) -> dict | None:
    """admin.engine-health rule 10: the new engine's block, absent while no coach is on ``new``."""
    from padel_app import scheduler as sched
    from padel_app.models import Coach, EngineEffect, EngineInvitation, EngineSession, NotificationConfig
    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_runner import SESSION_FAILED
    from padel_app.utils.dates import utc_to_wall_naive

    new = NotificationConfig.query.filter(NotificationConfig.engine_version == "new").count()
    if not new:
        return None
    wall = utc_to_wall_naive(now)
    sessions = (db.session.query(EngineSession, LessonInstance)
                .join(LessonInstance, LessonInstance.id == EngineSession.lesson_instance_id)
                .filter(LessonInstance.start_datetime > wall, LessonInstance.status != "canceled").all())
    week = [(es, inst) for es, inst in sessions if inst.start_datetime < wall + timedelta(days=7)]
    invitations = _invitation_rows([inst.id for _, inst in sessions], now)
    by_type, uncovered, names = {}, 0, {}
    for es, inst in week:
        names.setdefault(es.coach_id, _level_names(es.coach_id))
        spots, missing = _open_spots(str(inst.id), es.coach_id, names[es.coach_id],
                                     [i for i in invitations if i.session == inst.id and i.counting], now)
        uncovered += missing
        for spot in spots:
            key = (spot["side"], spot["levelId"])
            if key in by_type:
                by_type[key]["open"] += spot["open"]
            else:
                by_type[key] = dict(spot)
    tiers = {}
    for inv in invitations:
        t = tiers.setdefault(inv.tier, {"tier": inv.tier, "counting": 0, "openNotCounting": 0})
        t["counting" if inv.counting else "openNotCounting"] += 1
    alerted = sum(1 for es, _ in sessions if es.alerted)
    job = sched._scheduler.get_job("engine_tick") if sched._scheduler is not None else None
    next_run = _naive_utc(getattr(job, "next_run_time", None)) if job is not None else None
    return {
        "coaches": {"old": Coach.query.count() - new, "new": new},
        "sessions": {"upcoming": len(sessions), "next7Days": len(week)},
        "openSpots": {"byType": list(by_type.values()), "uncovered": uncovered},
        "invitations": {
            "counting": sum(1 for i in invitations if i.counting),
            "openNotCounting": sum(1 for i in invitations if not i.counting),
            "byTier": sorted(tiers.values(), key=lambda t: (t["tier"] is None, t["tier"] or 0)),
            "sentLast24h": EngineInvitation.query.filter(EngineInvitation.sent_at >= now - timedelta(hours=24)).count(),
        },
        "approvals": {"pending": sum(1 for es, _ in sessions if es.pending),
                      "dismissed": sum(1 for es, _ in sessions if es.dismissed_groups)},
        "alerts": {"byReason": [{"reason": "no_candidate", "count": alerted}] if alerted else []},
        "outbox": {
            "pending": EngineEffect.query.filter(EngineEffect.dispatched_at.is_(None)).count(),
            "stuckOver5Min": EngineEffect.query.filter(EngineEffect.dispatched_at.is_(None),
                                                       EngineEffect.at <= now - OVERDUE_AFTER).count(),
        },
        "tick": {
            "present": job is not None,
            "overdue": bool(next_run is not None and next_run < now - OVERDUE_AFTER),
            "sessionFailures24h": DeliveryIncident.query.filter(
                DeliveryIncident.kind == SESSION_FAILED,
                DeliveryIncident.created_at >= now - timedelta(hours=24)).count(),
        },
    }


def summary(config, now=None) -> dict:
    now = now or utcnow_naive()
    engine = _engine(now)
    return {
        **({"engine": engine} if engine is not None else {}),
        "computedAt": to_utc_iso(now),
        "vacancies": _vacancies(now),
        "invitations": _invitations(),
        "scheduler": _scheduler(now),
        "incidents": _incidents(now),
        "pushReceipts": _push_receipts(now),
        "accounts": _accounts(now),
        "push": _push(now),
        "deploy": {"this": this_identity(), "other": other_identity(config)},
    }


def _settings_view(coach_id: int, cfg) -> dict:
    """The coach's EngineSettings as the store builds them (rule 11), JSON-ready; a SettingsError is its
    message, never raised."""
    import dataclasses

    from padel_app.services.engine_settings_mapping import settings_from_config

    try:
        settings = settings_from_config(cfg)
    except Exception as exc:  # noqa: BLE001 — rule 11: answered as its message
        return {"error": str(exc)}

    def plain(value):
        if dataclasses.is_dataclass(value):
            return {f.name: plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
        if isinstance(value, (list, tuple, set, frozenset)):
            return [plain(v) for v in value]
        if isinstance(value, timedelta):
            return int(value.total_seconds() // 60)
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value

    return plain(settings)


def _coach_engine(coach_id: int, cfg, now) -> dict:
    """admin.engine-health rule 11: a new-engine coach's engine version, settings and upcoming sessions,
    counted, never naming a student."""
    from padel_app.models import EngineSession
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.utils.dates import utc_to_wall_naive

    wall = utc_to_wall_naive(now)
    sessions = (db.session.query(EngineSession, LessonInstance)
                .join(LessonInstance, LessonInstance.id == EngineSession.lesson_instance_id)
                .filter(EngineSession.coach_id == coach_id, LessonInstance.start_datetime > wall,
                        LessonInstance.status != "canceled")
                .order_by(LessonInstance.start_datetime).all())
    invitations = _invitation_rows([inst.id for _, inst in sessions], now)
    names = _level_names(coach_id)
    upcoming = []
    for es, inst in sessions:
        mine = [i for i in invitations if i.session == inst.id]
        spots, _ = _open_spots(str(inst.id), coach_id, names, [i for i in mine if i.counting], now)
        upcoming.append({
            "lessonInstanceId": inst.id,
            "start": inst.start_datetime.isoformat(),
            "capacity": inst.effective_max_players,
            "openSpots": spots,
            "counting": sum(1 for i in mine if i.counting),
            "openNotCounting": sum(1 for i in mine if not i.counting),
            "approval": "pending" if es.pending else "dismissed" if es.dismissed_groups else None,
            "alert": bool(es.alerted),
        })
    return {"engineVersion": "new", "engineSettings": _settings_view(coach_id, cfg), "upcomingSessions": upcoming}


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
    engine_view = _coach_engine(coach_id, cfg, now or utcnow_naive()) if (cfg.engine_version or "old") == "new" else {}
    return {
        **engine_view,
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
