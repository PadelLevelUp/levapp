def serialize_coach_level(l):
    return {
        "id": str(l.id),
        "coachId": l.coach_id,
        "code": l.code,
        "label": l.label,
        "displayOrder": l.display_order,
    }