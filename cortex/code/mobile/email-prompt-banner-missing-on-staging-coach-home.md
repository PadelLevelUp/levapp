---
about: "Mobile, staging only: a coach with no email no longer sees the add-email banner on the coach home although /me qualifies and the home blocks render"
permanence: changing
verified: "2026-11-13 (observed)"
origin:
  - session:59287fd5-5f60-420e-a294-aac083814775
  - report:docs/plans/ci-tools/m3/README.md
need:
  - frontend/apps/mobile/app/(tabs)/dashboard.tsx
  - frontend/apps/mobile/src/features/dashboard/email-prompt-banner.tsx
  - frontend/packages/config/src/email-prompt.ts
  - backend/padel_app/helpers/dashboard/coach_home.py
aliases:
  - B-728
  - B-728-email-prompt-banner-missing-on-staging-coach-home
status: open
---

# B-728: the add-email banner does not mount on the staging coach home

**Source:** ci-tools stream (lead and m3), 2026-11-13, from the Android lane. Runs: 43523452495 (the diagnostic dispatch on d56cc2020); 43505514297, 43313366996 and 43297928957 (flow 132 red on staging-based code); nightlies on main 22f44cc71 green 9 of 9. The leads stream notes (`docs/plans/ci-tools/`, local) hold the dispatch readings. Found while classifying the
nightly reds for PAD-710; not a lane problem.

**What happens:** Maestro flow `132-email-prompt` (a coach whose email was cleared through the API opens
the coach home and must see `email-prompt`, `auth.email-verification` rule 14) is green 9 of 9 on `main`
22f44cc71 and red 3 of 3 on every staging-based Android run, with the same three predecessor flows, so
not order or state. The diagnostic on d56cc2020 read the coach's `/me` through an API session right after
the app's sign-in: `email=null`, `emailVerification=unverified`, `roles=["coach"]`, exactly what
`asksForEmail` requires. The coach home rendered its blocks (`dashboard-needs-you`, `-next-class`,
`-queue-validation`, `-incomplete-players`, `-schedule`) and the hierarchy held no `email-prompt` node at
the top, after a 20 s wait, or after scrolling down and up.

**What did not change main..staging (read by the lead):** `email-prompt-banner.tsx`, `asksForEmail`,
`app/(tabs)/dashboard.tsx` and its id switch (`coach_default_v1`), `AuthContext.tsx`, the backend login
and `/me` shapes, the E2E seed. **What changed:** the coach home payload (`helpers/dashboard/coach_home.py`,
125 lines) and `features/dashboard/blocks.tsx`, in the engine batches (PAD-920, PAD-932, PAD-933).

**Why it matters:** a real coach with no email on Android loses the only in-app prompt to add one. Web is
untested on staging for this; its twin spec is `apps/web/e2e/settings/pad482-email-prompt.spec.ts`.

**Repro:** `gh workflow run android-build.yaml --ref <staging-based branch> -f flows=flows/132-email-prompt.yaml`
and read the Android lane check; or run flow 132 on a simulator against a staging-based backend.

**Status:** open; routed by the orchestrator to the engine stream (2026-11-13). Flow 132 stays red on the
lane on purpose (not tagged) until the fix lands. Promotion go/no-go item.
