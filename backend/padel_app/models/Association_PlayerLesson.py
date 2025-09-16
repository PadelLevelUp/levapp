from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_PlayerLesson(db.Model, model.Model):
    __tablename__ = "player_in_lesson"
    __table_args__ = (
        UniqueConstraint("player_id", "lesson_id", name="uq_player_lesson"),
        {"extend_existing": True},
    )

    page_title = "Player ↔ Lesson"
    model_name = "association_playerlesson"

    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"))
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"))

    player = relationship("Player", back_populates="lessons_relations")
    lesson = relationship("Lesson", back_populates="players_relations")

    def __repr__(self):
        return f"<PlayerLesson {self.player.name} - {self.lesson.title}>"

    def __str__(self):
        return f"{self.player.name} - {self.lesson.title}"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "player", "label": "Player"}
        columns = [
            {"field": "player", "label": "Player"},
            {"field": "lesson", "label": "Lesson"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, field_type, label=None, **kwargs):
            return Field(
                name=name,
                field_type=field_type,
                label=label or name.capitalize(),
                **kwargs,
            )

        info_block = Block(
            "info_block",
            "Player ↔ Lesson",
            fields=[
                get_field(
                    "player_id", "ManyToOne", label="Player", related_model="Player"
                ),
                get_field(
                    "lesson_id", "ManyToOne", label="Lesson", related_model="Lesson"
                ),
            ],
        )
        return Form(blocks=[info_block])
