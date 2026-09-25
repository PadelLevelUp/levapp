---
id: B-198
title: "Web: the browser-alerts-blocked banner pushes the thread and composer below the viewport (unreproduced)"
type: missing-criterion
severity: medium
status: open
affects:
  - messaging.push-notifications
  - frontend/apps/web/src/pages/MessagesPage.tsx
proposed_fix: "Unreproduced. The guard criterion and E2E are in; a fix waits for the owner's browser, window size and screenshot."
opened: 2026-09-25T13:54:42Z
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
