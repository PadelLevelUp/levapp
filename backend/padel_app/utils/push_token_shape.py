"""messaging.push-notifications rule 9b (PAD-741, B-706): the one place that decides what a native
push token is. Only an Expo push token can be sent through Expo; iOS build 34 also posted the raw
APNs device token its rotation listener received, which Expo answers with DeviceNotRegistered.

The shape, never the token, is what callers may log."""
import re

_EXPO = re.compile(r"^Expo(?:nent)?PushToken\[[^\[\]\s]+\]$")
_APNS_HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


def token_shape(token) -> str:
    """`expo`, `apns_hex64` (the raw iOS device token) or `other`."""
    if not isinstance(token, str):
        return "other"
    if _EXPO.match(token):
        return "expo"
    if _APNS_HEX64.match(token):
        return "apns_hex64"
    return "other"


def is_expo_push_token(token) -> bool:
    return token_shape(token) == "expo"


def revoke_device_token(user_id, token) -> int:
    """Rule 9b, the revoke half (`DELETE /api/notifications/device`, `/auth/logout`'s `pushToken`):
    the caller's row for this token goes, as before. A token that is not an Expo token (iOS builds
    34 and 35 cache the raw device token, B-706) cannot name the Expo token it stands for, and
    nothing ties the two, so every Expo row the caller holds goes too: the match is by account, not
    by device, and the signed-out phone stops receiving the account's pushes (B-167). Another
    user's rows are never touched. The caller commits. Answers the number of rows removed."""
    from padel_app.models import DeviceToken

    removed = DeviceToken.query.filter_by(user_id=user_id, token=token).delete(synchronize_session=False)
    if not is_expo_push_token(token):
        removed += DeviceToken.query.filter(
            DeviceToken.user_id == user_id,
            DeviceToken.token.like("Exp%PushToken[%"),
        ).delete(synchronize_session=False)
    return removed
