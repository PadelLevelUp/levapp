from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


def _is_claimable_user(user):
    from padel_app.tools.username_tools import is_placeholder_username

    return bool(
        user is not None
        and user.password is None
        and is_placeholder_username(user.username)
        and user.status == "inactive"
    )


def _is_placeholder_user(user):
    """players.remove rule 5 (PAD-274): never activated and no password, whatever
    the username. Such a record has no account anyone can log into."""
    return bool(user is not None and user.password is None and user.status == "inactive")


def _is_deletable_by_coach(player):
    """players.remove rule 5: a placeholder that no other coach has. The coach
    count is read only for placeholders, so listing a roster adds no query per
    student with an account."""
    return bool(player is not None and _is_placeholder_user(player.user) and len(player.coaches_relations) <= 1)


class Player(db.Model, model.Model):
    __tablename__ = "players"
    __table_args__ = {"extend_existing": True}

    page_title = "Players"
    model_name = "Player"

    id = Column(Integer, primary_key=True)
    
    # auth.account-profiles rule 1 (PAD-260): one account, at most one player profile,
    # never an orphan. The migration names these fk_players_user_id / uq_players_user_id.
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    user = relationship("User", back_populates="player")

    # Relations to lessons
    lessons_relations = relationship(
        "Association_PlayerLesson",
        back_populates="player",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    
    @property
    def name(self):
        return self.user.name

    @property
    def lessons(self):
        return [rel.lesson for rel in self.lessons_relations]
    
    presences = relationship(
        "Presence",
        back_populates="player",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    lesson_instances_relations = relationship(
        "Association_PlayerLessonInstance",
        back_populates="player",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def lesson_instances(self):
        return [rel.lesson_instance for rel in self.lesson_instances_relations]

    clubs_relations = relationship(
        "Association_PlayerClub", back_populates="player", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def clubs(self):
        return [rel.club for rel in self.clubs_relations]

    coaches_relations = relationship(
        "Association_CoachPlayer", back_populates="player", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def coaches(self):
        return [rel.coach for rel in self.coaches_relations]

    # Level history
    level_history = relationship(
        "PlayerLevelHistory", 
        back_populates="player", 
        cascade="all, delete-orphan",
        order_by="desc(PlayerLevelHistory.assigned_at)",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Player {self.name}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "name", "label": "Name"}
        columns = [
            {"field": "name", "label": "Name"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, type, label=None, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                type=type,
                label=label or name.capitalize(),
                **kwargs,
            )

        form = Form()

        info_block = Block(
            "info_block",
            fields=[
                get_field("user", type="ManyToOne", label="User", related_model="User"),
                get_field(
                    "lessons_relations",
                    type="OneToMany",
                    label="Lessons",
                    related_model="Association_PlayerLesson",
                ),
                get_field(
                    "lesson_instances_relations",
                    type="OneToMany",
                    label="Lesson Instances",
                    related_model="Association_PlayerLessonInstance",
                ),
                get_field(
                    "level_history",
                    type="OneToMany",
                    label="Level History",
                    related_model="PlayerLevelHistory",
                ),
            ],
        )
        form.add_block(info_block)

        return form

    def coach_player_info(self, coach_id):
        # PAD-112: same block fields as `_serialize_coach_player_relation`, from
        # the same helper. `add_player`/`edit_player` return THIS dict, so the
        # coach's "notifications cut" signal would disappear right after an edit
        # if the two ever drifted.
        from padel_app.services.player_service import _activation_token_if_inactive
        from padel_app.services.student_notification_preferences import (
            notification_block_payload,
        )

        rel = next((r for r in self.coaches_relations if r.coach_id == coach_id), None)
        return {
            **notification_block_payload(self.user),
            "id": f"p-{self.id}_c-{coach_id}",
            "coachId": coach_id,
            "playerId": self.id,
            "levelId": str(rel.level_id) if rel.level_id else None,
            "notes": rel.notes,
            "name": self.user.name,        
            "email": self.user.email,        
            "phone": self.user.phone,        
            "username": self.user.username,
            "side": rel.side,
            "userId": self.user_id,
            "isActive": self.user.status == 'active',
            # auth.activate rule 3 (PAD-254): same key as the roster serializer.
            "activationToken": _activation_token_if_inactive(self.user),
            # PAD-30: profile-completion signal (password set via PAD-32
            # self-service registration). Distinct from isActive, which a
            # coach-disabled player would fail while still being validated.
            "validated": self.user.password is not None,
            # PAD-213: a never-activated placeholder the coach may link to an
            # existing account (players.claim rule 1).
            "claimable": _is_claimable_user(self.user),
            # players.remove rule 5 (PAD-274): whether this coach may delete the
            # record; otherwise the apps offer Disconnect.
            "deletable": _is_deletable_by_coach(self),
        }
