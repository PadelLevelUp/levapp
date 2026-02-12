from datetime import datetime, timedelta
import json

from padel_app.models import (
    Lesson,
    Association_CoachLesson,
    Association_PlayerLesson,
    LessonInstance,
    Association_PlayerLessonInstance, 
    Association_CoachLessonInstance,
    Presence
)

from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.tools.calendar_tools import build_datetime, _format_time, _format_date


def update_recurrence_weekday(
    lesson,
    old_date,
    new_date,
):
    if not lesson.recurrence_rule:
        return

    rule = json.loads(lesson.recurrence_rule)
    days = set(rule.get("daysOfWeek", []))

    old_wd = old_date.weekday() + 1
    new_wd = new_date.weekday() + 1

    if old_wd in days:
        days.remove(old_wd)

    days.add(new_wd)

    rule["daysOfWeek"] = sorted(days)
    return json.dumps(rule)

def transform_to_datetime(lesson, data):
    date = data.get('date')
    start_time = data.get('start_time') if data.get('start_time') else _format_time(lesson.start_datetime)
    end_time = data.get('end_time') if data.get('end_time') else _format_time(lesson.end_datetime)
    
    data["start_datetime"] = build_datetime(
        date, start_time
    )
    data["end_datetime"] = build_datetime(
       date, end_time
    )
    return data
    

def create_lesson_instance_helper(data, parent_lesson=None):
    
    if not parent_lesson and not data.get('lesson_id'):
        raise ValueError('Need connection to parent lesson')
    if not parent_lesson:
        parent_lesson = Lesson.query.get_or_404(data.get('lesson_id'))
        
    data = transform_to_datetime(parent_lesson, data)
    data['lesson'] = parent_lesson.id
    data['max_players'] = data['max_players'] or parent_lesson.max_players
    data['overwrite_title'] = data.get('title')
    
    lesson_instance = LessonInstance()
    form = lesson_instance.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)
    
    lesson_instance.update_with_dict(values)
    lesson_instance.create()
    
    add_ids = {
        int(pid)
        for pid in data.get('add_player_ids', [])
        if pid is not None
    }

    remove_ids = {
        int(pid)
        for pid in data.get('remove_player_ids', [])
        if pid is not None
    }

    existing_ids = [
        int(rel.player_id)
        for rel in parent_lesson.players_relations
        if rel.player_id is not None
    ]

    seen = set()
    player_ids = [
        pid for pid in existing_ids + list(add_ids)
        if pid not in remove_ids and not (pid in seen or seen.add(pid))
    ]

    for pid in player_ids:
        Association_PlayerLessonInstance(
            player_id=pid,
            lesson_instance_id=lesson_instance.id,
        ).create()
        
    for rel in parent_lesson.coaches_relations:
        Association_CoachLessonInstance(
            coach_id=rel.coach_id,
            lesson_instance_id=lesson_instance.id,
        ).create()
        
    return lesson_instance

def edit_lesson_instance_helper(data, lesson_instance=None):
    
    if not lesson_instance and not data.get("lesson_instance_id"):
        raise ValueError("Need lesson_instance or lesson_instance_id")

    if not lesson_instance:
        lesson_instance = LessonInstance.query.get_or_404(
            data.get("lesson_instance_id")
        )
        
    data = transform_to_datetime(lesson_instance.lesson, data)
    data['overwrite_title'] = data.get('title')

    form = lesson_instance.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson_instance.update_with_dict(values)
    lesson_instance.save()

    for player_id in data.get("add_player_ids", []):
        Association_PlayerLessonInstance(
            player_id=player_id,
            lesson_instance_id=lesson_instance.id,
        ).create()

    for player_id in data.get("remove_player_ids", []):
        rel = Association_PlayerLessonInstance.query.filter_by(
            player_id=player_id,
            lesson_instance_id=lesson_instance.id,
        ).first()
        rel.delete()
        presence = Presence.query.filter_by(
            player_id=player_id,
            lesson_instance_id=lesson_instance.id,
        ).first()
        if presence:
            presence.delete()

    return lesson_instance


def create_lesson_helper(data):
    
    lesson = Lesson()
    form = lesson.get_create_form()
    
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson.update_with_dict(values)
    lesson.create()

    if data.get("coach"):
        Association_CoachLesson(
            coach_id=data["coach"],
            lesson_id=lesson.id,
        ).create()
        
    if data.get("player_ids"):
        for player_id in data.get("player_ids"):
            Association_PlayerLesson(
                player_id=player_id,
                lesson_id=lesson.id,
            ).create()

    return lesson

def edit_lesson_helper(data, lesson=None):
    
    if not lesson and not data.get("lesson_id"):
        raise ValueError("Need lesson or lesson_id")

    if not lesson:
        lesson = Lesson.query.get_or_404(data.get("lesson_id"))
        
    data = transform_to_datetime(lesson, data)
    if data.get("event_date") and data.get("date"):
        new_date = datetime.strptime(data["date"], "%Y-%m-%d").date()

        recurrence_rule = update_recurrence_weekday(
            lesson,
            old_date=data["event_date"],
            new_date=new_date,
        )
        data['recurrence_rule'] = recurrence_rule

    form = lesson.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)


    lesson.update_with_dict(values)
    lesson.save()

    """ if "coach" in data:
        Association_CoachLesson.query.filter_by(
            lesson_id=lesson.id
        ).delete()

        if data["coach"]:
            Association_CoachLesson(
                coach_id=data["coach"],
                lesson_id=lesson.id,
            ).create() """

    for player_id in data.get("add_player_ids", []):
        Association_PlayerLesson(
            player_id=player_id,
            lesson_id=lesson.id,
        ).create()

    for player_id in data.get("remove_player_ids", []):
        Association_PlayerLesson.query.filter_by(
            player_id=player_id,
            lesson_id=lesson.id,
        ).delete()

    return lesson


def duplicate_lesson_helper(old_lesson):
    
    new_lesson = Lesson(
        title=old_lesson.title,
        type=old_lesson.type,
        status=old_lesson.status,
        color=old_lesson.color,
        max_players=old_lesson.max_players,
        default_level_id=old_lesson.default_level_id,
        is_recurring=old_lesson.is_recurring,
        recurrence_rule=old_lesson.recurrence_rule,
        recurrence_end=old_lesson.recurrence_end,
        start_datetime=old_lesson.start_datetime,
        end_datetime=old_lesson.end_datetime,
        club_id=old_lesson.club_id,
    )
    
    new_lesson.create()

    if old_lesson.coaches:
        for rel in old_lesson.coaches_relations:
            Association_CoachLesson(
                coach_id=rel.coach_id,
                lesson_id=new_lesson.id,
            ).create()
        
    if old_lesson.players_relations:
        for rel in old_lesson.players_relations:
            Association_PlayerLesson(
                player_id=rel.player_id,
                lesson_id=new_lesson.id,
            ).create()

    return new_lesson

def delete_future_instances(lesson, cutoff):
    instances = LessonInstance.query.filter(
        LessonInstance.lesson_id == lesson.id,
        LessonInstance.start_datetime >= cutoff,
    ).all()
    for instance in instances:
        instance.delete()
    return True

def split_lesson(lesson, date, remove_current_date=False):
    recurrence_start = date + timedelta(days=1) if remove_current_date else date
    original_recurrence_end = lesson.recurrence_end

    new_start = datetime.combine(recurrence_start, lesson.start_datetime.time())
    new_end = datetime.combine(recurrence_start, lesson.end_datetime.time())
    
    new_lesson = duplicate_lesson_helper(lesson)

    lesson.recurrence_end = date

    new_lesson.start_datetime = new_start
    new_lesson.end_datetime = new_end
    new_lesson.recurrence_end = original_recurrence_end

    instances_to_move = [
        inst for inst in lesson.instances 
        if inst.start_datetime.date() >= recurrence_start
    ]

    for instance in instances_to_move:
        instance.lesson = new_lesson
    
    lesson.save()
    new_lesson.save()
    
    return lesson, new_lesson

def add_presences(lesson_instance, payload):
    """
    Processes the presences list from the payload and creates Presence records
    using the Form/RequestAdapter pattern.
    """
    created_presences = []

    for item in payload:
        player_id = item.get('playerId')
        lesson_instance_id = lesson_instance.id
        data = {
            "status": item.get('status'),
            "justification": item.get('justification'),
            "invited": True,
            "confirmed": True,
            "validated": True
        }
        
        existing = Presence.query.filter_by(
            lesson_instance_id=lesson_instance_id,
            player_id=player_id
        ).first()

        if existing:
            presence_obj = existing
            form = presence_obj.get_edit_form()
        else:
            presence_obj = Presence(
                player_id=player_id,
                lesson_instance_id=lesson_instance_id
            )
            form = presence_obj.get_create_form()

        fake_request = JsonRequestAdapter(data, form)
        values = form.set_values(fake_request)
        
        presence_obj.update_with_dict(values)
        
        if existing:
            presence_obj.save()
        else:
            presence_obj.create()
            
        created_presences.append(presence_obj)

    return created_presences