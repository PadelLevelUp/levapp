---
id: B-078
title: "\"Precisa de ti\" reply rows do not open the message on either shell"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/coach_home.py
  - frontend/apps/web/src/pages/MessagesPage.tsx
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
proposed_fix: "Rule 10: a reply item's href is the conversation route (`/messages/<id>`); iOS maps it to its conversation screen; web still honours the old `?conversationId=` shape."
opened: 2026-09-11T15:05:00Z
resolved: 2026-09-11T15:40:00Z
---

# B-078 — "Precisa de ti" reply rows do not open the message

**Source:** founders' note 2026-09-11 (PAD-284): "Clicar nas mensagens no 'Precisa de ti' não
abre a mensagem em si."

**What happens:**
- `reply_items` emits `href: "/messages?conversationId=<id>"` (`coach_home.py`).
- Web's messages route is `/messages/:id`; `MessagesPage` reads `useParams().id` only and never
  looks at `?conversationId=`, so the row lands on the conversation LIST with nothing selected
  (checked on staging 72ac170a8).
- iOS's `go()` maps any `/messages…` href to the Messages TAB (`blocks.tsx`), never to the
  conversation screen.
So the row "opens messages" on both shells and opens the message on neither.

**What should happen:** the row opens that conversation, on the thread.

**Root cause:** `dashboard.blocks` rule 3 says every queue item "carries its own `href`" but
never says where each kind must land; the reply href was written in a shape neither shell
resolves. Incomplete rule.

**Evidence:** `grep conversationId MessagesPage.tsx` — only SSE payload handling, no search
param read; `blocks.tsx:87` — `else if (href.startsWith("/messages")) router.push("/(tabs)/messages")`.

**Affected specs:**
- Dev: `.specflow/specs/dashboard/blocks.spec.md` (new rule 10)

### Change Plan

**Spec to modify:** `.specflow/specs/dashboard/blocks.spec.md` — rule 10 (with PAD-283 and
PAD-285): a `reply` item's `href` is `/messages/<conversationId>`; both shells open that
conversation (iOS: `/conversation/[id]`); web keeps honouring `?conversationId=` for cached
payloads.

**Then:** red backend test on the href, red iOS unit test on the route mapping, Playwright:
click the reply card → `/messages/<id>` with the thread visible; fix; regression.

### Resolution

- Spec: `dashboard.blocks` rule 10.
- Tests: `backend/padel_app/tests/test_pad283_needs_you_deep_links.py`
  (`test_reply_href_is_the_conversation_route`), `frontend/apps/mobile/src/features/dashboard/routes.test.ts`,
  `frontend/apps/web/e2e/dashboard/needs-you-deep-links.spec.ts` (PAD-284 case).
- Code: `coach_home.py` href; `routes.ts` (`dashboardRoute`) used by `blocks.tsx`; `MessagesPage`
  redirects `?conversationId=` to `/messages/<id>`.
- Resolved: 2026-09-11 (PAD-284, shipped in PAD-283's PR).
