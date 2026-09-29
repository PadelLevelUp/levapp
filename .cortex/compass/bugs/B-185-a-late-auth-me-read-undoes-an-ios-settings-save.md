---
id: B-185
title: "iOS Settings: an older auth-me read landing after a save put the old value back in the picker"
type: incomplete-rule
severity: low
status: resolved
affects:
  - settings.language
  - frontend/apps/mobile/src/features/settings/preferences-section.tsx
  - frontend/apps/mobile/src/features/settings/profile-section.tsx
  - frontend/apps/mobile/src/features/settings/student-notification-blocks-section.tsx
proposed_fix: "settings.language rule 8. writeAuthMe cancels any in-flight ['auth-me'] read and then writes the save's answer. All four iOS saves that write the profile cache use it, and a source scan pins that wiring."
opened: 2026-09-25T12:42:19Z
resolved: 2026-09-25T12:44:51Z
---

# B-185: an older auth-me read undid an iOS Settings save in the cache

**Source:** Session-C's review of #429 (PAD-453 / B-184, the web counterpart), confirmed independently by Session-E. Ticket PAD-454.

**What happens:** the iOS Settings saves write the server's answer with `queryClient.setQueryData(["auth-me"], updated)` and do not cancel an `["auth-me"]` read already in flight (the section's own read, or a focus refetch). react-query then writes that read's older answer over the saved one when it lands. The language picker follows the cache (an effect on `me?.language`), so it showed the old language while the server and `i18n` held the new one. The same applied to request alerts, the profile form and the notification blocks. It's display-only, since the server is correct.

**What should happen:** the save's answer is the newest profile; an older read never replaces it.

**Root cause:** Type 2, an incomplete rule. Nothing in `settings.language` (or the profile specs) said how a save's answer and an in-flight read are ordered in the client cache.

**Evidence (Phase 1, 2026-09-25):** `write-auth-me.test.ts` drives the race on a real `QueryClient` (the mobile harness cannot mount react-query hooks): the cache holds `en`, a read answering `en` is in flight, the save writes `pt`, then the read lands. With the helper written as the old code (`setQueryData` only), the test fails (cache `{"language": "en"}`, expected `pt`). With `cancelQueries` first, it passes.

### Change Plan

**Spec:** `settings.language`. Add rule 8 and the criterion "An iOS save is not undone by an older profile read (B-185)".
**Code:** add `src/features/settings/write-auth-me.ts` (`cancelQueries`, then `setQueryData`). Use it in `preferences-section.tsx` (language, request alerts), `profile-section.tsx` and `student-notification-blocks-section.tsx`.
**Tests:** `write-auth-me.test.ts`: the race, a plain write, and a source scan requiring no direct `setQueryData(["auth-me"], updated)` in any mobile file, with the three sections wired through the helper. The scan was proven red by putting one direct write back in `profile-section.tsx`. Two existing section tests gain `cancelQueries` on their `useQueryClient` fake.

### Resolution

- Spec: `settings.language` rule 8, plus its criterion.
- Tests: `write-auth-me.test.ts` (3); `profile-section.test.tsx` and `student-notification-blocks-section.test.tsx` fakes updated. Mobile vitest: 644 passed, 72 files. `tsc -p apps/mobile/tsconfig.json`: clean.
- Code: `write-auth-me.ts`, plus the three sections.
- iOS-only: the web Settings page keeps no such cache; its read race was B-184.
