from padel_app.serializers.user import serialize_user


def serialize_player(player):
    return {
        "id": player.id,
        "userId": player.user_id,
        "user": serialize_user(player.user),
    }
