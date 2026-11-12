"""
Message text: the template renderer and the formatters every coach→student message uses.

Moved out of ``notification_service`` (PAD-914) so they outlive the old invitation engine: the
placeholders (notifications.message-templates), the class-when suffixes and the locale helpers are
shared by reminders, invitations, join requests, class requests and enrolment notices alike.
"""

from __future__ import annotations

import re
from datetime import timedelta

from padel_app.models import LessonInstance
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


# The connectors an empty placeholder takes with it (notifications.message-templates
# rules 7 and 14): the genitives for every placeholder, and for ``{court}`` the
# locative prepositions too ("às 19:00 no {court}" -> "às 19:00").
_EMPTY_PLACEHOLDER_CONNECTORS = ("de", "da", "do", "of")
_EMPTY_COURT_CONNECTORS = _EMPTY_PLACEHOLDER_CONNECTORS + ("em", "no", "na", "in", "on", "at")


_LEADING_PUNCTUATION = re.compile(r"^[,.;:!?\-–—\s]+")


_SIDE_PHRASES = {
    "en": {"left": " (left side)", "right": " (right side)"},
    "pt": {"left": " (lado esquerdo)", "right": " (lado direito)"},
}


def _side_phrase(side: str | None, locale: str | None) -> str:
    """PAD-446 (message-templates rule 16): the spot's side for `{side}` — only for a left/right
    spot, in the coach's locale; a `both` or unknown side says nothing."""
    return _SIDE_PHRASES.get("en" if locale == "en" else "pt", {}).get(side or "", "")


def _format_template(template: str, **variables) -> str:
    # The coach may open a template on punctuation ("- Lembrete: …"); only a
    # leading run the substitution *exposed* is stripped below (B's #455 review).
    opens_on_punctuation = bool(_LEADING_PUNCTUATION.match(template.strip()))
    for key, val in variables.items():
        val = str(val)
        if val == "":
            # PAD-346 (notifications.message-templates rule 7, B-098): an empty
            # phrase disappears whole. Every pt default puts {level} after the
            # genitive "de", so an empty string alone left "aula de esta
            # quarta-feira"; the connector goes with the placeholder.
            connectors = _EMPTY_COURT_CONNECTORS if key == "court" else _EMPTY_PLACEHOLDER_CONNECTORS
            template = re.sub(
                r"\b(?:" + "|".join(connectors) + r")\s+\{" + re.escape(key) + r"\}",
                "{" + key + "}",
                template,
                flags=re.IGNORECASE,
            )
        template = template.replace("{" + key + "}", val)
    # PAD-446 (message-templates rule 16): `{side}` is filled only for a waiting-list invitation; anywhere else (or a
    # caller that did not pass it) it renders as nothing, never as a raw token.
    template = template.replace("{side}", "")
    # The new engine's placeholders (message-templates N2): `{sideName}` (side_moved) and `{count}`
    # (coach_no_candidate) are stripped the same way anywhere they are not filled.
    template = template.replace("{sideName}", "").replace("{count}", "")
    # The new engine's placeholders (message-templates N2): `{sideName}` (side_moved) and `{count}`
    # (coach_no_candidate) are stripped the same way anywhere they are not filled.
    template = template.replace("{sideName}", "").replace("{count}", "")
    # PAD-430 (rule 14): "aula ({court})" for a class with no court leaves "()" or "[]".
    template = re.sub(r"\(\s*\)|\[\s*\]", "", template)
    # An empty placeholder (e.g. a level-less class -> empty {level}) can leave a
    # double space or a space before punctuation; collapse those so the rendered
    # message stays grammatical.
    template = re.sub(r"\s{2,}", " ", template)
    template = re.sub(r"\s+([,.!?;:])", r"\1", template)
    template = template.strip()
    # A message that opened with the empty phrase ("No {court}, às …") is left
    # starting on punctuation: drop it and capitalise what now leads.
    trimmed = _LEADING_PUNCTUATION.sub("", template)
    if trimmed != template and not opens_on_punctuation:
        template = trimmed[:1].upper() + trimmed[1:]
    return template


# Portuguese weekday names, indexed by ``datetime.weekday()`` (Monday == 0).
# Tactical localization only — full locale-driven i18n is tracked in PAD-39.
_PT_WEEKDAYS = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)


def _weekday_pt(start_datetime) -> str:
    """Portuguese weekday name for a datetime, or "" when missing.

    Avoids ``strftime("%A")`` which returns the English weekday under the
    server's default (en) locale — the source of the "esta Wednesday" leak.
    """
    if not start_datetime:
        return ""
    return _PT_WEEKDAYS[start_datetime.weekday()]



def _resolve_locale(coach):
    """Resolve the coach's preferred locale, falling back to Portuguese."""
    try:
        lang = getattr(coach.user, "language", None) if coach and coach.user else None
    except Exception:
        lang = None
    return "pt" if not lang else ("pt" if lang.startswith("pt") else "en")


def _format_weekday(dt, locale):
    """Locale-aware full weekday name via Babel (e.g. pt -> 'quarta-feira')."""
    if not dt:
        return ""
    try:
        from babel.dates import format_date
        return format_date(dt, format="EEEE", locale=locale)
    except Exception:
        return dt.strftime("%A")


_CLASS_TYPE_WORDS = {
    "pt": {"academy": "academia", "private": "privada"},
    "en": {"academy": "academy", "private": "private"},
}


def _format_day_month(dt) -> str:
    """The ``dd/mm`` day of a class start (notifications.message-templates rule 13), shared by the
    ``{date}`` placeholder and the dated class-when suffix (rule 17) so the two never drift."""
    return dt.strftime("%d/%m") if dt else ""


def format_relative_day(start, locale, now=None) -> str:
    """PAD-549 (notifications.message-templates rule 18; numbering unconfirmed): the ``{day}``
    placeholder — the class's day said the way a person would, relative to when the message is
    rendered, which in the engine is the moment it is sent (so a message held by quiet hours past
    midnight still says "hoje" correctly). Both ``start`` and ``now`` are club wall-clock times.

    Only the next-week form carries a preposition in Portuguese (PAD-561, B-463: the owner
    reversed PAD-549's "no preposition inside"), so the field fits "A aula é {day} às {time}":
        same day → "hoje" / "today"; next day → "amanhã" / "tomorrow";
        two days → "depois de amanhã" / "the day after tomorrow";
        later this week (Monday–Sunday) → "esta sexta-feira" / "this Friday";
        any day of next week → "na próxima segunda-feira" / "next Monday";
        anything else, past included → "dia 23/02" / "23/02".
    Saturday and Sunday are masculine in Portuguese: "este sábado", "no próximo domingo".
    """
    if start is None:
        return ""
    if now is None:
        now = utc_to_wall_naive(utcnow_naive())
    is_pt = (locale or "").startswith("pt")
    days = (start.date() - now.date()).days
    if days == 0:
        return "hoje" if is_pt else "today"
    if days == 1:
        return "amanhã" if is_pt else "tomorrow"
    if days == 2:
        return "depois de amanhã" if is_pt else "the day after tomorrow"
    week_start = now.date() - timedelta(days=now.weekday())
    weeks_ahead = (start.date() - week_start).days // 7
    weekday = _format_weekday(start, locale)
    masculine = start.weekday() >= 5
    if days > 2 and weeks_ahead == 0:
        if is_pt:
            return f"{'este' if masculine else 'esta'} {weekday}"
        return f"this {weekday}"
    if days > 0 and weeks_ahead == 1:
        if is_pt:
            return f"{'no próximo' if masculine else 'na próxima'} {weekday}"
        return f"next {weekday}"
    date = _format_day_month(start)
    return f"dia {date}" if is_pt else date


def template_preview_examples(locale, now=None) -> dict:
    """PAD-549 (message-templates rule 19; numbering unconfirmed): one example value per
    placeholder, for the settings help and live preview — a sample class tomorrow at 18:00 at
    level "Intermédio" on court "Campo 2", built from the same formatters a real message uses,
    so the example cannot drift from what is sent. Coach's locale, like every placeholder."""
    if now is None:
        now = utc_to_wall_naive(utcnow_naive())
    start = (now + timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
    is_pt = (locale or "").startswith("pt")
    return {
        "name": "Ana",
        "level": "Intermédio" if is_pt else "Intermediate",
        "weekday": _format_weekday(start, locale),
        "time": start.strftime("%H:%M"),
        "type": _CLASS_TYPE_WORDS.get("pt" if is_pt else "en", {}).get("academy", ""),
        "date": _format_day_month(start),
        "court": "Campo 2" if is_pt else "Court 2",
        "day": format_relative_day(start, locale, now=now),
        "class": "Treino de grupo" if is_pt else "Group training",
        "when": _format_when(start, locale, dated=True).strip(),
        "side": _side_phrase("left", locale),
    }


def render_template_preview(template, locale, now=None) -> str:
    """PAD-549: the coach's template rendered through ``_format_template`` with the examples."""
    return _format_template(template or "", **template_preview_examples(locale, now=now))


def class_placeholders(source, locale) -> dict:
    """PAD-430: the ``{type}``, ``{date}`` and ``{court}`` template placeholders; PAD-549 adds ``{day}``.

    ``source`` is a LessonInstance or a Lesson. The type word follows the coach's
    locale like every other placeholder (notifications.message-templates rule 12);
    the date is ``dd/mm`` of the wall-clock start (rule 13); the court is the
    class's court name — an occurrence's own court first (clubs.courts rule 9,
    PAD-513) — empty when it has none (rule 14).
    """
    is_instance = isinstance(source, LessonInstance)
    lesson = source.lesson if is_instance else source
    start = getattr(source, "start_datetime", None)
    if is_instance:
        court = source.effective_court
    else:
        court = getattr(lesson, "court", None) if lesson is not None else None
    lesson_type = getattr(lesson, "type", None) if lesson is not None else None
    return {
        "type": _CLASS_TYPE_WORDS.get(locale, _CLASS_TYPE_WORDS["pt"]).get(lesson_type, ""),
        "date": _format_day_month(start),
        "court": (getattr(court, "name", None) or "") if court is not None else "",
        # PAD-549: computed now, i.e. when the message is rendered and sent.
        "day": format_relative_day(start, locale),
    }


def template_variables(player, source, locale, *, side: str = "") -> dict:
    """PAD-670 (notifications.message-templates rule 3a): the ONE set of values every template
    is rendered with, for one student and one class — ``{name}``, ``{level}``, ``{weekday}``,
    ``{time}``, ``{day}``, ``{type}``, ``{date}``, ``{court}``, ``{class}`` and ``{when}`` — so a
    placeholder typed into any field is replaced when the message is sent.

    ``source`` is a LessonInstance (``{when}`` dated, rule 17) or a Lesson (weekday-only). The name
    is the student's real first name, never a nickname (players.nickname rule 4). ``side`` fills
    ``{side}`` and is passed only by the round-0 waiting-list invitation (rule 16).
    """
    from padel_app.services.notification_service import effective_level_code

    user = getattr(player, "user", None) if player is not None else None
    full_name = (getattr(user, "name", None) or "").strip()
    first_name = full_name.split()[0] if full_name else "there"
    is_instance = isinstance(source, LessonInstance)
    start = getattr(source, "start_datetime", None)
    return {
        "name": first_name,
        "level": effective_level_code(source),
        "weekday": _format_weekday(start, locale) if start else "",
        "time": start.strftime("%H:%M") if start else "",
        "class": getattr(source, "title", None) or "",
        "when": _format_when(start, locale, dated=is_instance),
        **class_placeholders(source, locale),
        **({"side": side} if side else {}),
    }


def _format_when(dt, locale: str = "en", *, dated: bool = False, weekday_first: bool = False) -> str:
    """The ' on <weekday> at <time>' suffix for a datetime — weekday-only by default,
    ' on <dd/mm> (<weekday>) at <time>' with ``dated=True``, and ' on <weekday>, <dd/mm>, at <time>'
    with ``dated=True, weekday_first=True`` (``weekday_first`` alone changes nothing).

    PAD-519 (notifications.message-templates rule 17): ``dated=True`` names the day of the
    month as well — ' no dia 10/04 (sábado) às 18:00' / ' on 10/04 (Saturday) at 18:00'. A
    weekday alone told a coach with a weekly class nothing about which week was meant. The
    default stays weekday-only for a series (a Lesson, whose start is only its first
    occurrence): a recurring enrolment must not be dated.

    PAD-100: fully localized. For Portuguese coaches this renders
    ' na <weekday> às <time>' (or ' no <weekday> …' for sábado/domingo, which
    are masculine), so the suffix no longer leaks English prepositions into an
    otherwise-Portuguese notification.

    Takes the datetime rather than the class so a Lesson (the series, whose
    ``start_datetime`` is its first occurrence) and a LessonInstance share one
    localisation — PAD-100 fixed this wording once and it should not be
    duplicated to gain a second caller (PAD-330).

    PAD-678 (rule 17's weekday-first form): the student's "Está marcado!" on an accepted join
    request reads ' na sexta-feira, 16/10, às 09:00' / ' on Friday, 16/10, at 09:00'.
    """
    if dt is None:
        return ""
    weekday = _format_weekday(dt, locale)
    time_str = dt.strftime("%H:%M")
    is_pt = (locale or "").startswith("pt")
    # Weekdays segunda–sexta are feminine ("na"); sábado/domingo (5, 6) are masculine ("no").
    prep = "no" if dt.weekday() >= 5 else "na"
    if dated and weekday_first and weekday:
        day_month = _format_day_month(dt)
        if is_pt:
            return f" {prep} {weekday}, {day_month}, às {time_str}"
        return f" on {weekday}, {day_month}, at {time_str}"
    if dated:
        # "dia" is masculine, so the day form needs no na/no switch on the weekday.
        day = _format_day_month(dt) + (f" ({weekday})" if weekday else "")
        return f" no dia {day} às {time_str}" if is_pt else f" on {day} at {time_str}"
    if is_pt:
        if weekday:
            return f" {prep} {weekday} às {time_str}"
        return f" às {time_str}"
    if weekday:
        return f" on {weekday} at {time_str}"
    return f" at {time_str}"


def _format_class_when(instance: LessonInstance, locale: str = "en") -> str:
    """The ' on <day> (<weekday>) at <time>' suffix for a class instance — one occurrence, so
    always dated (rule 17)."""
    return _format_when(getattr(instance, "start_datetime", None), locale, dated=True)
