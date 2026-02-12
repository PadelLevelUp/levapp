from padel_app.tools.calendar_tools import expand_occurrences
from padel_app.models import (
    Lesson,
    LessonInstance,
    CalendarBlock,
    Association_CoachLesson,
)
from padel_app.serializers.calendar_event import serialize_calendar_event

def load_lessons_for_coach(coach_id, range_start, range_end):
    
    return (
        Lesson.query
        .join(Lesson.coaches_relations)
        .filter(
            Association_CoachLesson.coach_id == coach_id,
            Lesson.start_datetime <= range_end,
            Lesson.status == "active",
            (
                Lesson.recurrence_rule.is_(None)
                | (Lesson.recurrence_end.is_(None))
                | (Lesson.recurrence_end >= range_start.date())
            ),
        )
        .all()
    )
    
def load_lesson_instances_for_coach(coach_id, range_start, range_end):
    instances = (
        LessonInstance.query
        .join(Lesson)
        .filter(
            LessonInstance.start_datetime >= range_start,
            LessonInstance.start_datetime <= range_end,
        )
        .all()
    )

    indexed = {}
    
    for instance in instances:
        instance_coaches = (
            [rel.coach_id for rel in instance.coaches_relations]
            if instance.coaches_relations
            else [rel.coach_id for rel in instance.lesson.coaches_relations]
        )

        if coach_id not in instance_coaches:
            continue
        
        print(instance)
        print(instance.lesson_id)
        print(instance.original_lesson_occurence_date)

        indexed[(instance.lesson_id, instance.original_lesson_occurence_date)] = instance
    
    return indexed


def build_lesson_events(lessons, instances_by_key, range_start, range_end):
    events = []

    rendered_instance_ids = set()
    for lesson in lessons:
        occurrences = expand_occurrences(
            lesson.start_datetime,
            lesson.recurrence_rule,
            lesson.recurrence_end,
            range_start,
            range_end,
        )

        for occ_start in occurrences:
            occ_date = occ_start.date()
            key = (lesson.id, occ_date)

            instance = instances_by_key.get(key)
            
            if instance:
                events.append(serialize_calendar_event(instance))
                rendered_instance_ids.add(instance.id)
            else:
                # lesson-level occurrence
                events.append(
                    serialize_calendar_event(
                        lesson, 
                        override_id= f"lesson-{lesson.id}-{occ_date}", 
                        override_date=occ_date.isoformat()
                    )
                )
    
    for instance in instances_by_key.values():
        if instance.id not in rendered_instance_ids:
            events.append(serialize_calendar_event(instance))             

    return events

def load_calendar_blocks_for_user(user_id, range_start, range_end):
    return (
        CalendarBlock.query
        .filter(
            CalendarBlock.user_id == user_id,
            CalendarBlock.start_datetime <= range_end,
            (
                CalendarBlock.recurrence_rule.is_(None)
                | (CalendarBlock.recurrence_end.is_(None))
                | (CalendarBlock.recurrence_end >= range_start.date())
            ),
        )
        .all()
    )
    
def build_block_events(blocks, range_start, range_end):
    events = []

    for block in blocks:
        occurrences = expand_occurrences(
            block.start_datetime,
            block.recurrence_rule,
            block.recurrence_end,
            range_start,
            range_end,
        )

        for occ_start in occurrences:
            occ_date = occ_start.date()
            events.append(
                serialize_calendar_event(
                    block, 
                    override_id= f"block-{block.id}-{occ_start}", 
                    override_date=occ_date.isoformat()
                )
            )

    return events