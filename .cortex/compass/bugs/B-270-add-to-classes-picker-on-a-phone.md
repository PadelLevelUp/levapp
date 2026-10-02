---
id: B-270
title: "\"Add to classes\" picker on a phone: reported cut off and not scrollable; not reproduced, a two-row list window measured on a small phone"
type: missing-criterion
severity: high
status: triaged
affects:
  - players.profile
  - frontend/apps/mobile/src/components/ui/dialog.tsx
  - frontend/apps/mobile/src/features/players/add-to-classes-dialog.tsx
  - frontend/apps/web/src/components/players/detail/AddToClassesDialog.tsx
proposed_fix: "Hardening, not a proven fix: the app's dialogs are bound to the window and the picker's list shrinks instead of the header or footer; on a phone browser the picker takes the screen's height (dvh). Maestro flow 145 is the instrument for Android."
opened: 2026-10-02T15:00:45Z
---

# B-270: the add-to-classes picker on a phone

**Source:** PAD-496 (owner feedback through the issue bot, 2026-10-02): "on the phone it is still wrong: with several classes in the week the lower ones are hidden and it cannot be scrolled". The ticket names iOS, Android and mobile web. It carries no device, no screenshot and no text size.

**Status of the report: NOT REPRODUCED.** The type above describes only the part that was measured (below). The "cannot be scrolled" part is unreproduced, and this entry must not be read as a diagnosis of it.

**What PAD-439 (#440) changed, and did not:** its scroll fix was web only (B-202: Radix ScrollArea replaced by a native overflow list). On the app it changed which classes are listed (rules 5a, 5b), not the layout: the app's list has been a ScrollView capped at 384 pt inside the shared dialog since 2026-07-10, so every installed build has that layout.

**Attempts (2026-10-02, staging 4a77b1134):**
- iOS app, iPhone 17 Pro simulator, 12 classes next week, Maestro swipe gestures on the list: scrolls from Monday to the last class; title, week arrows and Cancel/Add stay; the last class ends above the footer. The dialog is about 549 pt tall on an 874 pt screen.
- Mobile web, Chromium at 390×664 with touch, real touch events through CDP, opened through the phone-width actions menu, 12 classes: dialog 564 px, list 264 px with 1032 px of content, a finger drag moves scrollTop 0 → 768, last row ends at 469 px, footer starts at 493 px.
- Mobile web, Chromium at 360×560, 45 classes, long names, a quarter of the rows full: scrolls (0 → 3218), last class above the footer.
- Not modelled: accessibility text size (the login subflow fails at `accessibility-large`, and changing the size does not re-render an open screen); real iOS Safari (its toolbars cannot be emulated); Android (CI lane only).

**What was measured and is wrong:** at 360×560 the web picker is 476 px tall and its list window is 156 px, about two classes, under 320 px of title, description, week row and two stacked buttons. Nothing is unreachable; it is a slit. This may be what "cut off" meant. Rule 5c had no criterion for a phone.

**What could make the app's dialog leave the screen (not observed):** the dialog overlay centres its content, so a dialog taller than the window loses its title above the screen and its footer below it. With a list fixed at 384 pt that needs a very short screen or a large text size.

### Change plan (hardening)
- Rule 5c: the picker never exceeds the window on any surface; on a phone it uses the screen's height; a criterion for a phone.
- App: `DialogContent` is bound to the window, the larger safe area left free at both ends (`dialogMaxHeight`); the picker's list loses the fixed 384 pt and shrinks (`flexGrow: 0, flexShrink: 1`). The notify dialog's list keeps its 384 pt: that dialog has a search field and nothing lifts a dialog above the keyboard (review of #515). A component test pins that the bound is applied.
- Web: `max-h-[calc(100dvh-1rem)]` below `sm`, `85dvh` from `sm`, `85vh` where the browser has no `dvh`.
- Tests: `dialog-size.test.ts`; a phone-viewport case in `e2e/players/add-to-classes-week.spec.ts` (finger drag, red on the old layout: dialog 476 px where at least 536 is required); Maestro flow 145 (swipe to the week's last class, choose it, Add becomes enabled). Flow 145 is green on the old iOS layout too: on iOS it is a guard, not a reproduction. On Android it is the instrument that says whether Android is the broken surface.

### Resolution
Open until the Android lane has run flow 145 and the owner has said where he saw it.
