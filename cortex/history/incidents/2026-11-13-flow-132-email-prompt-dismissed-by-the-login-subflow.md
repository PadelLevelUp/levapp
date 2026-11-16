---
about: "Android lane: flow 132 lost the add-email banner because the login subflow tapped Not Now for iOS Save Password and hit the app Agora nao (harness, fixed #986)"
permanence: stable
verified: "2026-11-15 (observed)"
origin:
  - session:59287fd5-5f60-420e-a294-aac083814775
  - commit:b6d320ae6
need:
  - frontend/apps/mobile/app/(tabs)/dashboard.tsx
  - frontend/apps/mobile/src/features/dashboard/email-prompt-banner.tsx
  - frontend/packages/config/src/email-prompt.ts
  - backend/padel_app/helpers/dashboard/coach_home.py
aliases:
  - B-728
  - B-728-email-prompt-banner-missing-on-staging-coach-home
  - 2026-11-13-flow-132-email-prompt-dismissed-by-the-login-subflow
---

# B-728: the add-email banner was dismissed by the login subflow, not missing (harness, fixed by #986)

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

**Correction (2026-11-15, #986):** not a product bug. The login subflow carried `tapOn text: "Not Now|Agora não"`
for iOS's "Save Password?" sheet; on Android that text matched the app's own "Agora não" on the coach home and
dismissed the email prompt for the session (`emailPromptSession`, in memory), so flow 132 found no banner.
`main` never had that subflow line, which is why 132 was green there and red on every staging-based run. Fixed
in #986 (merged 2026-11-15 21:40Z) with a dedicated `subflows/dismiss-save-password.yaml`; on `main` cbdb96cf7.
The static diff of app code above was right (nothing product-side changed); what it did not cover was the
flow's own predecessor steps. **Lesson:** before calling a lane red a product regression, diff the flow's
subflows and predecessors between the two refs as well as the app code.

**Status:** resolved by #986. Expected: flow 132 green in the first nightly on cbdb96cf7; a red there is new.
