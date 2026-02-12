from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone, timedelta
from dateutil import parser
import json

from padel_app.models import (
    Player,
    CoachLevel,
    User,
    Lesson,
    LessonInstance,
    Presence,
    CalendarBlock,
    Message,
    Conversation,
    ConversationParticipant
)

from padel_app.serializers.calendar_event import serialize_calendar_event
from padel_app.serializers.lesson import (
    serialize_lesson
)
from padel_app.serializers.user import serialize_user
from padel_app.serializers.presence import serialize_presence
from padel_app.serializers.calendar import serialize_calendar_block
from padel_app.serializers.message import serialize_message
from padel_app.serializers.conversation import (
    serialize_conversation_detail,
    serialize_conversation
)
from padel_app.serializers.coach_level import serialize_coach_level

from padel_app.helpers.calendar_helpers import (
    load_lessons_for_coach,
    load_lesson_instances_for_coach,
    build_lesson_events,
    load_calendar_blocks_for_user,
    build_block_events
)

from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.tools.calendar_tools import build_datetime

from padel_app.helpers.lesson_services import (
    create_lesson_helper,
    duplicate_lesson_helper,
    delete_future_instances,
    split_lesson,
    edit_lesson_instance_helper,
    create_lesson_instance_helper,
    edit_lesson_helper
)

from padel_app.helpers.player_services import (
    create_player_helper,
    edit_player_helper
)

bp = Blueprint("frontend_api", __name__, url_prefix="/api/app")


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def current_user():
    user_id = int(get_jwt_identity())
    return User.query.get_or_404(user_id)


def current_coach():
    user = current_user()
    if not user.coach:
        abort(403, "User is not a coach")
    return user.coach[0]


def get_or_materialize_instance(lesson: Lesson, date: datetime.date):
    instance = LessonInstance.query.filter_by(
        lesson_id=lesson.id,
        start_datetime=datetime.combine(date, lesson.start_datetime.time()),
    ).first()

    if instance:
        return instance

    instance = LessonInstance(
        lesson_id=lesson.id,
        start_datetime=datetime.combine(date, lesson.start_datetime.time()),
        end_datetime=datetime.combine(date, lesson.end_datetime.time()),
        status="scheduled",
        max_players=lesson.max_players,
        club_id=lesson.club_id,
    )

    instance.add_to_session()
    instance.flush()

    for rel in lesson.players_relations:
        Presence(
            lesson_instance_id=instance.id,
            player_id=rel.player_id,
            invited=True,
            confirmed=False,
            validated=False,
        ).add_to_session()

    instance.save()
    return instance


# -------------------------------------------------------------------
# READ
# -------------------------------------------------------------------

@bp.get("/calendar")
@jwt_required()
def calendar():
    start = request.args.get("from")
    end = request.args.get("to")

    if not start or not end:
        abort(400, "from and to are required")

    user = current_user()
    coach = current_coach()

    range_start = parser.isoparse(start).astimezone(timezone.utc)
    range_end = parser.isoparse(end).astimezone(timezone.utc)

    lessons = load_lessons_for_coach(coach.id, range_start, range_end)
    instances_by_key = load_lesson_instances_for_coach(
        coach.id, range_start, range_end
    )

    lesson_events = build_lesson_events(
        lessons,
        instances_by_key,
        range_start,
        range_end,
    )

    blocks = load_calendar_blocks_for_user(
        user.id, range_start, range_end
    )

    block_events = build_block_events(blocks, range_start, range_end)

    return jsonify(lesson_events + block_events)


@bp.get("/dashboard")
@jwt_required()
def dashboard():
    return jsonify({
        "totalPlayers": Player.query.count(),
        "upcomingClasses": LessonInstance.query.filter(
            LessonInstance.start_datetime >= datetime.utcnow()
        ).count(),
        "pendingValidations": Presence.query.filter_by(validated=False).count(),
        "monthlyRevenue": 0,
    })


@bp.get("/conversations")
@jwt_required()
def conversations():
    user = current_user()

    conversations = (
        Conversation.query
        .join(ConversationParticipant)
        .filter(ConversationParticipant.user_id == user.id)
        .all()
    )

    return jsonify([
        serialize_conversation(c, user.id)
        for c in conversations
    ])


@bp.get("/conversation/<int:conversation_id>")
@jwt_required()
def conversation_detail(conversation_id):
    user = current_user()
    conversation = Conversation.query.get_or_404(conversation_id)

    return jsonify(
        serialize_conversation_detail(conversation, user.id)
    )


@bp.get("/coach_levels")
@jwt_required()
def coach_levels():
    return jsonify([
        serialize_coach_level(l)
        for l in CoachLevel.query.all()
    ])


@bp.get("/coach_players")
@jwt_required()
def coach_players():
    coach = current_coach()
    return jsonify([
        p.coach_player_info(coach.id)
        for p in coach.players
    ])


@bp.get("/calendar_event")
@jwt_required()
def calendar_event():
    model = request.args.get("model")
    original_id = request.args.get("original_id")

    if not model or not original_id:
        abort(400, "model and original_id are required")

    models = {
        "lesson": Lesson,
        "lesson_instance": LessonInstance,
        "calendar_block": CalendarBlock,
    }

    obj = models[model].query.get_or_404(original_id)
    return jsonify(serialize_calendar_event(obj))


# -------------------------------------------------------------------
# CREATE / UPDATE / DELETE (ALL PROTECTED)
# -------------------------------------------------------------------

@bp.post("/add_class")
@jwt_required()
def add_class():
    data = request.get_json() or {}
    coach = current_coach()
    club = coach.current_club

    lesson_payload = {
        "title": data["name"],
        "type": data["classType"],
        "status": "active",
        "color": data.get("color"),
        "max_players": data["maxPlayers"],
        "level": data["levelId"],
        "is_recurring": data.get("isRecurring", False),
        "start_datetime": build_datetime(data["date"], data["startTime"]),
        "end_datetime": build_datetime(data["date"], data["endTime"]),
        "club": club.id,
        "coach": coach.id,
        "player_ids": data.get("playerIds", []),
    }

    if data.get("isRecurring"):
        lesson_payload["recurrence_rule"] = json.dumps(
            data.get("recurrenceRule")
        )
        lesson_payload["recurrence_end"] = data.get("endDate")

    lesson = create_lesson_helper(lesson_payload)
    return jsonify(serialize_lesson(lesson)), 201


@bp.post("/message")
@jwt_required()
def create_message():
    data = request.get_json() or {}
    user = current_user()

    message = Message(
        conversation_id=data["conversation_id"],
        sender_id=user.id,
        text=data["text"]
    )
    message.create()

    return jsonify(serialize_message(message, user.id)), 201


@bp.post("/add_player")
@jwt_required()
def add_player():
    coach = current_coach()
    data = request.get_json() or {}

    payload = {
        "coach": coach.id,
        "level": data.get("levelId"),
        "side": data.get("side"),
        "notes": data.get("notes"),
        "user": {
            "name": data.get("name"),
            "username": data.get("username"),
            "email": data.get("email"),
            "phone": data.get("phone"),
        },
    }

    return jsonify(create_player_helper(payload)), 201
