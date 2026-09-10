---
id: B-031
title: "serialize_user hands email and phone to any authenticated user, and to anyone who can guess a user id"
type: incomplete-rule
severity: high
status: fixed
affects:
  - messaging.conversations
  - auth.activate
  - backend/padel_app/serializers/user.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Split the serializer into a public shape (id, name, username, role, avatarUrl, abbreviation) and the full shape; the users list, the messageable picker and the public activation lookup use the public one."
opened: 2026-09-07T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-031 — serialize_user hands email and phone to any authenticated user

**Root cause.** `serialize_user` is one function reused by every consumer, and it always
includes `email` and `phone`. `GET /api/app/users` (every active user, any JWT),
`GET /api/app/messageable-users` (the new-conversation picker, any role since PAD-214) and
`GET /api/app/register/user/<id>` (the activation lookup — no JWT at all, and the id is a small
integer) therefore return the contact details of people the caller has no relationship with.
Audit item H3; raised again by the messaging wave (PAD-203–206). Linear: PAD-227.

**Fix (PAD-227, 2026-09-09).** `serialize_user_public` carries only `id`, `name`, `username`,
`role`, `avatarUrl`, `abbreviation`, `isActive`; the three routes above use it. `serialize_user`
(with `email`, `phone`, `language`) stays for the coach's own profile (`GET /api/app/coach`) and
for coach-facing roster payloads (`serialize_player` / `serialize_coach`, which only reach a
coach or the player themself). The activation form no longer pre-fills email and phone: the
person activating types them, because an unauthenticated lookup by a guessable id must not
reveal them. Rules: `messaging.conversations` rule 15, `auth.activate` rule 6.

*Filed 2026-09-09 from the PAD-227 ticket; fixed in the same PR.*
