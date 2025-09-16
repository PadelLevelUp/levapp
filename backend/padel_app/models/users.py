from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form
from flask_login import UserMixin


class User(db.Model, model.Model, UserMixin):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    page_title = "User"
    model_name = "User"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    generated_code = Column(Integer)

    user_image_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    user_image = relationship("Image", foreign_keys=[user_image_id])

    # Relationships
    messages_sent = relationship(
        "Message",
        foreign_keys="Message.sender_id",
        back_populates="sender",
        cascade="all, delete-orphan",
    )
    messages_received = relationship(
        "Message",
        foreign_keys="Message.receiver_id",
        back_populates="receiver",
        cascade="all, delete-orphan",
    )

    @property
    def user_image_url(self):
        return self.user_image.url() if self.user_image else None

    def display_all_info(self):
        searchable = {"field": "username", "label": "Username"}
        fields = [
            {"field": "name", "label": "Name"},
            {"field": "email", "label": "Email"},
            {"field": "is_admin", "label": "Admin"},
            {"field": "generated_code", "label": "Generated Code"},
        ]
        return searchable, fields

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                required=required,
            )

        form = Form()

        picture_block = Block(
            "picture_block",
            fields=[get_field("user_image_id", "User Image", "Picture")],
        )
        form.add_block(picture_block)

        info_block = Block(
            "info_block",
            fields=[
                get_field("name", "Name", "Text", required=True),
                get_field("username", "Username", "Text", required=True),
                get_field("email", "Email", "Text", required=True),
                get_field("password", "Password", "Password", required=True),
                get_field("is_admin", "Admin", "Boolean"),
                get_field("generated_code", "Generated Code", "Integer"),
            ],
        )
        form.add_block(info_block)

        return form
