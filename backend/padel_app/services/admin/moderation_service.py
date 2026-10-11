"""admin.moderation (PAD-631): message reports and the deletion audit, for the staff console.

Reads are plain queries (one per page, never one per row). The three actions run inside an
audited request (admin.foundation rule 8): they set the audit target to the report, close it with
its outcome, and defer anything outside the database (the live event) until after the commit.
"""
from flask import g
from sqlalchemy.orm import joinedload

from padel_app.models import Message, MessageReport, User
from padel_app.models.conversation_participants import ConversationParticipant
from padel_app.models.deletion_audit import DeletionAudit
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

PAGE_SIZE = 25
OUTCOMES = {"dismiss": "dismissed", "delete-message": "message_deleted", "disable-author": "author_disabled"}


class ModerationError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


def _page(raw):
    try:
        return max(1, int(raw or 1))
    except (TypeError, ValueError):
        return 1


def _person(user):
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "username": user.username}


def _row(report):
    message = report.message
    return {
        "id": report.id,
        "createdAt": report.created_at.isoformat() if report.created_at else None,
        "status": report.status,
        "outcome": report.outcome,
        "reason": report.reason,
        "closedAt": report.closed_at.isoformat() if report.closed_at else None,
        "closedBy": report.closed_by,
        "reporter": _person(report.reporter),
        "message": {"id": message.id, "text": message.text, "deleted": bool(message.is_deleted)},
        "author": _person(message.sender),
        "conversationId": message.conversation_id,
    }


def list_reports(status, page):
    """Rule 2."""
    status = status if status in ("open", "closed") else "open"
    page = _page(page)
    q = (
        MessageReport.query.filter_by(status=status)
        .options(joinedload(MessageReport.reporter), joinedload(MessageReport.message).joinedload(Message.sender))
        .order_by(MessageReport.created_at.desc(), MessageReport.id.desc())
    )
    total = q.count()
    rows = q.offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).all()
    return {"items": [_row(r) for r in rows[:PAGE_SIZE]], "total": total, "hasMore": len(rows) > PAGE_SIZE,
            "page": page}


def summary():
    """Rule 5."""
    return {"open": MessageReport.query.filter_by(status="open").count()}


def _report(report_id):
    report = MessageReport.query.get(report_id)
    if report is None:
        raise ModerationError(404, "REPORT_NOT_FOUND")
    return report


def report_detail(report_id):
    """Rule 3: two messages before and two after, in order, and the participants."""
    report = _report(report_id)
    message = report.message
    base = Message.query.filter_by(conversation_id=message.conversation_id).options(joinedload(Message.sender))
    before = (
        base.filter((Message.sent_at < message.sent_at) | ((Message.sent_at == message.sent_at) & (Message.id < message.id)))
        .order_by(Message.sent_at.desc(), Message.id.desc()).limit(2).all()
    )
    after = (
        base.filter((Message.sent_at > message.sent_at) | ((Message.sent_at == message.sent_at) & (Message.id > message.id)))
        .order_by(Message.sent_at, Message.id).limit(2).all()
    )
    context = list(reversed(before)) + [message] + after
    people = (
        User.query.join(ConversationParticipant, ConversationParticipant.user_id == User.id)
        .filter(ConversationParticipant.conversation_id == message.conversation_id)
        .order_by(User.id).all()
    )
    return {
        **_row(report),
        "context": [
            {"id": m.id, "text": m.text, "deleted": bool(m.is_deleted), "senderId": m.sender_id,
             # Named here, not looked up among the participants: a sender who left still has a name.
             "senderName": m.sender.name if m.sender else None,
             "sentAt": m.sent_at.isoformat() if m.sent_at else None, "reported": m.id == message.id}
            for m in context
        ],
        "participants": [_person(u) for u in people],
    }


def act(report_id, action, note=None):
    """Rule 4: dismiss / delete-message / disable-author. Closes the report; 409 when closed."""
    report = _report(report_id)
    # Rule 4: every row this request writes — ok, denied or error — names the report.
    g.audit.target("message_report", report.id)
    if report.status != "open":
        raise ModerationError(409, "REPORT_CLOSED")
    outcome = OUTCOMES[action]
    before = {"status": report.status, "outcome": report.outcome}
    message = report.message

    if action == "delete-message":
        from padel_app.services.messaging_service import publish_message_deleted, soft_delete_message

        if soft_delete_message(message):
            g.audit.defer(lambda m=message: publish_message_deleted(m))
    elif action == "disable-author":
        from padel_app.services.admin import users_service

        reason = f"Report #{report.id}: {(note or report.reason or 'reported message').strip()}"[:500]
        users_service.disable(message.sender_id, reason)  # sets its own audit target; reset below

    g.audit.resolve_actor()
    report.status = "closed"
    report.outcome = outcome
    report.closed_at = utcnow_naive()
    report.closed_by = g.audit.actor_email
    db.session.flush()
    g.audit.target("message_report", report.id)
    g.audit.before = before
    g.audit.after = {"status": report.status, "outcome": outcome}
    return _row(report)


def list_deletion_audits(entity, page):
    """Rule 6."""
    page = _page(page)
    q = DeletionAudit.query
    if entity:
        q = q.filter(DeletionAudit.entity == entity)
    q = q.order_by(DeletionAudit.created_at.desc(), DeletionAudit.id.desc())
    total = q.count()
    rows = q.offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).all()
    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id}
    actors = {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    return {
        "items": [
            {
                "id": r.id,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "actor": _person(actors.get(r.actor_user_id)),
                "entity": r.entity,
                "entityId": r.entity_id,
                "action": r.action,
                "label": r.label,
                "details": r.details,
            }
            for r in rows[:PAGE_SIZE]
        ],
        "total": total,
        "hasMore": len(rows) > PAGE_SIZE,
        "page": page,
    }
