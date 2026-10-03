---
id: B-282
title: "E2E: the engine's master toggle was found by English text plus an ancestor xpath, and a wrapper around the label broke it"
type: test-defect
severity: high
status: resolved
affects:
  - frontend/apps/web/e2e/settings/notification-engine-settings.spec.ts
  - frontend/apps/web/e2e/notification-engine/cancellation-deadline.spec.ts
proposed_fix: "Both helpers find the switch by its test id (notification-engine-auto-notify-toggle). Test-only."
opened: 2026-10-02T18:30:00Z
resolved: 2026-10-02T18:51:16Z
---

# B-282: a text-plus-xpath locator broken by a wrapper

**Source:** the release gate on frozen staging de0a25482, 2026-10-02. Two tests of `e2e/settings/notification-engine-settings.spec.ts` failed, alone and at low load: `:102` "US-53: master auto-notify toggle is present and interactive" (`expect(toggle).toBeVisible()`, element not found) and `:441` "sections requiring auto-notify are locked when toggle is off" (timed out reading the toggle's `data-state`). They blocked the production promotion.

**What happens:** the helper `autoNotifySwitch` was
`getByText(/^automatic notifications$/i).locator("xpath=ancestor::div[contains(@class, 'flex')][1]").locator('[role="switch"]').first()`.
It climbs from the label's English text to the nearest ancestor `div` whose class contains "flex" and looks for a switch inside it.

**Root cause:** commit e5340baf3 (PAD-473, PR #497) put the label and its new save sign inside `<div className="flex items-center gap-2">`. That wrapper became the nearest "flex" ancestor, and the switch is its sibling's sibling, not inside it. The product is intact: the switch is where it was, with `data-testid="notification-engine-auto-notify-toggle"` (NotificationsEngineSection.tsx:220).

**Evidence (isolated stack, product code exactly de0a25482, Chromium):**
- Before: the spec file gives 2 failed, 25 passed; the two failures are `:102` and `:441`, as in the gate.
- After (only the two spec files changed): both files in one run, 29 passed; 27 and 2.
- `git log -S"notification-engine-auto-notify-sign"` names e5340baf3 as the commit that added the wrapper.

**Why only two tests failed:** they are the two that call the helper directly. The others reach the toggle only through `enableAutoNotify`, which reads it only when a section is disabled, and the seed has auto-notify on. The same helper was copied into `cancellation-deadline.spec.ts`, where it would have failed the same way had it been reached.

**Which guard should have caught it, and did not:**
- Playwright does not run in pull-request CI, so #497 merged without this spec running against it. The release gate is where it surfaced.
- The rendered-text ratchet (PAD-320) did not flag the locator: its English text is still on the page, so the text matcher still "works"; what broke is the structural step after it.
- Is a rule "no `xpath=ancestor` locators in e2e" worth a guard? Probably yes, as a ratchet: five spec files still hold seven such locators after this fix, each one a structural assumption about wrappers that any layout change can break silently. Not written here.

### Resolution
- Tests: both helpers return `page.getByTestId("notification-engine-auto-notify-toggle")`.
- Code: none. Spec: none.
