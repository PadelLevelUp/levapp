# Summary — notification engine internals (pre-rewrite snapshot)

A working aid assembled before the notification-engine rewrite: pasted source for
the models, the core service functions and the trigger mechanism, so the engine
could be reasoned about in one place. It is a **frozen copy of code**, not a
description of behaviour — the real code has moved since (monorepo layout, then
`PAD-152` and the semi-auto-approval work).

What it covers: the `NotificationConfig` model (coach-scoped, one row per coach,
with `get_message_templates()` merging stored keys over defaults so partial
overrides work), the ranked-candidate invite flow that fills a spot when an
enrolled player is marked absent, and the trigger path from attendance
confirmation into the invite cascade.

**Do not treat this as current.** For behaviour, the authority is the thirteen
leaves under `.specflow/specs/notifications/`; for the code, read the code. This
is kept only so the pre-rewrite shape is recoverable when reading old tickets and
migrations that assume it.

Verbatim source: `source.md` (gitignored — schema §4.4).
