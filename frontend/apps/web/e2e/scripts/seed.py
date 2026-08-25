#!/usr/bin/env python
"""
Seeds the levelup_test database with E2E test fixtures.
Run from the levelup_backend directory with test DB env vars set.
"""
import sys
import os

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../../../../../levelup_backend")

from padel_app import create_app
from padel_app.sql_db import db
from padel_app.models.users import User
from padel_app.models.coaches import Coach
from padel_app.models.players import Player
from padel_app.models.clubs import Club
from padel_app.models.coach_levels import CoachLevel
from padel_app.models.evaluation_category import EvaluationCategory
from padel_app.models.lessons import Lesson
from padel_app.models.lesson_instances import LessonInstance
from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
from padel_app.models.presences import Presence
from padel_app.models.Association_CoachClub import Association_CoachClub
from padel_app.models.Association_CoachLesson import Association_CoachLesson
from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
from padel_app.models.notification_config import NotificationConfig
from padel_app.models.notification_event import NotificationEvent
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
    # PAD-40: seed the active E2E users with language="en" so the app UI renders in
    # English for the existing E2E suite (whose locators match English copy). App-wide
    # i18n keeps EN strings identical to the current copy; the PT rollout is verified
    # separately in language-preference.spec.ts.
    coach_user = User(
        name="E2E Coach",
        username="e2e-coach",
        email="e2e-coach@test.com",
        password=generate_password_hash("E2eCoach123!"),
        status="active",
        language="en",
        # PAD-55: super-admin so the /editor tool (SuperAdminRoute) is reachable
        # in E2E for the Editor i18n coverage spec.
        is_superadmin=True,
    )
    db.session.add(coach_user)

    student_user = User(
        name="E2E Student",
        username="e2e-student",
        email="e2e-student@test.com",
        password=generate_password_hash("E2eStudent123!"),
        status="active",
        language="en",
    )
    db.session.add(student_user)

    student2_user = User(
        name="E2E Student Two",
        username="e2e-student-2",
        email="e2e-student-2@test.com",
        password=generate_password_hash("E2eStudent2123!"),
        status="active",
        language="en",
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

    # Coach with NO levels defined — for the empty-levels dropdown case (PAD-29)
    nolevels_coach_user = User(
        name="E2E Coach No Levels",
        username="e2e-coach-nolevels",
        email="e2e-coach-nolevels@test.com",
        password=generate_password_hash("E2eCoach123!"),
        status="active",
        language="en",
    )
    db.session.add(nolevels_coach_user)

    db.session.flush()

    # ── Coach / Player rows ────────────────────────────────────────────────────
    coach = Coach(user_id=coach_user.id)
    db.session.add(coach)

    # Coach with no levels (PAD-29) — deliberately gets no CoachLevel rows below.
    nolevels_coach = Coach(user_id=nolevels_coach_user.id)
    db.session.add(nolevels_coach)

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

    # Associate the no-levels coach with the same club (so player creation works)
    nolevels_coach_club = Association_CoachClub(coach_id=nolevels_coach.id, club_id=club.id)
    db.session.add(nolevels_coach_club)

    # ── Coach levels ──────────────────────────────────────────────────────────
    # Ordering convention (specs/levels/spec.md rule 3, PAD-70): lower
    # display_order = STRONGER level, so Intermediate is 1 and Beginner is 2.
    # The seed used to have these inverted, which would have taught any
    # level-adjacency test the wrong ladder direction.
    level_intermediate = CoachLevel(coach_id=coach.id, label="Intermediate", code="I1", display_order=1)
    level_beginner = CoachLevel(coach_id=coach.id, label="Beginner", code="B1", display_order=2)
    db.session.add_all([level_intermediate, level_beginner])
    db.session.flush()

    # ── Evaluation categories ─────────────────────────────────────────────────
    # At least one category so the Add Evaluation sheet renders a scorable slider
    # (PAD-56: without a category, saving is a silent no-op / false success).
    forehand_category = EvaluationCategory(
        coach_id=coach.id,
        name="Forehand",
        scale_min=1,
        scale_max=10,
    )
    db.session.add(forehand_category)
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
    filler_players = []
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
        filler_players.append(filler_player)
        # Intermediate level (NOT beginner): keeps fillers out of the early
        # invite-queue rounds for the beginner "E2E Academy Class", so
        # e2e-student-2 (beginner) is the first eligible replacement in
        # notification-engine tests. Fillers exist for pagination/search tests
        # where their level is irrelevant.
        filler_assoc = Association_CoachPlayer(
            coach_id=coach.id,
            player_id=filler_player.id,
            level_id=level_intermediate.id,
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

    # Presence for the enrolled student (mirrors auto-create on materialize:
    # invited, not yet confirmed). Needed so the confirm / cancel-attendance
    # flow has a Presence row to operate on.
    student_presence = Presence(
        player_id=student.id,
        lesson_instance_id=instance.id,
        invited=True,
        confirmed=False,
    )
    db.session.add(student_presence)

    # ── Declined-count class (PAD-71) ─────────────────────────────────────────
    # Next Thursday 16:00. 3 enrolled players out of 4 spots, of which 2 have
    # already DECLINED (presence.status == "absent"). The calendar event card and
    # the class-detail "capacity" field must BOTH show 1/4 — declined students do
    # not occupy a spot. Uses filler players (only referenced by pagination /
    # search specs) so no other spec's fixtures shift.
    days_until_thursday = (3 - today.weekday()) % 7 or 7
    next_thursday = today + timedelta(days=days_until_thursday)
    declined_start = next_thursday.replace(hour=16, minute=0)
    declined_end = next_thursday.replace(hour=17, minute=0)

    declined_lesson = Lesson(
        title="E2E Declined Count Class",
        start_datetime=declined_start,
        end_datetime=declined_end,
        is_recurring=False,
        type="academy",
        max_players=4,
        club_id=club.id,
        color="#f59e0b",
        status="active",
    )
    db.session.add(declined_lesson)
    db.session.flush()

    db.session.add(
        Association_CoachLesson(coach_id=coach.id, lesson_id=declined_lesson.id)
    )

    declined_instance = LessonInstance(
        lesson_id=declined_lesson.id,
        start_datetime=declined_start,
        end_datetime=declined_end,
        max_players=4,
        status="scheduled",
        level_id=level_intermediate.id,
        notifications_enabled=True,
        original_lesson_occurence_date=declined_start.date(),
    )
    db.session.add(declined_instance)
    db.session.flush()

    db.session.add(
        Association_CoachLessonInstance(
            coach_id=coach.id,
            lesson_instance_id=declined_instance.id,
        )
    )

    # 3 enrolled: the first stays pending (still counts), the other 2 declined.
    for idx, declined_member in enumerate(filler_players[:3]):
        db.session.add(
            Association_PlayerLessonInstance(
                player_id=declined_member.id,
                lesson_instance_id=declined_instance.id,
            )
        )
        db.session.add(
            Presence(
                player_id=declined_member.id,
                lesson_instance_id=declined_instance.id,
                invited=True,
                confirmed=idx > 0,
                status="absent" if idx > 0 else None,
                justification="justified" if idx > 0 else None,
            )
        )

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
        # Convert Python weekday() (Mon=0, Tue=1) to the app's canonical JS
        # getDay() convention (Sun=0, Mon=1, Tue=2) so Tuesday materializes on
        # Tuesday. See packages/types/src/domain.ts and backend WEEKDAY_MAP.
        recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(next_tuesday.weekday() + 1) % 7]}),
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

    # Enrol the student in the recurring lesson (PAD-64). The lesson has no
    # materialized instance yet; when an occurrence is materialized (e.g. a
    # coach marks attendance), get_or_materialize_instance copies the lesson's
    # players_relations into auto-created Presence rows — so attendance for a
    # recurring occurrence has a participant to record and persist.
    player_recurring = Association_PlayerLesson(
        player_id=student.id,
        lesson_id=recurring_lesson.id,
    )
    db.session.add(player_recurring)

    # ── Pending confirmations class (PAD-78) ──────────────────────────────────
    # A class TOMORROW whose invited students have been notified but have not yet
    # responded. The coach dashboard "pending confirmations" card counts these,
    # and the "send manual notification" button targets exactly this set.
    #   - filler[5] + filler[6]: NotificationEvent status="sent"  -> PENDING
    #   - filler[7]: status="confirmed"                           -> excluded
    #   - filler[8]: status="expired" (declined/timed out)        -> excluded
    # => pending count for tomorrow = 2.
    #
    # NB: deliberately uses *filler* players (only referenced by pagination /
    # search specs), NOT e2e-student / e2e-student-2. The manual-notify E2E test
    # actually fires send_manual_notifications, which posts a system message into
    # the coach<->student direct conversation — using the real students would
    # pollute the conversation the messaging specs (US-57..US-64) depend on.
    pending_students = filler_players[5:7]
    tomorrow = today + timedelta(days=1)
    pending_start = tomorrow.replace(hour=18, minute=0)
    pending_end = tomorrow.replace(hour=19, minute=0)

    pending_lesson = Lesson(
        title="E2E Pending Confirm Class",
        start_datetime=pending_start,
        end_datetime=pending_end,
        is_recurring=False,
        type="academy",
        max_players=6,
        club_id=club.id,
        color="#ef4444",
        status="active",
    )
    db.session.add(pending_lesson)
    db.session.flush()

    db.session.add(
        Association_CoachLesson(coach_id=coach.id, lesson_id=pending_lesson.id)
    )

    pending_instance = LessonInstance(
        lesson_id=pending_lesson.id,
        start_datetime=pending_start,
        end_datetime=pending_end,
        max_players=6,
        status="scheduled",
        level_id=level_beginner.id,
        notifications_enabled=True,
        original_lesson_occurence_date=pending_start.date(),
    )
    db.session.add(pending_instance)
    db.session.flush()

    db.session.add(
        Association_CoachLessonInstance(
            coach_id=coach.id,
            lesson_instance_id=pending_instance.id,
        )
    )

    # Two pending students (invited + notified, no response yet).
    for pending_member in pending_students:
        db.session.add(
            Association_PlayerLessonInstance(
                player_id=pending_member.id,
                lesson_instance_id=pending_instance.id,
            )
        )
        db.session.add(
            Presence(
                player_id=pending_member.id,
                lesson_instance_id=pending_instance.id,
                invited=True,
                confirmed=False,
            )
        )
        db.session.add(
            NotificationEvent(
                coach_id=coach.id,
                lesson_instance_id=pending_instance.id,
                player_id=pending_member.id,
                type="auto",
                round_number=1,
                status="sent",
            )
        )

    # One already-confirmed and one already-declined student — must NOT be counted.
    db.session.add(
        NotificationEvent(
            coach_id=coach.id,
            lesson_instance_id=pending_instance.id,
            player_id=filler_players[7].id,
            type="auto",
            round_number=1,
            status="confirmed",
        )
    )
    db.session.add(
        NotificationEvent(
            coach_id=coach.id,
            lesson_instance_id=pending_instance.id,
            player_id=filler_players[8].id,
            type="auto",
            round_number=1,
            status="expired",
        )
    )

    # ── Attended history (PAD-114) ───────────────────────────────────────────
    # The attendance page (specs/attendance/spec.md → attendance.history) counts a
    # class as attended when `Presence.status == "present"`. Nothing else in the
    # seed produced such a row, so every chart range and every history list would
    # have been empty and the spec vacuous.
    #
    # Placement rules, so this fixture cannot perturb other specs:
    #   * every instance is at least 8 days old — 8 days back is always in an
    #     EARLIER week than today, so none of these ever appear in the calendar's
    #     default (current) week;
    #   * they hang off their own lesson, and the student is attached to the
    #     INSTANCES only (Association_PlayerLessonInstance + Presence), never to
    #     the parent Lesson, so no "my classes" list gains an entry;
    #   * `validated=True`, because the coach dashboard's "Pending validation"
    #     KPI counts `Presence.validated == False` — unvalidated rows would have
    #     silently moved a KPI other specs read;
    #   * 11:00 UTC keeps every row far from a midnight day-boundary, which is
    #     where PAD-33's timezone flakiness lived.
    attended_lesson = Lesson(
        title="E2E Attended Class",
        start_datetime=today - timedelta(days=250),
        end_datetime=today - timedelta(days=250) + timedelta(hours=1),
        is_recurring=False,
        type="academy",
        max_players=6,
        club_id=club.id,
        color="#6366f1",
        status="active",
    )
    db.session.add(attended_lesson)
    db.session.flush()

    db.session.add(
        Association_CoachLesson(coach_id=coach.id, lesson_id=attended_lesson.id)
    )

    attended_instances = []
    for days_ago in (8, 15, 45, 120, 250):
        attended_start = (today - timedelta(days=days_ago)).replace(
            hour=11, minute=0, second=0, microsecond=0
        )
        attended_instance = LessonInstance(
            lesson_id=attended_lesson.id,
            start_datetime=attended_start,
            end_datetime=attended_start + timedelta(hours=1),
            max_players=6,
            status="scheduled",
            level_id=level_beginner.id,
            notifications_enabled=False,
            original_lesson_occurence_date=attended_start.date(),
        )
        db.session.add(attended_instance)
        db.session.flush()

        db.session.add(
            Association_CoachLessonInstance(
                coach_id=coach.id,
                lesson_instance_id=attended_instance.id,
            )
        )
        db.session.add(
            Association_PlayerLessonInstance(
                player_id=student.id,
                lesson_instance_id=attended_instance.id,
            )
        )
        db.session.add(
            Presence(
                player_id=student.id,
                lesson_instance_id=attended_instance.id,
                invited=True,
                confirmed=True,
                status="present",
                validated=True,
            )
        )
        attended_instances.append(attended_instance)

    # ── Classes awaiting validation (PAD-140) ────────────────────────────────
    # The Presences tab (specs/attendance/spec.md → attendance.validation) lists
    # classes that have ENDED but whose presences are not yet validated. The
    # PAD-114 fixture above deliberately sets validated=True, so without this
    # block the queue is always empty and any spec over it is vacuous.
    #
    # Placement rules, so this cannot perturb other specs:
    #   * both instances sit in the PREVIOUS Monday-Sunday week. They must be
    #     past (`end_datetime <= now`) to be validatable, but putting them in
    #     the current week crowds the calendar's default view and flipped
    #     `participant-count-effective.spec.ts` into a compact card layout that
    #     drops the "1/4" count. Same containment rule the PAD-114 fixture uses.
    #     The Presences spec navigates back one week to reach them;
    #   * they hang off their own lesson, with the students attached to that
    #     lesson so they read as enrolled (not guests);
    #   * one class has every student answered ("ready to confirm"), the other
    #     leaves a student silent ("needs your input") — the two states the tab
    #     is built around;
    #   * 11:00 UTC, away from the midnight boundary (PAD-33).
    #
    # These DO add to the coach dashboard's "Pending validation" KPI, which is
    # correct — they are genuinely pending. No spec asserts an exact value for it.
    validation_lesson = Lesson(
        title="E2E Validation Class",
        start_datetime=today - timedelta(days=today.weekday() + 5),
        end_datetime=today - timedelta(days=today.weekday() + 5) + timedelta(hours=1),
        is_recurring=False,
        type="academy",
        max_players=6,
        club_id=club.id,
        color="#f59e0b",
        status="active",
    )
    db.session.add(validation_lesson)
    db.session.flush()
    db.session.add(
        Association_CoachLesson(coach_id=coach.id, lesson_id=validation_lesson.id)
    )
    for enrolled in (student, student2):
        db.session.add(
            Association_PlayerLesson(
                player_id=enrolled.id, lesson_id=validation_lesson.id
            )
        )

    # Previous week's Wednesday and Thursday at 11:00 UTC: always in the past,
    # always in an earlier week than today whatever weekday the suite runs on,
    # and away from the midnight boundary (PAD-33).
    prev_monday = today - timedelta(days=today.weekday() + 7)
    for day_offset, everyone_answered in ((2, True), (3, False)):
        v_start = (prev_monday + timedelta(days=day_offset)).replace(
            hour=11, minute=0, second=0, microsecond=0
        )
        v_instance = LessonInstance(
            lesson_id=validation_lesson.id,
            start_datetime=v_start,
            end_datetime=v_start + timedelta(hours=1),
            max_players=6,
            status="scheduled",
            level_id=level_beginner.id,
            notifications_enabled=False,
            original_lesson_occurence_date=v_start.date(),
        )
        db.session.add(v_instance)
        db.session.flush()
        db.session.add(
            Association_CoachLessonInstance(
                coach_id=coach.id, lesson_instance_id=v_instance.id
            )
        )
        for enrolled, answered in ((student, True), (student2, everyone_answered)):
            db.session.add(
                Association_PlayerLessonInstance(
                    player_id=enrolled.id, lesson_instance_id=v_instance.id
                )
            )
            db.session.add(
                Presence(
                    player_id=enrolled.id,
                    lesson_instance_id=v_instance.id,
                    invited=True,
                    confirmed=answered,
                    status=None,
                    validated=False,
                )
            )

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

    # ── Older conversation (coach <-> student 2), last message YESTERDAY ──────
    # PAD-98: the chat list must show the day (not only the time). This
    # conversation's last message is dated to yesterday (midday UTC — safe from
    # midnight/timezone drift) so the list renders a "Yesterday" day label.
    # It is fully read (last_read_at = now) so it does not affect unread badges.
    yesterday_noon = (_utcnow_naive() - timedelta(days=1)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    conversation2 = Conversation(
        is_group=False,
        participant_key=Conversation.build_participant_key([coach_user.id, student2_user.id]),
    )
    db.session.add(conversation2)
    db.session.flush()
    db.session.add(ConversationParticipant(
        conversation_id=conversation2.id,
        user_id=coach_user.id,
        last_read_at=_utcnow_naive(),
    ))
    db.session.add(ConversationParticipant(
        conversation_id=conversation2.id,
        user_id=student2_user.id,
        last_read_at=_utcnow_naive(),
    ))
    db.session.flush()
    db.session.add(Message(
        conversation_id=conversation2.id,
        sender_id=student2_user.id,
        text="See you next week!",
        sent_at=yesterday_noon,
    ))

    # ── Commit ────────────────────────────────────────────────────────────────
    db.session.commit()
    print("[seed] Done. Created:")
    print(f"  Coach: {coach_user.username} / E2eCoach123!")
    print(f"  Student 1: {student_user.username} / E2eStudent123!")
    print(f"  Student 2: {student2_user.username} / E2eStudent2123!")
    print(f"  Club: {club.name}")
    print(f"  Lesson instance: {instance.id} at {instance.start_datetime}")
    print(f"  Recurring lesson: {recurring_lesson.id} '{recurring_lesson.title}' (weekly on Tue, {recurring_start} - {recurrence_end_date})")
    print(f"  Declined-count instance: {declined_instance.id} '{declined_lesson.title}' at {declined_start} (3 enrolled, 2 declined, max 4)")
    print(f"  Conversation {conversation.id} (coach<->student) with 2 messages (1 unread for coach)")
    print(f"  Conversation {conversation2.id} (coach<->student2) last message yesterday (read)")
    print(
        f"  Attended history (PAD-114): {len(attended_instances)} past instances of "
        f"'{attended_lesson.title}' with presence status=present for {student_user.username}"
    )
