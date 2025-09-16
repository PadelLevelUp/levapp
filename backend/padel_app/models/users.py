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
    model_name = "user"

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

    @staticmethod
    def get_create_form():
        def get_field(name, label, field_type, **kwargs):
            return Field(name=name, label=label, field_type=field_type, **kwargs)

        picture_block = Block(
            title="Profile Picture",
            fields=[get_field("user_image_id", "User Image", "Picture")],
        )

        info_block = Block(
            title="User Info",
            fields=[
                get_field("name", "Name", "Text"),
                get_field("username", "Username", "Text"),
                get_field("email", "Email", "Text"),
                get_field("password", "Password", "Password"),
                get_field("is_admin", "Admin", "Boolean"),
                get_field("generated_code", "Generated Code", "Integer"),
            ],
        )

        return Form(blocks=[picture_block, info_block])
