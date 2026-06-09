#!/usr/bin/env python
"""
Seeds the levelup_test database with E2E test fixtures.
Run from the levelup_backend directory with test DB env vars set.
"""
import sys
import os

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../../../levelup_backend")

from padel_app import create_app
from padel_app.sql_db import db
from padel_app.models.users import User
from padel_app.models.coaches import Coach
from padel_app.models.players import Player
from padel_app.models.clubs import Club
from padel_app.models.coach_levels import CoachLevel
from padel_app.models.lessons import Lesson
from padel_app.models.lesson_instances import LessonInstance
from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
from padel_app.models.Association_CoachClub import Association_CoachClub
from padel_app.models.Association_CoachLesson import Association_CoachLesson
from padel_app.models.notification_config import NotificationConfig
from padel_app.models.conversations import Conversation
from padel_app.models.conversation_participants import ConversationParticipant
from padel_app.models.messages import Message
import json
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta, timezone


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

app = create_app()

with app.app_context():
    # ── Users ─────────────────────────────────────────────────────────────────
    coach_user = User(
        name="E2E Coach",
        username="e2e-coach",
        email="e2e-coach@test.com",
        password=generate_password_hash("E2eCoach123!"),
        status="active",
    )
    db.session.add(coach_user)

    student_user = User(
        name="E2E Student",
        username="e2e-student",
        email="e2e-student@test.com",
        password=generate_password_hash("E2eStudent123!"),
        status="active",
    )
    db.session.add(student_user)

    student2_user = User(
        name="E2E Student Two",
        username="e2e-student-2",
        email="e2e-student-2@test.com",
        password=generate_password_hash("E2eStudent2123!"),
        status="active",
    )
    db.session.add(student2_user)

    # Inactive player (no account yet) — for invite-link tests
    ghost_user = User(
        name="Ghost Player",
        username="ghost-player",
        email=None,
        password=None,
        status="inactive",
    )
    db.session.add(ghost_user)

    db.session.flush()

    # ── Coach / Player rows ────────────────────────────────────────────────────
    coach = Coach(user_id=coach_user.id)
    db.session.add(coach)

    student = Player(user_id=student_user.id)
    db.session.add(student)

    student2 = Player(user_id=student2_user.id)
    db.session.add(student2)

    ghost_player = Player(user_id=ghost_user.id)
    db.session.add(ghost_player)

    db.session.flush()

    # ── Club ──────────────────────────────────────────────────────────────────
    club = Club(name="E2E Club", description="Test club", location="Test City")
    db.session.add(club)
    db.session.flush()

    # Associate coach with club
    coach_club = Association_CoachClub(coach_id=coach.id, club_id=club.id)
    db.session.add(coach_club)

    # ── Coach levels ──────────────────────────────────────────────────────────
    level_beginner = CoachLevel(coach_id=coach.id, label="Beginner", code="B1", display_order=1)
    level_intermediate = CoachLevel(coach_id=coach.id, label="Intermediate", code="I1", display_order=2)
    db.session.add_all([level_beginner, level_intermediate])
    db.session.flush()

    # ── Coach ↔ Player associations ───────────────────────────────────────────
    assoc = Association_CoachPlayer(
        coach_id=coach.id,
        player_id=student.id,
        level_id=level_beginner.id,
        side="right",
        notes="E2E test player",
    )
    db.session.add(assoc)

    student2_assoc = Association_CoachPlayer(
        coach_id=coach.id,
        player_id=student2.id,
        level_id=level_beginner.id,
        side="left",
        notes="E2E test player 2",
    )
    db.session.add(student2_assoc)

    ghost_assoc = Association_CoachPlayer(
        coach_id=coach.id,
        player_id=ghost_player.id,
        level_id=None,
        side=None,
        notes=None,
    )
    db.session.add(ghost_assoc)

    # ── Bulk filler players (for pagination / search tests) ──────────────────
    # Creates 27 extra players so the coach has 30 total (3 + 27).
    # With PAGE_SIZE=25, the original 3 players end up on page 2 (ordered by id desc).
    for i in range(1, 28):
        filler_user = User(
            name=f"Filler Player {i:02d}",
            username=f"filler-player-{i:02d}",
            email=f"filler{i:02d}@test.com",
            password=generate_password_hash("Filler123!"),
            status="active",
        )
        db.session.add(filler_user)
        db.session.flush()
        filler_player = Player(user_id=filler_user.id)
        db.session.add(filler_player)
        db.session.flush()
        filler_assoc = Association_CoachPlayer(
            coach_id=coach.id,
            player_id=filler_player.id,
            level_id=level_beginner.id,
            side="right",
            notes=f"Filler player {i:02d}",
        )
        db.session.add(filler_assoc)

    db.session.flush()

    # ── Lesson + LessonInstance ───────────────────────────────────────────────
    # Future class (next Monday) — naive UTC to match the backend's datetime contract
    today = _utcnow_naive().replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_monday = (7 - today.weekday()) % 7 or 7
    next_monday = today + timedelta(days=days_until_monday)
    class_start = next_monday.replace(hour=10, minute=0)
    class_end = next_monday.replace(hour=11, minute=0)

    lesson = Lesson(
        title="E2E Academy Class",
        start_datetime=class_start,
        end_datetime=class_end,
        is_recurring=False,
        type="academy",
        max_players=6,
        club_id=club.id,
        color="#6366f1",
        status="active",
    )
    db.session.add(lesson)
    db.session.flush()

    # Associate coach with the lesson (not just the instance). Without this,
    # if the LessonInstance is later deleted (e.g. by the loading-states class
    # delete test), the calendar's load_lessons_for_coach query would not
    # return this Lesson, and downstream tests in other folders would fail to
    # find "E2E Academy Class" on the calendar.
    coach_lesson = Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id)
    db.session.add(coach_lesson)

    instance = LessonInstance(
        lesson_id=lesson.id,
        start_datetime=class_start,
        end_datetime=class_end,
        max_players=6,
        status="scheduled",
        level_id=level_beginner.id,
        notifications_enabled=True,
        # Required so the calendar's (lesson_id, occ_date) lookup matches.
        original_lesson_occurence_date=class_start.date(),
    )
    db.session.add(instance)
    db.session.flush()

    # Associate coach with instance
    coach_instance = Association_CoachLessonInstance(
        coach_id=coach.id,
        lesson_instance_id=instance.id,
    )
    db.session.add(coach_instance)

    # Associate student with instance
    student_instance = Association_PlayerLessonInstance(
        player_id=student.id,
        lesson_instance_id=instance.id,
    )
    db.session.add(student_instance)

    # ── Recurring Lesson (no materialized instance) ────────────────────────────
    # Weekly recurring class on Tuesdays, starting next Tuesday
    days_until_tuesday = (1 - today.weekday()) % 7 or 7
    next_tuesday = today + timedelta(days=days_until_tuesday)
    recurring_start = next_tuesday.replace(hour=14, minute=0)
    recurring_end = next_tuesday.replace(hour=15, minute=0)
    recurrence_end_date = (next_tuesday + timedelta(weeks=8)).date()

    recurring_lesson = Lesson(
        title="E2E Recurring Class",
        start_datetime=recurring_start,
        end_datetime=recurring_end,
        is_recurring=True,
        recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [next_tuesday.weekday()]}),
        recurrence_end=recurrence_end_date,
        type="academy",
        max_players=4,
        club_id=club.id,
        color="#10b981",
        status="active",
    )
    db.session.add(recurring_lesson)
    db.session.flush()

    # Associate coach with recurring lesson
    coach_recurring = Association_CoachLesson(
        coach_id=coach.id,
        lesson_id=recurring_lesson.id,
    )
    db.session.add(coach_recurring)

    # ── Notification config ───────────────────────────────────────────────────
    notification_config = NotificationConfig(
        coach_id=coach.id,
        auto_notify_enabled=True,
    )
    db.session.add(notification_config)

    # ── Conversation between coach and student (with messages) ───────────────
    # Required by E2E messaging tests (US-57..US-64). Without this, the coach
    # has no conversations to interact with and tests fall through to skip
    # branches.
    conversation = Conversation(
        is_group=False,
        participant_key=Conversation.build_participant_key([coach_user.id, student_user.id]),
    )
    db.session.add(conversation)
    db.session.flush()

    db.session.add(ConversationParticipant(
        conversation_id=conversation.id,
        user_id=coach_user.id,
        last_read_at=_utcnow_naive(),  # coach has read up to now
    ))
    db.session.add(ConversationParticipant(
        conversation_id=conversation.id,
        user_id=student_user.id,
        last_read_at=_utcnow_naive(),
    ))
    db.session.flush()

    coach_msg = Message(
        conversation_id=conversation.id,
        sender_id=coach_user.id,
        text="Welcome to the academy!",
        sent_at=_utcnow_naive() - timedelta(minutes=5),
    )
    db.session.add(coach_msg)
    # Student replies AFTER coach's last_read_at — this counts as unread for the coach.
    student_msg = Message(
        conversation_id=conversation.id,
        sender_id=student_user.id,
        text="Thanks coach!",
        sent_at=_utcnow_naive() + timedelta(seconds=1),
    )
    db.session.add(student_msg)

    # ── Commit ────────────────────────────────────────────────────────────────
    db.session.commit()
    print("[seed] Done. Created:")
    print(f"  Coach: {coach_user.username} / E2eCoach123!")
    print(f"  Student 1: {student_user.username} / E2eStudent123!")
    print(f"  Student 2: {student2_user.username} / E2eStudent2123!")
    print(f"  Club: {club.name}")
    print(f"  Lesson instance: {instance.id} at {instance.start_datetime}")
    print(f"  Recurring lesson: {recurring_lesson.id} '{recurring_lesson.title}' (weekly on Tue, {recurring_start} - {recurrence_end_date})")
    print(f"  Conversation {conversation.id} (coach<->student) with 2 messages (1 unread for coach)")
