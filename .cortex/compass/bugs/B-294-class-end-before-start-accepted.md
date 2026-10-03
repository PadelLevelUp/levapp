---
id: B-294
title: "A class whose end is at or before its start is accepted by the server and by the iOS editor"
type: incomplete-rule
severity: medium
status: open
affects:
  - backend/padel_app/services/lesson_service.py
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "Refuse end_time <= start_time in _refused_class_fields (400 invalid_fields naming end_time) on add_class and edit_class; give the iOS class editor the new-class screen's 'must be after start' check."
opened: 2026-10-03T15:14:53Z
---

# B-294: an end at or before the start is accepted

**Source:** the review of #544 (PAD-508), 2026-10-03. The reviewer asked whether the class editor refuses an end typed before the start, on the belief that the new-class sheet already did.

**What happens:**
- **Web, before #544:** neither the new-class sheet nor the class editor refused it. The new-class sheet only re-defaults the end when the *start* changes, so an end typed earlier than the start was sent as is. #544 adds the check to both web sheets.
- **iOS:** the new-class screen refuses it (`classDetail.new.mustBeAfterStart`, `app/class/new.tsx:214`); the class editor (`app/class/[id].tsx`) does not.
- **Server:** `POST /api/app/add_class` and `/edit_class` check each time is `HH:MM` (`_refused_class_fields`, B-275) but not their order, so a class 10:00–09:30 is stored.

**Root cause:** the order of the two times was only ever a client rule, kept on one of four screens.

**Which guard should have caught it, and did not:** `classes.create` rule 8a (B-275) covers the shape of a time, not the pair; no criterion said the end follows the start.

### Not fixed here
#544 fixes the two web sheets only (its scope, by the coordinator's call). The server refusal and the iOS editor's check are this entry's open work; the server refusal also protects old app builds.
