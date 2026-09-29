---
id: B-198
title: "Web: with a long conversation list, the browser-alerts-blocked banner pushes the composer past the page clip"
type: missing-criterion
severity: medium
status: resolved
affects:
  - messaging.push-notifications
  - frontend/apps/web/src/pages/MessagesPage.tsx
proposed_fix: "MessagesPage content row `flex h-full` -> `flex flex-1 min-h-0` (PAD-417)."
opened: 2026-09-25T13:54:42Z
resolved: 2026-09-29T14:03:49Z
---

# B-198: the "alerts blocked" banner pushes the composer off-screen (web)

**Source:** PAD-417 (owner via Discord, 2026-09-24). On the Messages page, the "Alertas do navegador bloqueados…" banner pushed the messages and the composer down, so they appeared cut off at the bottom. The id comes from Session-D's range B-196–200.

**Suspect, from reading:** `MessagesPage.tsx:501` is a column flex `h-full`, with the banner as its first child. The content row at `:528` is `flex h-full` rather than `flex-1 min-h-0`, so it asks for 100% of the height the banner already took from. In Chromium it still fits: the row, a flex item, shrinks.

## Reproduction attempts (all Chromium, isolated E2E stack, staging 86a9ab42f, 2026-09-25)
- The banner forced with PAD-195's init script (`Notification.permission = "denied"`).
- The coach opens the thread with E2E Student. The composer's send button (`composer-send`) must end inside the viewport.
- 390×844 (phone), 1280×600 and 1280×720: all inside. A 60-message thread at 1280×600: inside.
- Screenshot at 1280×600: banner on one line, composer fully visible.
- **Not tried:** Safari/WebKit (not installed here), and the owner's exact window and zoom.

**Unreproduced, so no type is claimed.** The `type:` above records only the gap the guard closes: no criterion said the banner must leave the composer on screen.

## What is in (PAD-417 branch)
- **Criterion** in `messaging.push-notifications`: "The alerts-blocked banner leaves the thread and composer on screen (PAD-417)".
- **E2E** `push-denied-feed.spec.ts` "PAD-417 (phone | short laptop | laptop)". Green on today's code. A mutant that makes the content row viewport-tall (`h-[100vh] shrink-0`) turns it red, so the guard can fail.
- **Asked of the owner** (via the coordinator): browser, window size and a screenshot.

## Reproduced and fixed (Session-D, 2026-09-29, staging 8ead1d1b)

**Root cause.** The trigger is a **conversation list taller than its pane**, not the browser. The content row is a flex item of the `flex-col h-full` column with `height: 100%`. Its automatic minimum height (`min-height: auto`) comes from its content. With a long list, that minimum is the full column height, so the row can't shrink by the banner's height: it overflows `<main>` by the banner (33 px at 1280 wide), and `<main>`'s `overflow-hidden` clips the composer's bottom (the send button ends 17 px past the clip). The seed's coach has two conversations, which is why the 09-25 attempts stayed inside.

**Engine-independent.** A static CSS model of the page chain gives identical numbers in Chromium and WebKit (Playwright 1.62.1) at 1280×720: 2 conversations → fits; 60 conversations → +33 px row / +17 px send, whatever the thread length; `flex-1 min-h-0` → fits in all four cases. So "Safari untested" was never the gap.

**The first guard's blind spot.** It compared the send button with the *viewport*. `<main>` clips, and on a phone it keeps bottom padding for the tab bar, so a clipped button can still be "inside the viewport". The guard now measures against `<main>`'s content box, pads the first conversations page once to 30 rows (`page.route`), and asserts that the list really overflows its pane before measuring. It writes nothing to the database (R-040): the thread is the seeded one.

**2×2 (Chromium, isolated E2E stack):**
- old code, long list: phone passes (the list and thread are separate views on a phone); 1280×600 and 1280×720 fail with **17 px**.
- old code, seed list: all three pass (09-25 runs, plus today's measurements on staging).
- fixed code, long list: all three pass.
- fixed code, seed list: the rest of `e2e/messaging/` (35 tests) passes.

**Web-only:** the banner is about browser alerts, and the iOS app has no equivalent, so there is nothing to port.
