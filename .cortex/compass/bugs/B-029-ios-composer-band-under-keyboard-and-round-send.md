---
id: B-029
title: "iOS composer keeps a 24pt band under the input while the keyboard is open, and its send button is a filled circle unlike web"
type: incomplete-rule
severity: low
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/web/src/components/messages/Composer.tsx
  - frontend/apps/web/src/components/ui/message-textarea.tsx
proposed_fix: "State the composer geometry in the spec (rules 13–14): symmetric row padding with zero extra inset while the keyboard is open, and a send button that is a rounded-square icon button as tall as the input on both platforms."
opened: 2026-09-07T12:00:00Z
resolved: 2026-09-07T18:30:00Z
---

# B-029 — iOS composer band under the keyboard, round send button, web button shorter than input

**Source:** owner screenshots of the iOS app and the mobile web app, 2026-09-07.

**What happens:** on iOS with the keyboard open the composer row shows 12pt above the input but
24pt below it — the PAD-145 fix reduced the keyboard-open inset to a constant 12 instead of 0, and
the row's own `p-3` adds another 12 — so the input reads as pushed up and off-centre. The send
control was a filled circle with the solid Ionicons glyph, where web draws a rounded square with
the outline paper plane. On web the textarea was 40px tall against a 44px default button, so with
`items-end` the button sat 4px proud of the input.

**Why the spec let it through:** rule 7 only says "no gap"; it never stated the row's own
geometry, and nothing described the send control at all, so each platform styled it on its own.

**Resolved 2026-09-07:** rules 13 and 14 pin the geometry. iOS derives the extra inset from
`composerBottomPadding()` (0 while the keyboard is open, the safe-area inset otherwise — pinned by
`composer-padding.test.ts`), and the send button is `rounded-md` with `paper-plane-outline`. Web
gives the textarea 44px (`py-3`, `min-h-[44px]`) and the send button the `icon` size, so both are
44px.
