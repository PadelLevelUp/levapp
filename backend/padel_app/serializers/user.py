def serialize_user_public(user):
    """The shape any signed-in user (or, for the activation lookup, anyone) may
    see about another user: messaging.conversations rule 15 / auth.activate
    rule 6 (PAD-227, B-031). Never `email`, `phone` or `language`."""
    if not user:
        return None

    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "isActive": user.status == 'active',
        "avatarUrl": user.user_image_url,
        "abbreviation": user.abbreviation_display,
    }


def serialize_user(user):
    """The owner / coach shape, contact details included. Only for the user
    themself (`/api/app/coach`) and for a coach's own roster payloads
    (`serialize_player`, `serialize_coach`) — never for a list any caller can
    read (PAD-227)."""
    if not user:
        return None

    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "isActive": user.status == 'active',
        "language": getattr(user, "language", "pt") or "pt",
        "avatarUrl": user.user_image_url,
        # PAD-81: the coach's saved abbreviation wins; otherwise fall back to the
        # initials derived from their name (the previous, always-derived behaviour).
        "abbreviation": user.abbreviation_display,
    }
