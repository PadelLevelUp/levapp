from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, JSON, String, text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model


DEFAULT_PRIORITY_CRITERIA = [
    {"id": "level", "label": "Level", "enabled": True},
    {"id": "justified_misses", "label": "Justified Misses", "enabled": True},
    {"id": "attendance", "label": "Attendance", "enabled": True},
    {"id": "playing_side", "label": "Playing Side", "enabled": False},
    # PAD-132: reads users.status (account activation) — the id is a stored
    # wire identifier and stays; the label says what it checks.
    {"id": "subscription_status", "label": "Account status", "enabled": False},
]

DEFAULT_RESTRICTIONS = {
    "maxSimultaneous": {"enabled": True, "value": 3},
    "maxTotal": {"enabled": True, "value": 10},
    "minTimeBeforeClass": {"enabled": False, "value": 30},
    "maxInvitesPerStudentPerDay": {"enabled": False, "value": 3},
    "quietHours": {"enabled": False},
    "maxInactiveTime": {"enabled": True, "value": 120},
    "excludedPlayers": {"enabled": False, "playerIds": []},
    # PAD-132: "exclude inactive accounts" — reads users.status, never payment.
    "excludeUnpaidSubscription": {"enabled": False},
    # Hours before class start after which a student cancellation is flagged
    # as a late cancellation (spot is still freed). Plain scalar (hours).
    "cancellationDeadlineHours": 24,
}

DEFAULT_NOTIFICATION_GROUPS = [
    {"id": "same_level", "label": "Same level", "enabled": True},
    {"id": "recent_absences", "label": "Recent absences", "enabled": True},
    {"id": "justified_absences", "label": "Justified absences", "enabled": True},
    {"id": "all_students", "label": "All students", "enabled": True},
]

DEFAULT_MESSAGE_TEMPLATES = {
    "invite": "Hey {name}, we have an opening in the {level} class next {weekday} at {time}. Do you want to come?",
    "confirm": "Great! I'm counting on you! See you there 🎾",
    "decline": "No problem, see you next time!",
    "spot_filled": "Sorry, this place was filled already! I'll get back to you if something else opens up.",
    "reminder": "Hey {name}, just a reminder that you have the {level} class this {weekday} at {time}. Are you coming?",
    "reminder_followup": "Hey {name}, still haven't heard back — do you have a spot for the {level} class this {weekday} at {time}?",
    "reminder_confirmed": "Great, see you then! 🎾",
    "reminder_declined": "Got it, thanks for letting us know!",
    "waiting_list_offer": "This spot was just taken, but we can put you on the waiting list and notify you if another opens up. Interested?",
    "waiting_list_confirm": "You're on the waiting list! We'll let you know if a spot opens.",
    "waiting_list_placed": "Good news {name}! A spot opened up in the {level} class on {weekday} at {time} and you've been added. See you there! 🎾",
    "class_cancelled": "Hi {name}, your {level} class on {weekday} at {time} has been cancelled. Sorry for the inconvenience!",
}

DEFAULT_MESSAGE_TEMPLATES_PT = {
    "invite": "Olá {name}, abriu uma vaga na aula de {level} na próxima {weekday} às {time}. Queres vir?",
    "confirm": "Boa! Conto contigo! Até já 🎾",
    "decline": "Sem problema, para a próxima!",
    "spot_filled": "Desculpa, esta vaga já foi preenchida! Aviso-te se abrir outra.",
    "reminder": "Olá {name}, lembrete: tens a aula de {level} esta {weekday} às {time}. Vens?",
    "reminder_followup": "Olá {name}, ainda não tive resposta — tens vaga para a aula de {level} esta {weekday} às {time}?",
    "reminder_confirmed": "Boa, até já! 🎾",
    "reminder_declined": "Entendido, obrigado por avisares!",
    "waiting_list_offer": "Esta vaga acabou de ser ocupada, mas podemos pôr-te na lista de espera e avisar-te se abrir outra. Interessa?",
    "waiting_list_confirm": "Estás na lista de espera! Avisamos-te se abrir uma vaga.",
    "waiting_list_placed": "Boas notícias {name}! Abriu uma vaga na aula de {level} na {weekday} às {time} e foste adicionado. Até já! 🎾",
    "class_cancelled": "Olá {name}, a tua aula de {level} de {weekday} às {time} foi cancelada. Pedimos desculpa pelo incómodo!",
}


def default_templates_for_locale(locale):
    return DEFAULT_MESSAGE_TEMPLATES_PT if (locale or "pt").startswith("pt") else DEFAULT_MESSAGE_TEMPLATES


def _is_blank_template(value) -> bool:
    """True when a stored template can't produce a message body.

    Covers the three ways a template ends up unusable: the key was never saved
    (``None``), the coach cleared the textarea (``""`` / whitespace only), or the
    JSON holds a non-string (legacy data, bad payload).
    """
    return not isinstance(value, str) or not value.strip()


def resolve_message_template(templates, key, locale=None) -> str:
    """Resolve one template key to non-empty text (PAD-67).

    ``templates`` is whatever the caller has on hand — normally the dict from
    :meth:`NotificationConfig.get_message_templates`, but call sites also pass a
    raw defaults dict. Whenever the stored value is missing or blank/whitespace-
    only, fall back to the built-in default for ``locale`` so an automatic
    message is never delivered empty.
    """
    value = (templates or {}).get(key)
    if not _is_blank_template(value):
        return value
    fallback = default_templates_for_locale(locale).get(key)
    if not _is_blank_template(fallback):
        return fallback
    # Unknown key with no built-in default — the caller must not send anything.
    return ""


DEFAULT_INVITATION_GROUPS = [
    {
        "id": "1",
        "rules": [
            {"attribute": "level", "operation": "same_as_vacancy"},
            {"attribute": "side", "operation": "same_as_vacancy"},
        ],
    },
    {
        "id": "2",
        "rules": [{"attribute": "level", "operation": "same_as_vacancy"}],
    },
    {"id": "3", "rules": []},
]

DEFAULT_TIEBREAKERS = [
    {"id": "unjustified_absences", "label": "Fewest unjustified absences", "enabled": True},
    {"id": "justified_absences", "label": "Most justified absences", "enabled": True},
    {"id": "attendance_rate", "label": "Highest attendance rate", "enabled": True},
    {"id": "playing_side_match", "label": "Matching playing side", "enabled": False},
    {"id": "subscription_status", "label": "Active account", "enabled": False},
]

# Hours before a class start after which a student cancellation is flagged as a
# late cancellation. Students may still cancel (and the spot is still freed), but
# the resulting Presence is marked late_cancellation=True. Stored in the
# ``restrictions`` JSON under ``cancellationDeadlineHours``. Default 24h.
DEFAULT_CANCELLATION_DEADLINE_HOURS = 24

DEFAULT_REMINDER_TIMING = {"type": "hours_before", "value": 48}
DEFAULT_INVITATION_START_TIMING = {"type": "hours_before", "value": 24}
# How many reminders to send each student, and how far apart, when they
# don't respond. Stored alongside ``firstReminder`` in the reminder_timing JSON.
DEFAULT_REMINDER_COUNT = 1
DEFAULT_HOURS_BETWEEN_REMINDERS = 24


def _int_or(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _bool_or(value, default):
    """Booleans the way the old restrictions blob was read (by truthiness), but
    with the string spellings an older client may send handled explicitly."""
    if isinstance(value, bool):
        return value
    if value is None:
        return bool(default)
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "on")
    return bool(value)


def _hours_or(value, default, *, minimum):
    try:
        hours = float(value)
    except (TypeError, ValueError):
        return default
    return default if hours < minimum else hours


def _compose_timing(t, value, time_str):
    if t == "hours_before":
        return {"type": t, "value": value}
    if t == "none":
        # PAD-279 backfill of a timing the scheduler could never fire: still
        # fires nothing (`scheduler._fire_time_utc` schedules no job for it).
        return {"type": "none"}
    return {"type": t, "days": value, "time": time_str or "09:00"}


def _decompose_timing(data, default):
    """``(type, value, time)`` for the columns from a wire timing object; a
    shape the scheduler cannot fire (``scheduler._fire_time_utc``) becomes the
    default instead of a column that fires nothing."""
    if not isinstance(data, dict):
        data = default
    t = data.get("type")
    if t == "none":
        return "none", default.get("value", 24), None
    if t == "hours_before":
        return t, _int_or(data.get("value"), default.get("value", 24)), None
    if t in ("days_before", "days_before_at_time"):
        time_str = data.get("time")
        return t, _int_or(data.get("days"), 1), time_str if isinstance(time_str, str) else "09:00"
    return default["type"], default.get("value", 24), None


class NotificationConfig(db.Model, model.Model):
    __tablename__ = "notification_configs"
    __table_args__ = {"extend_existing": True}

    page_title = "Notification Config"
    model_name = "NotificationConfig"

    id = Column(Integer, primary_key=True)
    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    auto_notify_enabled = Column(Boolean, default=False, nullable=False)
    # "automatic" (default) or "semi_automatic" — only relevant when
    # auto_notify_enabled is true. In semi_automatic mode vacancies require
    # coach approval before invitations are sent.
    invitation_mode = Column(
        String(20), default="automatic", server_default="automatic", nullable=False
    )
    # PAD-279 (audit M21): every scalar setting is a typed column with a
    # database default — the value the old JSON getter returned for a missing
    # key — so nothing scalar is ever "defaulted" out of a NULL blob again
    # (the idiom behind PAD-122). The wire shape of GET|POST /notify/config is
    # unchanged: the ``restrictions`` / ``reminder_timing`` /
    # ``invitation_start_timing`` properties below compose the old dicts from
    # these columns and decompose them on write (notifications.config rule 12).

    # First reminder: {type: hours_before, value} or {type: days_before[_at_time], days, time}.
    reminder_type = Column(String(32), nullable=False, default="hours_before", server_default="hours_before")
    reminder_value = Column(Integer, nullable=False, default=48, server_default="48")
    reminder_time = Column(String(5), nullable=True)
    # Invitation window, same shape (notifications.invitations rule 11).
    invitation_start_type = Column(String(32), nullable=False, default="hours_before", server_default="hours_before")
    invitation_start_value = Column(Integer, nullable=False, default=24, server_default="24")
    invitation_start_time = Column(String(5), nullable=True)
    reminder_count = Column(Integer, nullable=False, default=1, server_default="1")
    hours_between_reminders = Column(Float, nullable=False, default=24.0, server_default="24")
    # attendance.confirm: hours before class after which a cancellation is "late".
    cancellation_deadline_hours = Column(Float, nullable=False, default=24.0, server_default="24")
    # Restrictions (rule 6); the wire keys are unchanged, including
    # excludeUnpaidSubscription -> exclude_inactive_accounts (rule 7c, PAD-132).
    max_simultaneous_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    max_simultaneous_value = Column(Integer, nullable=False, default=3, server_default="3")
    max_total_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    max_total_value = Column(Integer, nullable=False, default=10, server_default="10")
    min_time_before_class_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    min_time_before_class_value = Column(Integer, nullable=False, default=30, server_default="30")
    max_invites_per_student_per_day_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    max_invites_per_student_per_day_value = Column(Integer, nullable=False, default=3, server_default="3")
    quiet_hours_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    max_inactive_time_enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    max_inactive_time_value = Column(Integer, nullable=False, default=120, server_default="120")
    exclude_inactive_accounts = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    excluded_players_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))

    # List-shaped settings stay JSON, stamped by schema_version (1 today).
    schema_version = Column(Integer, nullable=False, default=1, server_default="1")
    priority_criteria = Column(JSON, nullable=True)
    notification_groups = Column(JSON, nullable=True)
    message_templates = Column(JSON, nullable=True)
    invitation_groups = Column(JSON, nullable=True)
    tiebreakers = Column(JSON, nullable=True)
    excluded_player_ids = Column(JSON, nullable=False, default=list, server_default="[]")
    # PAD-128 — the coach's standard eligibility bar (eligibility.rules).
    #
    # DELIBERATELY has no DEFAULT_* constant and no defaulting getter. Every
    # other JSON column here follows `return self.X if self.X is not None else
    # DEFAULT_X`, and for this column that idiom IS the bug: NULL means "no bar
    # defined, everyone is eligible", and substituting a non-empty default
    # would turn an unset bar into a real filter. That is exactly how
    # `get_invitation_groups()` falling back to a non-empty
    # DEFAULT_INVITATION_GROUPS produced PAD-122 one layer down.
    #
    # NULL and [] both mean "no bar". They are stored distinctly only because
    # eligibility.cascade (PAD-129) needs [] to be a deliberate override at the
    # lesson/instance tiers; at the coach tier they are equivalent.
    eligibility_rules = Column(JSON, nullable=True)
    # PAD-130: the coach's standard "make empty spots for future classes visible
    # to eligible students" toggle. NULL/False = off (today's behaviour).
    open_spots_visible = Column(Boolean, nullable=True)

    coach = relationship("Coach")

    @property
    def name(self):
        return f"NotificationConfig for coach {self.coach_id}"

    def get_invitation_mode(self):
        return self.invitation_mode or "automatic"

    def get_priority_criteria(self):
        return self.priority_criteria if self.priority_criteria is not None else DEFAULT_PRIORITY_CRITERIA

    # -- restrictions -------------------------------------------------------

    _RESTRICTION_PAIRS = (
        ("maxSimultaneous", "max_simultaneous_enabled", "max_simultaneous_value"),
        ("maxTotal", "max_total_enabled", "max_total_value"),
        ("minTimeBeforeClass", "min_time_before_class_enabled", "min_time_before_class_value"),
        ("maxInvitesPerStudentPerDay", "max_invites_per_student_per_day_enabled",
         "max_invites_per_student_per_day_value"),
        ("maxInactiveTime", "max_inactive_time_enabled", "max_inactive_time_value"),
    )

    @staticmethod
    def _col(value, default):
        """A column read on an unsaved instance is None until flush; read the
        Python default so a fresh ``NotificationConfig()`` answers like a saved one."""
        return default if value is None else value

    def get_restrictions(self):
        """The ``restrictions`` object exactly as the JSON blob used to read after
        its merge over the defaults, composed from the typed columns."""
        out = {}
        for key, enabled_col, value_col in self._RESTRICTION_PAIRS:
            out[key] = {
                "enabled": bool(self._col(getattr(self, enabled_col),
                                          DEFAULT_RESTRICTIONS[key]["enabled"])),
                "value": self._col(getattr(self, value_col), DEFAULT_RESTRICTIONS[key]["value"]),
            }
        out["quietHours"] = {"enabled": bool(self._col(self.quiet_hours_enabled, False))}
        out["excludedPlayers"] = {
            "enabled": bool(self._col(self.excluded_players_enabled, False)),
            "playerIds": list(self.excluded_player_ids or []),
        }
        out["excludeUnpaidSubscription"] = {
            "enabled": bool(self._col(self.exclude_inactive_accounts, False))
        }
        out["cancellationDeadlineHours"] = self.get_cancellation_deadline_hours()
        return out

    @property
    def restrictions(self):
        return self.get_restrictions()

    @restrictions.setter
    def restrictions(self, data):
        """Decompose a (possibly partial) ``restrictions`` dict into the columns.
        A key that is absent reads as its default, as the old merge did; ``None``
        resets everything."""
        data = data if isinstance(data, dict) else {}
        for key, enabled_col, value_col in self._RESTRICTION_PAIRS:
            sub = data.get(key)
            sub = sub if isinstance(sub, dict) else {}
            setattr(self, enabled_col, _bool_or(sub.get("enabled"), DEFAULT_RESTRICTIONS[key]["enabled"]))
            setattr(self, value_col, _int_or(sub.get("value"), DEFAULT_RESTRICTIONS[key]["value"]))
        quiet = data.get("quietHours")
        self.quiet_hours_enabled = _bool_or(quiet.get("enabled"), False) if isinstance(quiet, dict) else False
        excl = data.get("excludeUnpaidSubscription")
        self.exclude_inactive_accounts = _bool_or(excl.get("enabled"), False) if isinstance(excl, dict) else False
        players = data.get("excludedPlayers")
        players = players if isinstance(players, dict) else {}
        self.excluded_players_enabled = _bool_or(players.get("enabled"), False)
        ids = players.get("playerIds")
        self.excluded_player_ids = [str(i) for i in ids if i is not None] if isinstance(ids, list) else []
        self.cancellation_deadline_hours = _hours_or(
            data.get("cancellationDeadlineHours"), DEFAULT_CANCELLATION_DEADLINE_HOURS, minimum=0
        )
    def get_cancellation_deadline_hours(self):
        """Hours before class start after which a cancellation is flagged late
        (default 24). On the wire: ``restrictions.cancellationDeadlineHours``."""
        return _hours_or(self.cancellation_deadline_hours, DEFAULT_CANCELLATION_DEADLINE_HOURS, minimum=0)
    def get_notification_groups(self):
        return self.notification_groups if self.notification_groups is not None else DEFAULT_NOTIFICATION_GROUPS

    def get_message_templates(self, locale=None):
        """Coach templates merged over the locale defaults, never blank (PAD-67).

        A stored key that is missing, ``null``, non-string or blank/whitespace-
        only does NOT override the default — otherwise the engine would render
        and deliver an empty message body. Customisations that carry actual text
        always win, and unknown extra keys are preserved as-is.
        """
        defaults = default_templates_for_locale(locale)
        stored = self.message_templates
        if not isinstance(stored, dict):
            return dict(defaults)
        merged = {**defaults, **stored}
        for key, default_text in defaults.items():
            if _is_blank_template(merged.get(key)):
                merged[key] = default_text
        return merged

    # -- timings --------------------------------------------------------------

    def get_reminder_timing(self):
        """The first reminder as ``{type, value}`` / ``{type, days, time}``."""
        return _compose_timing(
            self._col(self.reminder_type, "hours_before"),
            self._col(self.reminder_value, DEFAULT_REMINDER_TIMING["value"]),
            self.reminder_time,
        )
    def get_reminder_count(self):
        """Number of reminders to send each student (floor 1)."""
        return max(1, _int_or(self.reminder_count, DEFAULT_REMINDER_COUNT))
    def get_hours_between_reminders(self):
        """Hours to wait between consecutive reminders (must be > 0)."""
        hours = _hours_or(self.hours_between_reminders, DEFAULT_HOURS_BETWEEN_REMINDERS, minimum=0)
        return hours if hours > 0 else DEFAULT_HOURS_BETWEEN_REMINDERS
    def get_invitation_start_timing(self):
        """When invitations start, same shape as the reminder timing. One home
        only — the duplicate column and its precedence are gone (PAD-279)."""
        return _compose_timing(
            self._col(self.invitation_start_type, "hours_before"),
            self._col(self.invitation_start_value, DEFAULT_INVITATION_START_TIMING["value"]),
            self.invitation_start_time,
        )

    @property
    def reminder_timing(self):
        """The nested wire object the reminders form reads and writes."""
        return {
            "firstReminder": self.get_reminder_timing(),
            "reminderCount": self.get_reminder_count(),
            "hoursBetweenReminders": self.get_hours_between_reminders(),
            "invitationStart": self.get_invitation_start_timing(),
        }

    @reminder_timing.setter
    def reminder_timing(self, data):
        """Nested ``{firstReminder, reminderCount, hoursBetweenReminders,
        invitationStart}`` sets whatever keys it carries; a flat ``{type, …}``
        sets the first reminder only; ``None`` resets all four."""
        if data is None:
            self._set_timing("reminder", DEFAULT_REMINDER_TIMING)
            self.reminder_count = DEFAULT_REMINDER_COUNT
            self.hours_between_reminders = float(DEFAULT_HOURS_BETWEEN_REMINDERS)
            self._set_timing("invitation_start", DEFAULT_INVITATION_START_TIMING)
            return
        if not isinstance(data, dict):
            return
        if "firstReminder" in data:
            self._set_timing("reminder", data.get("firstReminder"))
            if "reminderCount" in data:
                self.reminder_count = max(1, _int_or(data.get("reminderCount"), DEFAULT_REMINDER_COUNT))
            if "hoursBetweenReminders" in data:
                hours = _hours_or(data.get("hoursBetweenReminders"), DEFAULT_HOURS_BETWEEN_REMINDERS, minimum=0)
                self.hours_between_reminders = hours if hours > 0 else float(DEFAULT_HOURS_BETWEEN_REMINDERS)
            if "invitationStart" in data:
                self._set_timing("invitation_start", data.get("invitationStart"))
        elif "type" in data:
            self._set_timing("reminder", data)

    @property
    def invitation_start_timing(self):
        return self.get_invitation_start_timing()

    @invitation_start_timing.setter
    def invitation_start_timing(self, data):
        self._set_timing("invitation_start", data if data is not None else DEFAULT_INVITATION_START_TIMING)

    def _set_timing(self, prefix, data):
        default = DEFAULT_REMINDER_TIMING if prefix == "reminder" else DEFAULT_INVITATION_START_TIMING
        t, value, time_str = _decompose_timing(data, default)
        setattr(self, f"{prefix}_type", t)
        setattr(self, f"{prefix}_value", value)
        setattr(self, f"{prefix}_time", time_str)
    def get_invitation_groups(self):
        """The coach's ordered invitation groups. ``None`` (never configured)
        AND ``[]`` both mean the built-in three: before PAD-279 an empty list
        fell through to the legacy ``rounds``, whose defaults were these same
        three waves, so this keeps every coach's invitations as they were
        (notifications.config rule 12). The web client also initialises the
        defaults when the engine is switched on with no groups."""
        groups = self.invitation_groups
        if not isinstance(groups, list) or not groups:
            return DEFAULT_INVITATION_GROUPS
        return groups
    def get_tiebreakers(self):
        return self.tiebreakers if self.tiebreakers is not None else DEFAULT_TIEBREAKERS

    def get_eligibility_rules(self):
        """The coach's standard eligibility bar, or ``None`` when unset (PAD-128).

        Returns the stored value verbatim — there is **no** default to fall back
        to. ``None`` (never configured) and ``[]`` (explicitly cleared) are both
        "no bar", and callers must read either as "everyone is eligible" rather
        than as a filter that excludes everybody.

        Anything that is not a list is treated as unset: a malformed column
        must not be able to lock a coach's whole roster out of their classes.
        """
        rules = self.eligibility_rules
        if not isinstance(rules, list):
            return None
        return rules

    @classmethod
    def get_create_form(cls):
        from padel_app.tools.input_tools import Block, Field, Form
        form = Form()
        form.add_block(Block("info_block", fields=[
            Field(instance_id=cls.id, model=cls.model_name, name="coach", label="Coach", type="ManyToOne", related_model="Coach"),
        ]))
        return form
