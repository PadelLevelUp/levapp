"""players.claim rule 5 — the merge (PAD-213).

One test per table the merge re-points, the two collision cases, and a
metadata guard that fails when a new ``players.id`` FK appears that the merge
does not cover.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db


# ── fixtures ────────────────────────────────────────────────────────────────

def _placeholder(app, coach_id, club_id, name="Ana S.", level_id=None, side="left", notes="lefty"):
    """A coach-created player: placeholder username, no password, inactive."""
    from padel_app.models import (
        Association_CoachPlayer, Association_PlayerClub, Player, User,
    )
    from padel_app.tools.username_tools import unique_placeholder_username

    with app.app_context():
        user = User(name=name, username=unique_placeholder_username(), password=None, status="inactive")
        db.session.add(user); db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player); db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player.id, level_id=level_id, side=side, notes=notes))
        db.session.add(Association_PlayerClub(player_id=player.id, club_id=club_id))
        db.session.commit()
        return user.id, player.id


def _student(app, username="ana", name="Ana Silva"):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name=name, username=username, email=f"{username}@example.com", password="pw", status="active")
        db.session.add(user); db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player); db.session.commit()
        return user.id, player.id


def _coach(app, username="maria", club_name="Padel Academy"):
    from padel_app.models import Association_CoachClub, Club, Coach, CoachLevel, User

    with app.app_context():
        user = User(name="Maria", username=username, email=f"{username}@example.com", password="pw", status="active")
        db.session.add(user); db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach); db.session.flush()
        club = Club(name=club_name)
        db.session.add(club); db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        level = CoachLevel(coach_id=coach.id, code="B1", label="Beginner", display_order=1)
        db.session.add(level); db.session.commit()
        return user.id, coach.id, club.id, level.id


def _lesson_with_instance(app, club_id, coach_id, when=None):
    from padel_app.models import Association_CoachLesson, Lesson, LessonInstance

    when = when or (datetime(2026, 9, 10, 10, 0))
    with app.app_context():
        lesson = Lesson(title="Class", type="academy", club_id=club_id, start_datetime=when,
                        end_datetime=when + timedelta(hours=1), max_players=4)
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=when, end_datetime=when + timedelta(hours=1), max_players=4)
        db.session.add(inst); db.session.commit()
        return lesson.id, inst.id


def _merge(app, placeholder_player_id, claimant_user_id):
    from padel_app.models import Player, User
    from padel_app.services.player_claim_service import merge_placeholder_player_into

    with app.app_context():
        return merge_placeholder_player_into(Player.query.get(placeholder_player_id), User.query.get(claimant_user_id)).id


@pytest.fixture
def world(app):
    cu, cid, club, level = _coach(app)
    pu, pid = _placeholder(app, cid, club, level_id=level)
    su, sid = _student(app)
    return {"coach_user": cu, "coach": cid, "club": club, "level": level,
            "ph_user": pu, "ph_player": pid, "st_user": su, "st_player": sid}


# ── a. coach relations and club ─────────────────────────────────────────────

def test_coach_relation_moves_with_level_side_notes(app, world):
    from padel_app.models import Association_CoachPlayer, Player, User

    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        rel = Association_CoachPlayer.query.filter_by(coach_id=world["coach"], player_id=world["st_player"]).one()
        assert rel.level_id == world["level"] and rel.side == "left" and rel.notes == "lefty"
        assert Player.query.get(world["ph_player"]) is None
        st = User.query.get(world["st_user"])
        assert st.name == "Ana Silva" and st.username == "ana"


def test_existing_coach_relation_keeps_claimants_row_and_borrows_nulls(app, world):
    from padel_app.models import Association_CoachPlayer

    with app.app_context():
        db.session.add(Association_CoachPlayer(coach_id=world["coach"], player_id=world["st_player"], level_id=None, side="right", notes=None))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        rels = Association_CoachPlayer.query.filter_by(coach_id=world["coach"]).all()
        assert len(rels) == 1
        assert rels[0].player_id == world["st_player"]
        assert rels[0].level_id == world["level"]      # borrowed
        assert rels[0].side == "right"                 # claimant's kept
        assert rels[0].notes == "lefty"                # borrowed


def test_club_membership_moves_without_duplicates(app, world):
    from padel_app.models import Association_PlayerClub

    with app.app_context():
        db.session.add(Association_PlayerClub(player_id=world["st_player"], club_id=world["club"])); db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        rows = Association_PlayerClub.query.filter_by(club_id=world["club"]).all()
        assert [r.player_id for r in rows] == [world["st_player"]]


# ── b. enrolments and waiting lists ─────────────────────────────────────────

def test_lesson_and_instance_enrolments_move(app, world):
    from padel_app.models import Association_PlayerLesson, Association_PlayerLessonInstance

    lesson_id, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        db.session.add(Association_PlayerLesson(player_id=world["ph_player"], lesson_id=lesson_id))
        db.session.add(Association_PlayerLessonInstance(player_id=world["ph_player"], lesson_instance_id=inst_id))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        assert Association_PlayerLesson.query.filter_by(lesson_id=lesson_id).one().player_id == world["st_player"]
        assert Association_PlayerLessonInstance.query.filter_by(lesson_instance_id=inst_id).one().player_id == world["st_player"]


def test_duplicate_instance_enrolment_is_dropped(app, world):
    from padel_app.models import Association_PlayerLessonInstance

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        db.session.add(Association_PlayerLessonInstance(player_id=world["ph_player"], lesson_instance_id=inst_id))
        db.session.add(Association_PlayerLessonInstance(player_id=world["st_player"], lesson_instance_id=inst_id))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        rows = Association_PlayerLessonInstance.query.filter_by(lesson_instance_id=inst_id).all()
        assert [r.player_id for r in rows] == [world["st_player"]]


def test_waiting_list_entries_move(app, world):
    from padel_app.models import StandingWaitingListEntry, WaitingListEntry

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        standing = StandingWaitingListEntry(coach_id=world["coach"], player_id=world["ph_player"], credits_total=3,
                                            expires_at=datetime(2026, 12, 1))
        db.session.add(standing); db.session.flush()
        db.session.add(WaitingListEntry(lesson_instance_id=inst_id, player_id=world["ph_player"], coach_id=world["coach"],
                                        standing_entry_id=standing.id))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        assert StandingWaitingListEntry.query.one().player_id == world["st_player"]
        assert WaitingListEntry.query.one().player_id == world["st_player"]


# ── c. presences ────────────────────────────────────────────────────────────

def test_presences_move(app, world):
    from padel_app.models import Presence

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        db.session.add(Presence(player_id=world["ph_player"], lesson_instance_id=inst_id, status="present", validated=True))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        p = Presence.query.filter_by(lesson_instance_id=inst_id).one()
        assert p.player_id == world["st_player"] and p.status == "present"


def test_duplicate_presence_resolves_to_the_claimants(app, world):
    """Spec: 'Duplicate presence resolves to the claimant's'."""
    from padel_app.models import Presence

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        db.session.add(Presence(player_id=world["ph_player"], lesson_instance_id=inst_id, status="absent"))
        mine = Presence(player_id=world["st_player"], lesson_instance_id=inst_id, status="present")
        db.session.add(mine); db.session.commit(); mine_id = mine.id
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        rows = Presence.query.filter_by(lesson_instance_id=inst_id).all()
        assert len(rows) == 1 and rows[0].id == mine_id and rows[0].status == "present"


# ── d. plain re-points ──────────────────────────────────────────────────────

def test_level_history_moves(app, world):
    from padel_app.models import PlayerLevelHistory

    with app.app_context():
        db.session.add(PlayerLevelHistory(coach_id=world["coach"], player_id=world["ph_player"], level_id=world["level"]))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        assert PlayerLevelHistory.query.one().player_id == world["st_player"]


def test_notification_events_and_vacancies_move(app, world):
    from padel_app.models import NotificationEvent, Vacancy

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        v = Vacancy(lesson_instance_id=inst_id, coach_id=world["coach"], original_player_id=world["ph_player"],
                    filled_by_player_id=world["ph_player"])
        db.session.add(v); db.session.flush()
        db.session.add(NotificationEvent(coach_id=world["coach"], lesson_instance_id=inst_id, player_id=world["ph_player"],
                                         vacancy_id=v.id))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        v = Vacancy.query.one()
        assert v.original_player_id == world["st_player"] and v.filled_by_player_id == world["st_player"]
        assert NotificationEvent.query.one().player_id == world["st_player"]


def test_replacement_prompts_move(app, world):
    from padel_app.models import ReplacementApprovalPrompt, Vacancy

    _, inst_id = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        v = Vacancy(lesson_instance_id=inst_id, coach_id=world["coach"])
        db.session.add(v); db.session.flush()
        db.session.add(ReplacementApprovalPrompt(coach_id=world["coach"], vacancy_id=v.id, bundle_id="b1",
                                                 declined_player_id=world["ph_player"],
                                                 waiting_list_player_id=world["ph_player"]))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        r = ReplacementApprovalPrompt.query.one()
        assert r.declined_player_id == world["st_player"] and r.waiting_list_player_id == world["st_player"]


def test_pending_invitation_moves_and_is_accepted(app, world):
    from padel_app.models import PlayerInvitation

    with app.app_context():
        db.session.add(PlayerInvitation(player_id=world["ph_player"], token="tok-1", invited_by_coach_id=world["coach"],
                                        status="pending", expires_at=datetime(2030, 1, 1)))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        inv = PlayerInvitation.query.one()
        assert inv.player_id == world["st_player"] and inv.status == "accepted"


# ── e. the placeholder user's rows ──────────────────────────────────────────

def _conversation(app, *user_ids):
    from padel_app.models import Conversation, ConversationParticipant

    with app.app_context():
        conv = Conversation(participant_key=Conversation.build_participant_key(list(user_ids)), is_group=len(user_ids) > 2)
        db.session.add(conv); db.session.flush()
        for uid in user_ids:
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))
        db.session.commit()
        return conv.id


def _say(app, conv_id, sender_id, text, when):
    from padel_app.models import Message

    with app.app_context():
        m = Message(text=text, sender_id=sender_id, conversation_id=conv_id, sent_at=when)
        db.session.add(m); db.session.commit()
        return m.id


def test_chat_history_follows_the_claim(app, world):
    """Spec: 'Chat history follows the claim' — no prior thread with the claimant."""
    from padel_app.models import Conversation, ConversationParticipant, Message

    conv = _conversation(app, world["coach_user"], world["ph_user"])
    for i in range(4):
        _say(app, conv, world["coach_user"], f"m{i}", datetime(2026, 9, 1, 10, i))
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        c = Conversation.query.get(conv)
        assert c.participant_key == Conversation.build_participant_key([world["coach_user"], world["st_user"]])
        assert {p.user_id for p in c.participants} == {world["coach_user"], world["st_user"]}
        assert Message.query.filter_by(conversation_id=conv).count() == 4
        assert ConversationParticipant.query.filter_by(user_id=world["ph_user"]).count() == 0


def test_chat_collision_merges_into_the_existing_thread(app, world):
    """Spec: coach already chatted with the claimant → one thread, all messages, right key."""
    from padel_app.models import Conversation, ConversationParticipant, Message, MessageReaction

    old = _conversation(app, world["coach_user"], world["ph_user"])
    mine = _conversation(app, world["coach_user"], world["st_user"])
    ids = [_say(app, old, world["coach_user"], f"old{i}", datetime(2026, 9, 1, 10, i)) for i in range(4)]
    _say(app, mine, world["coach_user"], "mine0", datetime(2026, 9, 2, 10, 0))
    newest = _say(app, mine, world["st_user"], "mine1", datetime(2026, 9, 3, 10, 0))
    with app.app_context():
        db.session.add(MessageReaction(message_id=ids[0], user_id=world["ph_user"], emoji="👍"))
        cp = ConversationParticipant.query.filter_by(conversation_id=old, user_id=world["ph_user"]).one()
        cp.last_read_at = datetime(2026, 9, 1, 10, 30)
        db.session.commit()

    _merge(app, world["ph_player"], world["st_user"])

    with app.app_context():
        assert Conversation.query.get(old) is None
        c = Conversation.query.get(mine)
        assert c.participant_key == Conversation.build_participant_key([world["coach_user"], world["st_user"]])
        assert Message.query.filter_by(conversation_id=mine).count() == 6
        assert Message.query.count() == 6
        assert c.last_message_id == newest and c.last_message_at == datetime(2026, 9, 3, 10, 0)
        assert MessageReaction.query.one().user_id == world["st_user"]
        seat = ConversationParticipant.query.filter_by(conversation_id=mine, user_id=world["st_user"]).one()
        assert seat.last_read_at == datetime(2026, 9, 1, 10, 30)
        assert ConversationParticipant.query.filter_by(user_id=world["ph_user"]).count() == 0


def test_messages_sent_calendar_blocks_and_blocks_move(app, world):
    from padel_app.models import BlockedUser, CalendarBlock, Message

    conv = _conversation(app, world["coach_user"], world["ph_user"])
    mid = _say(app, conv, world["ph_user"], "hi", datetime(2026, 9, 1, 10, 0))
    with app.app_context():
        db.session.add(CalendarBlock(user_id=world["ph_user"], type="personal", start_datetime=datetime(2026, 9, 5, 9),
                                     end_datetime=datetime(2026, 9, 5, 10)))
        db.session.add(BlockedUser(blocker_id=world["ph_user"], blocked_id=world["coach_user"]))
        db.session.commit()
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        assert Message.query.get(mid).sender_id == world["st_user"]
        assert CalendarBlock.query.one().user_id == world["st_user"]
        assert BlockedUser.query.one().blocker_id == world["st_user"]


# ── f/g. retirement and identity ────────────────────────────────────────────

def test_placeholder_user_is_retired_and_claimant_untouched(app, world):
    from padel_app.models import Player, User
    from padel_app.tools.username_tools import is_placeholder_username

    with app.app_context():
        old_username = User.query.get(world["ph_user"]).username
    _merge(app, world["ph_player"], world["st_user"])
    with app.app_context():
        ph = User.query.get(world["ph_user"])
        assert ph is not None and ph.status == "disabled" and ph.name == "Merged user"
        assert ph.email is None and ph.phone is None
        assert is_placeholder_username(ph.username) and ph.username != old_username
        assert Player.query.get(world["ph_player"]) is None
        st = User.query.get(world["st_user"])
        assert (st.name, st.username, st.email, st.status) == ("Ana Silva", "ana", "ana@example.com", "active")


# ── guards ──────────────────────────────────────────────────────────────────

def test_activated_player_is_not_claimable(app, world):
    from werkzeug.exceptions import Conflict
    from padel_app.models import User

    with app.app_context():
        u = User.query.get(world["ph_user"]); u.password = "set"; u.status = "active"; u.username = "real"; db.session.commit()
    with pytest.raises(Conflict):
        _merge(app, world["ph_player"], world["st_user"])


def test_coach_account_cannot_claim(app, world):
    from werkzeug.exceptions import Forbidden

    with pytest.raises(Forbidden):
        _merge(app, world["ph_player"], world["coach_user"])


def test_every_players_fk_is_covered_by_the_merge(app):
    """A new FK onto players.id must be added to MERGED_PLAYER_FK_TABLES (and
    handled) — this test is what fails first."""
    from padel_app.services.player_claim_service import MERGED_PLAYER_FK_TABLES

    with app.app_context():
        referencing = set()
        for table in db.metadata.tables.values():
            for fk in table.foreign_keys:
                if fk.column.table.name == "players":
                    referencing.add(table.name)
        assert referencing == MERGED_PLAYER_FK_TABLES, (
            f"uncovered: {referencing - MERGED_PLAYER_FK_TABLES}; stale: {MERGED_PLAYER_FK_TABLES - referencing}"
        )
