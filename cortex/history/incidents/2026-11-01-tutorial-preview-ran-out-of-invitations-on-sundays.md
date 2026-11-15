---
about: "The tutorials E2E spec previewed the seed's next-Monday class, which the released scheduler really invites for on a Sunday; once maxTotal was used up the…"
permanence: stable
verified: "2026-11-01 (observed)"
origin:
  - migrated:compass/bugs/B-721-tutorial-preview-ran-out-of-invitations-on-sundays.md@ef7a5f3
need:
  - frontend/apps/web/e2e/settings/tutorials-understand-invites.spec.ts
aliases:
  - B-721
  - B-721-tutorial-preview-ran-out-of-invitations-on-sundays
---

# B-721: the tutorial preview ran out of invitations on Sundays

**Source:** Linear PAD-812, found by the promotion 31 Playwright gate on Sunday 2026-11-01 (shard 4: 1
failed, 164 passed on 953b5cc39). The same pairing was red on main 475420d9d, so the defect was
pre-existing.

**What happens:** `tutorials-understand-invites.spec.ts` US-196-02 expects a first batch of 3 in the
first non-empty round and gets 0. The preview reports `max_total_reached` ("10 invitations were
already sent for this class (limit 10)").

**What should happen:** the rehearsal shows the first batch the engine would send, on any day of the
week.

**Root cause:** the spec previewed the seed's "E2E Academy Class", which is next Monday at 10:00. On a
Sunday that class is less than 24 h away, inside the invitation window. Once global-setup releases the
scheduler, the real engine invites for the seeded vacancies: 1 invitation at +21 s and 9 at +51 s,
reaching the default `maxTotal` of 10. From then on the preview gates `max_total_reached`. No test action
triggers the sends. `notification-engine-settings.spec` only made the failure appear, because it lasts
about 70 s and so delays US-196-02 past the second batch. On a Wednesday the class is 5 days out and the
engine sends nothing. The spec and the engine are right; the test depended on the weekday through the
seed. Same root as PAD-811 (B-720), a different symptom.

**Evidence:** clocks pinned on staging 3c9618236 (backend and seed with `time-machine` through a scratch
`sitecustomize`, browser with `page.clock.setSystemTime`; neither committed), isolated E2E DB, chromium,
one worker, reseeded under the pin, 2026-11-02:

| Pin | Run | Before the fix | After |
|---|---|---|---|
| Sunday 2026-11-08 10:00Z | engine-settings + tutorials | 1 failed, 32 passed (twice) | 33 passed |
| Sunday | tutorials alone | 5 passed | 5 passed |
| Wednesday 2026-11-04 10:00Z | engine-settings + tutorials | 33 passed | 33 passed |
| Wednesday | tutorials alone | 5 passed | 5 passed |
| none (Monday 2026-11-02) | tutorials alone | — | 5 passed |

`notification_events` for instance 1 after the red Sunday run: 1 sent at 10:00:30 and 9 at 10:01:00.
The fixed Sunday pair still shows the engine's rounds for the seeded vacancies (8 log lines), and they
no longer touch the previewed class.

**Affected specs:**
- Dev: `.specflow/specs/settings/tutorials.spec.md` (unchanged; the test was wrong)
- Business: none

### Change Plan
1. In the spec's `beforeAll`, create through `POST /app/add_class` a B1 class 10 days out with
   `E2E Student` enrolled, and pick it by its unique title in every test.
2. Remove it in `afterAll` with `POST /app/remove_class`.
3. Verify the pair on Sunday and Wednesday pins, and the spec alone on both pins and unpinned.

### Resolution
- Spec changes: none.
- Tests modified: `frontend/apps/web/e2e/settings/tutorials-understand-invites.spec.ts`.
- Code changes: none.
- Resolved: 2026-11-02 (PAD-812).

<!-- 3.x fields of compass/bugs/B-721-tutorial-preview-ran-out-of-invitations-on-sundays.md, carried verbatim by cortex migrate -->
```yaml
type: test-defect
severity: low
status: resolved
affects:
  - settings.tutorials
  - frontend/apps/web/e2e/settings/tutorials-understand-invites.spec.ts
proposed_fix: "The spec previews a B1 class it creates through the API 10 days out with E2E Student enrolled, and removes it afterwards; it no longer depends on the weekday or on the seed's Academy Class."
resolved: "2026-11-02"
```
