# Mobile ↔ Web Feature Parity Plan

> Revised after review, 2026-07-10. Supersedes the draft in `~/.claude/plans/snug-wobbling-trinket.md`.
> Parity is bidirectional: most gaps are mobile-missing-web-features, but two are the reverse
> (web's blocker delete lacks a confirmation, web's Add-to-Classes is a stub) and are fixed here too.

## Context

A cross-platform UI audit (web desktop / web mobile-viewport / native iOS — see `cross_platform_report/report.html`) found that the LevelUp iOS app is a **functional subset** of the web app: entire coach workflows exist only on web (Calendar Notify/Remind/Edit/Planning, Player evaluations/waiting-list, the court-diagram editor, most of Settings, message reactions/read-receipts, etc.). Goal: both apps support the same functionality.

Follow-up code research verified every gap, found exact file paths on both platforms, and confirmed which shared (`packages/*`) hooks/APIs already exist. Key wrinkle: **several "web features" are mocked on web itself** (Profile fields beyond name, Theme, Time format, Week-start, Analytics, Billing, Security password-change, Import Data, generic Notification toggles — all local-state-only, never persisted). Those are skipped and documented in `found_issues.md` as open product decisions.

Confirmed decisions:
- **Court-diagram editor**: full port, adding `react-native-gesture-handler` as a new native dependency.
- **Fake-on-web Settings items**: skip, document in `found_issues.md`.
- **Dead "blocker type" selector** (mobile Availability): remove — web doesn't have it and the backend force-overwrites it to `"unavailable"`.
- **Mobile i18n**: bundled into this plan as foundational infrastructure.
- **Messages "More options" kebab**: skip (dead on web too) — `found_issues.md`.
- **"Add to Classes"**: build as a *real* feature on both platforms (web's version currently shows a success toast without calling any API).

## Key architectural fact

`packages/api/src/resources/*` and `packages/hooks/src/queries.ts` are the platform-agnostic data layer; `apps/web/src/api/*.ts` are mostly thin re-exports. Most gaps are therefore **pure UI gaps** — the API/hook already exists and is directly importable into `apps/mobile`. Exceptions are called out per item.

---

## Phase 0 — Shared infrastructure (unlocks later phases)

1. **Add `react-native-gesture-handler`** to `apps/mobile` (Expo-compatible native module; requires a dev-client rebuild). Needed for the court-diagram editor; also enables real drag-and-drop later.
2. **Toast/snackbar primitive** — `apps/mobile/src/components/ui/toast.tsx`. Mobile has no toast anywhere (verified); convention today is inline `<Text className="text-destructive">`. Model on web's `sonner` usage (success/error variants); used by every mutation added below.
3. **Shared date/time picker components** — `apps/mobile/src/components/ui/date-picker-input.tsx` / `time-picker-input.tsx` on the already-installed-but-unused `@react-native-community/datetimepicker@8.4.4`. Consumers: `BlockerForm.tsx` and `app/class/new.tsx` (both free-text `YYYY-MM-DD`/`HH:MM` today). ⚠️ Native pickers are hard to drive from Maestro — check `.maestro/README.md` gotchas; existing flows assert against the text inputs and need rework in the same PR.
4. **Fix the shared locale bug**: `packages/hooks/src/useCalendar.ts:76` hardcodes Portuguese `"de"` into an English-formatted week range (`"6 - 12 de July 2026"`). Web re-exports this hook, so one fix repairs both platforms (verified line still present).
5. **Mobile i18n infrastructure**: add `react-i18next` (+ `expo-localization`) to `apps/mobile`; mirror web's `src/locales/{pt,en}/*.json` convention; language persistence already exists (`authApi.updateMe({ language })`, used by mobile Settings).
   **Scope decision made explicit:** this phase covers infra + all *new* UI in Phases 1–7 using `useTranslation()` from day one. **Retrofitting existing mobile screens' hardcoded English strings is a separate, explicitly-scoped follow-up ticket** ("mobile i18n retrofit") — otherwise a pt user gets a mixed-language app. Create that ticket when Phase 0 lands; do not silently skip it.

## Phase 1 — Quick wins (small, independent)

- **Calendar**: "Today" button in `WeekStrip.tsx` — `calendar.goToToday()` already exists on the shared hook, just unwired.
- **Calendar** (`app/class/[id].tsx`): display the `Level` field — data already on `useClassInstance`; `useCoachLevels` already used elsewhere on mobile.
- **Players** (`PlayerForm.tsx` + `[playerId].tsx`): add the `Notes` field — edit-player API already accepts `notes`; the form just never exposed it.
- **Training** (`exercises-tab.tsx`, `groups-tab.tsx`): search boxes (client-side filter) + type/difficulty `Select` filters on Exercises (`@rn-primitives/select` already in use; `EXERCISE_TYPE_OPTIONS`/`DIFFICULTY_OPTIONS` already imported).
- **Messages** (`(tabs)/messages.tsx`): conversation search field (client-side, mirrors `ConversationList.tsx`).
- **Messages** (`message-bubble.tsx`): delivery/read-receipt icons — add `sent`/`delivered`/`read` states mirroring web's `StatusIcon` (`Check`/`CheckCheck` → Ionicons `checkmark`/`checkmark-done`). While implementing, confirm the backend actually returns those status values on fetched messages (web renders them, so expected yes).
- **Messages** (`(tabs)/messages.tsx`): fix the FAB overlapping the last conversation row (add bottom padding to the FlatList) — cosmetic bug from the audit.
- **Dashboard** (`DashboardBlocks.tsx`): align the notification status badge with web — mobile renders solid orange capitalized "Sent" (`STATUS_VARIANT: sent → "secondary"`), web renders pale blue lowercase (`STATUS_STYLES: sent → "bg-blue-100 text-blue-700"`); pick web's treatment. Also add `accessibilityLabel` to the icon-only "add participants" control (and the web `aria-label` counterpart).
- **Availability** (`BlockerForm.tsx`): remove the dead "blocker type" `Select` + `BLOCKER_TYPE_OPTIONS` + the `type` key on `BlockerPayload`.
- **Web fix — blocker delete confirmation** (`apps/web/src/pages/AvailabilityPage.tsx:181` `handleDelete`): fires on a single click with zero confirmation (verified — no dialog in the file). Add an `AlertDialog` confirm to match mobile. Update `student-blockers.spec.ts`, which currently asserts the no-confirm flow.
- **Navigation depth** (`(tabs)/_layout.tsx`): promote Availability (student) into the role-conditional slot pattern already used by `players` (`href: isCoach ? undefined : null`) — students then get Dashboard/Calendar/Availability/Messages/More.
  ⚠️ **Training is not symmetric**: coaches already have 5 tabs; adding Training makes 6, which crowds an iOS tab bar. Decide at implementation time: (a) accept 6 tabs, or (b) keep Training under "More" for coaches and drop this half of the item. Don't treat the audit's "2-taps-deep" note as automatically requiring a tab.
  ⚠️ This breaks existing Maestro flows that navigate `tab-more → more-training` / `more-availability` (`10-exercise-crud.yaml`, `11-exercise-groups.yaml`, `13-student-availability.yaml`) — update them in the same PR.

## Phase 2 — Calendar parity (largest functional gap)

`app/class/[id].tsx` lacks nearly every mutation of web's `ClassDetailSheet.tsx`. Order matters:

1. **Edit class** — `useEditClass` hook in `src/features/calendar/hooks.ts` wrapping shared `classesApi.editClass`; inline edit-mode UI (name/date/time/capacity/level/color/recurring — reuse `class/new.tsx` field components + Phase 0 pickers); port `ClassScopeDialog.tsx` for recurring-edit scope. Biggest item in the phase.
2. **Auto-notifications toggle** — standalone toggle on the detail screen (web shows it outside edit mode, `ClassDetailSheet.tsx` L722-742), reading `useAutoInviteEnabled` from `@levelup/hooks` and persisting `notificationsEnabled` via the `editClass` mutation from step 1.
3. **Notify button** — new picker modal (players/groups multi-select; no mobile `PlayerSelector` exists yet) over shared `notificationEngineApi.sendManualNotifications`/`getNotificationGroups`. Mirror `ManualNotificationModal.tsx`.
4. **Remind button** — thin mutation over shared `notificationEngineApi.sendClassReminders`.
5. **Invited (N) list** — collapsible section over `instance.invitations` (already returned by `useClassInstance`); live updates via the SSE pattern already used in `conversation/[id].tsx` (`src/lib/sse.ts`), listening for `notification_responded`/`notify_sent`.
6. **Planning/exercises section** — picker UI over shared `useExercises`/`useExerciseGroups`; add a `useConfirmClassTraining` mutation (confirm the shared `packages/api` training resource exposes it; web calls `confirmClassTraining`).
7. **"Add event" creation** — web has a second creation entry point (`AddEventSheet.tsx`: personal/break calendar blocks) that mobile lacks entirely; mobile's calendar already *renders* generic `CalendarEvent`s, so this is creation-UI only. Add an entry point alongside the existing add-class FAB (e.g. FAB menu or long-press) + a form mirroring `AddEventSheet.tsx`.

## Phase 3 — Players parity

- **Add Evaluation** (`[playerId].tsx`): score-entry flow mirroring `AddEvaluationSheet.tsx` (sliders per category + notes), over shared `evaluationApi.getEvaluationCategories`/`postEvaluationEntry`. Mobile's `StrengthsWeaknesses.tsx` may cover the notes half.
- **Waiting list**: dialog (duration + credits) over shared `notificationEngineApi.{getStandingWaitingList,addToStandingWaitingList,removeFromStandingWaitingList}`; show the "On waiting list" removal state like web (`PlayerDetailPage.tsx` L264-296).
- **Add to Classes** (real feature, both platforms): web's `AddToClassesDialog` `onSave` only toasts — never calls an API (verified). Build the actual enrollment using the `editClass` participant-diff pattern from Phase 2.1, wire web's dialog to it, and port the week-nav class picker to mobile. Verify during implementation that the backend `edit_class` path accepts participant additions initiated outside the class-detail context.

## Phase 4 — Training parity + Court Diagram Editor

- **Group-folder inline browsing** (`groups-tab.tsx`): RN equivalent of `ExerciseGroupFolder.tsx` (expand group inline, edit/delete member exercises) — `useUpdateExercise`/`useDeleteExercise` already imported on mobile.
- **Toast wiring**: connect Phase 0's toast to all Training create/update/delete mutations (web toasts on every one; mobile is currently silent, including on failure).
- **Court Diagram Editor** (`src/features/training/court-diagram-editor.tsx`, new): full port of web's 623-line `CourtDiagramEditor.tsx`. Rendering: `react-native-svg` (installed) — the SVG primitives map 1:1. Interactions (select/drag/place/line-draw/curve-handle/endpoint-drag): `react-native-gesture-handler` (Phase 0). Types (`CourtDiagram`/`CourtElement`) already in `packages/types/src/training.ts`. Make touch targets larger than web's 14px hitboxes. Wire into `exercise-form.tsx`, replacing the pass-through-only `diagram` handling.

## Phase 5 — Messages parity

- **Reactions UI**: data layer fully wired (type, SSE handler in `conversation/[id].tsx`, `toggleReaction` in shared API) — pure UI: long-press quick-reaction picker (web's `MessageActionMenu.tsx` `quickReactions`) + reaction pills under bubbles (web `MessageBubble.tsx` L376-393).
- **"Waiting for response..." + invite/reminder respond actions**: port the `messageType === "notification_invite"` block from web's `MessageBubble.tsx` (status line for own messages, Yes/No buttons for received invites) — new mobile hook around `notificationEngineApi.respondToNotification`. This is the full response block, not just the label.

## Phase 6 — Settings parity (real items only)

- **Club section**: port `ClubSection.tsx` (invite/list/revoke co-coach invitations) — shared `packages/api/src/resources/invitations.ts` is ready.
- **Auto-Invite Engine — basic controls**: on/off + automatic/semi-automatic mode via shared config API (`getNotificationConfig`/`updateNotificationConfig`). The seven web sub-panels (Reminders, InvitationGroups, Tiebreakers, Restrictions, NotificationGroups, MessageTemplates, StandingWaitingList) are a follow-up — logged in `found_issues.md`.
- **Skill-level reorder**: ▲/▼ move buttons per row — persistence already works (mobile's `coach-levels-section.tsx` re-POSTs the full array with `displayOrder`); true drag-and-drop is a cheap follow-up once gesture-handler is in.

## Phase 7 — Availability polish

- Swap `BlockerForm.tsx` free-text date/time inputs for Phase 0's pickers; do `class/new.tsx` in the same pass (identical pattern). Update the Maestro flows that type into those fields (`03-class-management.yaml`, `13-student-availability.yaml`).

---

## `found_issues.md` (deliverable at `levelup_frontend/found_issues.md`)

Document for future product decisions — not built now:

1. **Settings items mocked on web** (local-state only, never persisted; backend `PATCH /auth/me` only supports `language`): Profile fields beyond name (abbreviation/email/phone/bio/avatar), Theme, Time format, Week-start, Analytics opt-in, generic Notification toggles, Billing (placeholder card, disabled button), Security password-change (mock `setTimeout`, no backend endpoint exists), Import Data (real but web-only API in `apps/web/src/api/import.ts`, arguably desktop-appropriate). Each needs a build-for-real-or-remove decision.
2. **Messages "More options" kebab** unwired on web (`ChatHeader.tsx` — icon with no `onClick`). Decide what it should do before either platform builds it.
3. **Calendar capacity-count mismatch** (web desktop): event-card badge, detail-panel "Capacity" tile, and "Participants" header showed three different counts for the same class ("2/6" / "1/6 · 5 open, 9 pending" / "2/6"). Own bug ticket.
4. **Student dashboard counter mismatch** (web): "Invites" KPI read 2 while "Invites to confirm" showed "No pending invites". Verify whether they represent the same thing.
5. **Web recurring-class delete scope**: iOS delete is recurrence-aware ("only this class" vs "this and future"); web's equivalent handling was not confirmed during the audit. Verify web, add scope dialog if missing.
6. **Web player-list cards not accessible**: cards aren't exposed as buttons/links in the a11y tree (mobile's are proper `Pressable`s with labels). Web-side a11y fix.
7. **Auto-Invite Engine full sub-panel parity on mobile** (7 panels) — deferred from Phase 6.
8. **Mobile push notifications are stubbed** (`PUSH_TOKEN_ENDPOINT = null` in `expoPushRegistrar.ts`): Notify/Remind sent *from* mobile work (server-side), but mobile users don't *receive* push. Needs a backend native-token endpoint. Adjacent to, not part of, this plan.
9. **Mobile i18n retrofit** of existing screens' hardcoded English strings — scoped follow-up to Phase 0 (see there).

---

## Verification

Per phase, follow the project's ticket workflow (`/write-e2e-test` → `/plan-implementation` → implement → `/run-e2e-iterate`):
- Exercise each new flow manually in the iOS Simulator (iPhone 17 Pro, UDID `180A9433-4EA7-4F9B-9FD1-79E1250BD9BB`) against the dev backend.
- Add/update Maestro flows per feature (`15-…yaml` onward); keep the web→Maestro coverage table in `apps/mobile/README.md` in sync. Phases 0.3, 1 (nav), and 7 **modify existing flows** — budget for that, not just new ones.
- Web-side changes (blocker-delete confirm, Add-to-Classes wiring, badge/a11y) need Playwright spec updates; note `exercise-crud.spec.ts` US-48/US-16 are pre-existing failures on main (see project memory) — don't chase them as regressions.
- Anything touching `packages/*` (locale fix, new hooks): spot-check web, since it re-exports the same modules.
- Suggested flow: decompose each phase into Linear child tickets (`/decompose-feature-request` pattern) so work is trackable.
