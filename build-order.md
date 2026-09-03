# Build Order

Dependency-sorted sequence for implementing or validating specs. Each tier can be worked in parallel; tiers must be completed sequentially.

## Tier 0 — Foundations (no dependencies)
1. `auth.login`
2. `auth.register`
3. `auth.logout`
4. `auth.token-refresh`
5. `auth.push-subscription`
6. `auth.activate`

## Tier 1 — Core Entities (depends on auth)
7. `clubs.crud`
8. `clubs.membership`
9. `levels.coach-levels`

## Tier 2 — Player Management (depends on clubs, levels)
10. `players.create`
11. `players.edit`
12. `players.list`
13. `players.remove`
14. `players.add-existing`
15. `players.notes`
16. `players.level-history`
17. `levels.player-assignment`

## Tier 3 — Class System (depends on clubs, players, levels)
18. `classes.create`
19. `classes.edit`
20. `classes.delete`
21. `classes.recurrence`
22. `classes.enrollment`
23. `classes.coach-assignment`
24. `classes.instances` (lazy materialization)
25. `classes.instance-enrollment`

## Tier 4 — Calendar & Attendance (depends on classes)
26. `calendar.view`
27. `calendar.blocks`
28. `calendar.drag-drop`
29. `calendar.event-detail`
30. `calendar.slot-click`
31. `attendance.presence`
32. `attendance.confirm`
33. `attendance.stats`

## Tier 5 — Evaluations (depends on players, levels)
34. `evaluations.categories`
35. `evaluations.entries`
36. `evaluations.player-view`
37. `evaluations.bulk-import`
38. `players.profile`

## Tier 6 — Messaging (depends on auth)
39. `messaging.conversations`
40. `messaging.messages`
41. `messaging.reactions`
42. `messaging.read-tracking`
43. `messaging.sse-realtime`
44. `messaging.push-notifications`
45. `messaging.conversation-detail`

## Tier 7 — Notification Engine (depends on classes, players, messaging, attendance)
46. `notifications.config`
47. `notifications.reminders`
48. `notifications.invitations`
49. `notifications.manual`
50. `notifications.waiting-list`
51. `notifications.activity`
52. `notifications.toggle-class`
53. `notifications.class-reminders-manual`
54. `notifications.groups`
55. `notifications.message-templates`

## Tier 8 — Training (depends on classes)
56. `training.exercises`
57. `training.groups`
58. `training.court-diagram`
59. `training.lesson-planning`
60. `training.exercise-view`

## Tier 9 — Import (depends on players, classes, levels, evaluations)
61. `import.analyze`
62. `import.preview`
63. `import.confirm`
64. `import.revert`

## Tier 10 — Dashboard (depends on everything)
65. `dashboard.blocks`
66. `dashboard.navigation`

---

**Total: 66 leaf specs across 13 domains, 11 tiers**
