import json
from datetime import timedelta, datetime as _datetime, date as _date, timezone

from flask import abort

from padel_app.model import NotNullableFieldError
from padel_app.models import CalendarBlock
from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.tools.calendar_tools import expand_occurrences


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clone_block(src, *, user_id, **overrides):
    """Create and persist a new CalendarBlock copying src fields, applying overrides."""
    new = CalendarBlock()
    new.user_id = user_id
    new.type = overrides.get('type', src.type)
    new.title = overrides.get('title', src.title)
    new.description = overrides.get('description', src.description)
    new.start_datetime = overrides.get('start_datetime', src.start_datetime)
    new.end_datetime = overrides.get('end_datetime', src.end_datetime)
    new.is_recurring = overrides.get('is_recurring', src.is_recurring)
    new.recurrence_rule = overrides.get('recurrence_rule', src.recurrence_rule)
    new.recurrence_end = overrides.get('recurrence_end', src.recurrence_end)
    new.create()
    return new


def _next_occurrence_after(block, after_date):
    """Return the first occurrence datetime of block on a date AFTER after_date.

    The whole of after_date is excluded (PAD-371, B-139): searching from its midnight
    found the occurrence later that same day, so deleting the first occurrence
    "advanced" the series to where it already was.
    """
    after_dt = _datetime.combine(after_date + timedelta(days=1), _datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = _datetime.combine(
        block.recurrence_end if block.recurrence_end else (after_date + timedelta(days=400)),
        _datetime.max.time(),
    ).replace(tzinfo=timezone.utc)
    occs = expand_occurrences(
        block.start_datetime, block.recurrence_rule, block.recurrence_end,
        after_dt + timedelta(seconds=1), end_dt,
    )
    return occs[0] if occs else None


def _split_block(block, occ_date):
    """
    Remove occ_date from recurring block by splitting:
      - Original series ends the day before occ_date.
      - A new copy of the series resumes from the next occurrence.
    """
    original_end = block.recurrence_end
    duration = block.end_datetime - block.start_datetime

    if occ_date <= block.start_datetime.date():
        # Deleting the very first occurrence – advance start to next
        next_occ = _next_occurrence_after(block, occ_date)
        if next_occ:
            block.start_datetime = _datetime.combine(next_occ.date(), block.start_datetime.time())
            block.end_datetime = block.start_datetime + duration
            block.save()
        else:
            block.delete()
        return

    # Where the series resumes is asked BEFORE the series is shortened (PAD-371,
    # B-139): the search is bounded by recurrence_end, so asking afterwards found
    # nothing and every occurrence after occ_date was silently dropped.
    next_occ = _next_occurrence_after(block, occ_date)

    block.recurrence_end = occ_date - timedelta(days=1)
    block.save()

    if next_occ:
        _clone_block(
            block,
            user_id=block.user_id,
            start_datetime=_datetime.combine(next_occ.date(), block.start_datetime.time()),
            end_datetime=_datetime.combine(next_occ.date(), block.start_datetime.time()) + duration,
            recurrence_end=original_end,
        )


def _build_payload(data):
    """Build a form-compatible payload dict from frontend add_event data (CREATE only:
    nothing to keep, so the legacy form's ""→NULL is right here; the EDIT path reads
    the body in present mode — `_edit_block_payload`)."""
    is_recurring = data.get("isRecurring", False)
    return {
        "type": data["type"],
        "title": data.get("title") or "",
        "description": data.get("description") or "",
        "start_datetime": f"{data['date']}T{data['startTime']}",
        "end_datetime": f"{data['date']}T{data['endTime']}",
        "is_recurring": "true" if is_recurring else "false",
        "recurrence_rule": json.dumps(data["recurrenceRule"]) if is_recurring else "",
        "recurrence_end": data.get("endDate") or "",
    }


# ---------------------------------------------------------------------------
# Admin form-based services (used by editor)
# ---------------------------------------------------------------------------

def create_calendar_block_service(data):
    block = CalendarBlock()
    form = block.get_create_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    block.update_with_dict(values)
    block.create()
    return block


def edit_calendar_block_service(block_id, data):
    block = CalendarBlock.query.get_or_404(block_id)
    form = block.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    block.update_with_dict(values)
    block.save()
    return block


def _refuse_if_live_hold(block):
    """PAD-372 (B-138), `classes.class-requests` rule 3: a `single` or `future` change to
    one occurrence of a LIVE class-request hold is refused — 409 ``HOLD_OCCURRENCE_LOCKED``.

    On accept the class is built from the REQUEST's recurrence and a proposal moves the
    SERIES (rules 4, 16); the hold blocks are never read. So such a change alters nothing
    the product honours — it only splits the hold into rows no release path can find
    (with PAD-371's split, a middle move leaves the truncated hold, a one-off AND a resumed
    series, both outliving the request under the student's name). Whole-block delete and
    retitle stay as rule 3 / rule 18 say; a retitled hold is the coach's and is not refused.
    The blueprint's error handler carries the code as ``{"error": "HOLD_OCCURRENCE_LOCKED"}``,
    the same shape the shells already branch on for ``NO_CLUB``."""
    from padel_app.models.class_request import live_hold_request_id

    if live_hold_request_id(block) is not None:
        abort(409, "HOLD_OCCURRENCE_LOCKED")


# ---------------------------------------------------------------------------
# App-facing services
# ---------------------------------------------------------------------------

def add_event_service(user_id, data):
    """Create a CalendarBlock for a user from frontend add_event data."""
    payload = {"user": user_id, **_build_payload(data)}
    block = CalendarBlock()
    form = block.get_create_form()
    fake_request = JsonRequestAdapter(payload, form)
    values = form.set_values(fake_request)
    block.update_with_dict(values)
    block.create()
    return block


#: PUT /calendar_block and PUT /availability_blockers: the body keys a client may
#: write, and nothing else (PAD-386). The owner (`user`, a nullable ManyToOne) and
#: the PAD-93 flag are not here, so they cannot be reached from a body.
_EDIT_BLOCK_KEYS = ("type", "title", "description", "date", "startTime", "endTime",
                    "isRecurring", "recurrenceRule", "endDate")


def _edit_block_payload(data, block):
    """The form payload for an EDIT, holding a key iff the body held it (PAD-386,
    B-136 step 1), and the fields a body may not leave empty.

    The old `_build_payload` invented "" for an absent title/description/endDate
    (so a coach could never clear one — the form dropped "" as "not sent") and read
    an absent `isRecurring` as False. Present mode writes what is there: "" / null
    clear a nullable column, an absent key is left alone, a Boolean is written only
    when sent. Refused, 400 naming the field, nothing written: a missing/empty
    `type`, `date`, `startTime` or `endTime` (they used to be a KeyError or a
    ValueError — a 500); a `null`/"" `endDate` while the block still recurs (D83,
    2026-09-22: a NULL end means "forever" — the way to drop it is `isRecurring:
    false`, which clears rule and end, #356's rule); a recurring block without a rule.
    """
    sent = {key: data[key] for key in _EDIT_BLOCK_KEYS if key in data}
    refused = []

    def blank(key):
        return key in sent and (sent[key] is None or not str(sent[key]).strip())

    for key in ("type", "date", "startTime", "endTime"):
        if key not in sent or blank(key):
            refused.append(key)

    recurring = sent.get("isRecurring")
    still_recurs = recurring is True or (recurring is None and bool(block.recurrence_rule))
    # One shape for rule and end (Session-B, #378): a sent-empty value is refused, and
    # an absent one is judged against the row.
    if recurring is True and (
        ("recurrenceRule" in sent and not sent["recurrenceRule"])
        or ("recurrenceRule" not in sent and not block.recurrence_rule)
    ):
        refused.append("recurrenceRule")
    if still_recurs and blank("endDate"):
        refused.append("endDate")
    if refused:
        raise NotNullableFieldError(refused)

    payload = {"type": sent["type"],
               "start_datetime": f"{sent['date']}T{sent['startTime']}",
               "end_datetime": f"{sent['date']}T{sent['endTime']}"}
    if "title" in sent:
        payload["title"] = sent["title"]
    if "description" in sent:
        payload["description"] = sent["description"]
    if recurring is not None:
        payload["is_recurring"] = bool(recurring)
    if "recurrenceRule" in sent:
        payload["recurrence_rule"] = json.dumps(sent["recurrenceRule"]) if sent["recurrenceRule"] else None
    if "endDate" in sent:
        payload["recurrence_end"] = sent["endDate"] or None
    if recurring is False:
        # PAD-377 (B-150): an explicit one-off clears rule and end, whatever else the
        # body carries for them (an old client may send neither key).
        payload["recurrence_rule"] = None
        payload["recurrence_end"] = None
    return payload


def edit_event_service(block_id, user_id, data):
    """Edit a CalendarBlock owned by user_id from frontend edit_event data.

    PAD-386 (B-136 step 1): the body is read in present mode through a whitelist —
    see `_edit_block_payload`. An absent `isRecurring` leaves flag, rule and end
    alone (PAD-377, B-150) by construction now: the key is simply not in the payload.
    """
    block = CalendarBlock.query.filter_by(id=block_id, user_id=user_id).first_or_404()
    form = block.get_create_form()
    fake_request = JsonRequestAdapter(_edit_block_payload(data, block), form, mode="present")
    values = form.set_values(fake_request)
    block.update_with_dict(values, write_none=True)
    block.save()
    return block


def reschedule_block_service(block_id, user_id, data):
    """
    Drag-and-drop reschedule.  data keys:
      occDate, newDate, newStartTime, newEndTime, scope ('single'|'future')
    """
    block = CalendarBlock.query.filter_by(id=block_id, user_id=user_id).first_or_404()

    occ_date = _date.fromisoformat(data['occDate'])
    new_start_dt = _datetime.strptime(f"{data['newDate']}T{data['newStartTime']}", "%Y-%m-%dT%H:%M")
    new_end_dt = _datetime.strptime(f"{data['newDate']}T{data['newEndTime']}", "%Y-%m-%dT%H:%M")
    scope = data.get('scope', 'single')

    if not block.is_recurring:
        # A one-off block has no occurrences to scope: this is the whole block moving,
        # which rule 18 lets a coach do to a hold as to any block (`PUT` new time).
        block.start_datetime = new_start_dt
        block.end_datetime = new_end_dt
        block.save()
        return

    _refuse_if_live_hold(block)

    if scope == 'future':
        original_end = block.recurrence_end
        if occ_date > block.start_datetime.date():
            block.recurrence_end = occ_date - timedelta(days=1)
            block.save()
            _clone_block(block, user_id=user_id,
                         start_datetime=new_start_dt, end_datetime=new_end_dt,
                         recurrence_end=original_end)
        else:
            # Moving the very first occurrence – update in place
            block.start_datetime = new_start_dt
            block.end_datetime = new_end_dt
            block.save()

    elif scope == 'single':
        # Create one-off at new time, split original to skip this occurrence
        _clone_block(block, user_id=user_id,
                     start_datetime=new_start_dt, end_datetime=new_end_dt,
                     is_recurring=False, recurrence_rule=None, recurrence_end=None)
        _split_block(block, occ_date)


def remove_block_service(block_id, user_id, occ_date_str, scope):
    """
    Scope-aware delete.
      scope='single'  – removes only this occurrence (splits recurring series)
      scope='future'  – removes this and all following occurrences
    """
    block = CalendarBlock.query.filter_by(id=block_id, user_id=user_id).first_or_404()

    if not block.is_recurring or not occ_date_str:
        # The WHOLE block: rule 3 lets the coach delete a hold outright (it does not
        # decide the request; the request re-places nothing and closes on its own terms).
        block.delete()
        return

    _refuse_if_live_hold(block)
    occ_date = _date.fromisoformat(occ_date_str)

    if scope == 'future':
        if occ_date <= block.start_datetime.date():
            block.delete()
        else:
            block.recurrence_end = occ_date - timedelta(days=1)
            block.save()

    elif scope == 'single':
        _split_block(block, occ_date)
