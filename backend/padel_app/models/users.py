from sqlalchemy import Column, DateTime, Integer, String, Text, Boolean, ForeignKey, Enum
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
    email = Column(String(120), unique=True, nullable=True)
    phone = Column(String(20), nullable=True)
    # PAD-81: optional short badge label shown next to the user across the app.
    # When NULL the abbreviation is derived from `name` (see `abbreviation_display`),
    # which is exactly what the app did before the column existed.
    abbreviation = Column(String(8), nullable=True)
    password = Column(String(255), nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    generated_code = Column(Integer)

    user_image_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    user_image = relationship("Image", foreign_keys=[user_image_id])
    
    player = relationship("Player", back_populates="user", uselist=False)
    coach = relationship(
        "Coach", back_populates="user", uselist=False, foreign_keys="Coach.user_id"
    )
    calendar_blocks = relationship("CalendarBlock", back_populates="user")

    # Relationships
    messages_sent = relationship(
        "Message",
        foreign_keys="Message.sender_id",
        back_populates="sender",
        cascade="all, delete-orphan",
    )

    status = Column(
        Enum("inactive", "active", "disabled", name="activation_status"),
        nullable=False,
        server_default="inactive",
    )

    language = Column(
        String(2),
        nullable=False,
        server_default="pt",
        default="pt",
    )

    # ── auth.email-verification (PAD-234) ────────────────────────────────────
    #
    # `email_verification_required` is set only by self-signup and by a
    # self-service email change; a coach-typed email never triggers the step,
    # so a coach-created player is not stopped on first sign-in. The code is
    # stored as an HMAC (`email_verification_service`), never in clear.
    email_verification_required = Column(
        Boolean, nullable=False, server_default="0", default=False,
    )
    email_verified_at = Column(DateTime, nullable=True)
    email_verification_code_hash = Column(String(128), nullable=True)
    email_verification_expires_at = Column(DateTime, nullable=True)
    email_verification_sent_at = Column(DateTime, nullable=True)
    email_verification_attempts = Column(
        Integer, nullable=False, server_default="0", default=0,
    )

    # ── auth.password-recovery (PAD-139) ─────────────────────────────────────
    #
    # Same shape as the verification code: an HMAC, never the code, 15-minute
    # expiry, 5 attempts, single-use. Replaces the legacy plaintext
    # `generated_code`, which no route reads or writes any more.
    password_reset_code_hash = Column(String(128), nullable=True)
    password_reset_expires_at = Column(DateTime, nullable=True)
    password_reset_sent_at = Column(DateTime, nullable=True)
    password_reset_attempts = Column(
        Integer, nullable=False, server_default="0", default=0,
    )

    # ── PAD-112: the student's standing block preferences ────────────────────
    #
    # Distinct from the per-window availability blockers of PAD-28/PAD-107
    # (rows in `calendar_blocks`): a blocker says "not at THAT hour", these say
    # "not at all". The three levels are independent — `notif_block_all` is a
    # superset in EFFECT, but switching it on does not switch the other two on,
    # and switching it off does not switch them off.
    #
    # These live on `users` rather than on `players` for the same reason
    # `language` does: they are read and written through the per-user
    # `GET`/`PATCH /api/auth/me` surface, which is open to both roles. Only a
    # student has any use for them today, but nothing here is player-only.
    notif_block_auto_invitations = Column(
        Boolean, nullable=False, server_default="0", default=False,
    )
    notif_block_manual_invitations = Column(
        Boolean, nullable=False, server_default="0", default=False,
    )
    notif_block_all = Column(
        Boolean, nullable=False, server_default="0", default=False,
    )
    #: Free text written by the STUDENT and deliberately shown to their coach on
    #: the player record — the opposite privacy posture to an availability
    #: blocker's title/description, which the coach must never see (PAD-107).
    notif_block_reason = Column(Text, nullable=True)

    @property
    def notifications_blocked(self):
        """True when any of the three PAD-112 block levels is set."""
        return bool(
            self.notif_block_auto_invitations
            or self.notif_block_manual_invitations
            or self.notif_block_all
        )

    #TODO: RETHINK THIS FUNCTION
    @property
    def role(self):
        return 'coach' if self.coach else 'player' 

    @property
    def user_image_url(self):
        return self.user_image.url() if self.user_image else None

    @property
    def abbreviation_display(self):
        """
        The short badge label to render for this user (PAD-81).

        Uses the explicitly stored `abbreviation` when the coach set one, and
        otherwise falls back to the initials of the first two words of `name` —
        the behaviour that `serialize_user` hardcoded before the column existed.
        """
        stored = (self.abbreviation or "").strip()
        if stored:
            return stored
        return "".join(part[0] for part in (self.name or "").split()[:2]).upper()

    def display_all_info(self):
        searchable = {"field": "username", "label": "Username"}
        fields = [
            {"field": "name", "label": "Name"},
            {"field": "email", "label": "Email"},
            {"field": "is_admin", "label": "Admin"},
            {"field": "is_superadmin", "label": "Super Admin"},
            {"field": "generated_code", "label": "Generated Code"},
        ]
        return searchable, fields

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, type, required=False, options=None):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                label=label,
                type=type,
                options=options,
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
                get_field("phone", "Phone", "Text", required=False),
                get_field("password", "Password", "Password", required=True),
                get_field("is_admin", "Admin", "Boolean"),
                get_field("is_superadmin", "Super Admin", "Boolean"),
                get_field("generated_code", "Generated Code", "Integer"),
                get_field("status", type="Select", label="Status", options=["inactive", "active", "disabled"]),
            ],
        )
        form.add_block(info_block)

        return form
