---
id: B-237
title: "iOS thread: a push target newer than the cached thread walked older pages and was consumed before the GET landed"
type: incomplete-rule
severity: low
status: triaged
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "The target walk does not step while this open's own GET is in flight."
opened: 2026-10-01T18:48:32Z
---

# B-237: a push target newer than the cache walked older pages (PAD-475)

**Source:** found while reproducing B-236, 2026-10-01.

**What happens:** rule 12's walk assumes a missing target is OLDER than what is loaded. A push target is by definition newer than the cached thread. With a cached copy on screen the walk either loads older pages for it (up to 10) or, with no older page, gives up and consumes the target, before the open's GET has delivered the message.
**What should happen:** the walk waits for this open's GET, finds the target in its first page and lands on it.

**Evidence:** real-tap cell of B-236 (18:45:42Z): after the tap Flask logged `GET /api/app/conversation/1?limit=50&before=24` and no first-page GET; the failure screenshot shows the list scrolled up among old rows.

**Affected specs:** `.specflow/specs/messaging/push-notifications.spec.md` rule 12.

### Change plan
- Spec: covered by rule 12a (the walk waits for the open's GET).
- Tests: a unit test of the pure gate (`shouldStepTarget`), red against a stub.
- Code: the landing effect returns early while the open's phase is "in-flight".
