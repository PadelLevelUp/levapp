from padel_app.serializers.user import serialize_user


def serialize_coach(coach):
    return {
        "id": coach.id,
        "userId": coach.user_id,
        "user": serialize_user(coach.user),
    }