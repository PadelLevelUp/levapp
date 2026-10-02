---
id: B-251
title: "Maestro flow 95 drove the evaluation-categories editor that PAD-373 removed from Settings"
type: test-defect
severity: low
status: resolved
affects:
  - settings.unsaved-edits
  - frontend/apps/mobile/.maestro/flows/95-settings-language-change-keeps-edits.yaml
proposed_fix: "Re-point flow 95 at the coach-levels editor, an explicit-save section still in the same Preferences pane."
opened: 2026-10-02T10:22:44Z
resolved: 2026-10-02T10:32:14Z
---

# B-251: flow 95 scrolled to a testid that no longer exists

**Source:** PAD-473 PR 2 (#497), a re-run of flow 95 on the simulator, 2026-10-02 10:22:44Z.

**What happens:** `95-settings-language-change-keeps-edits` fails at its first step after login,
`scrollUntilVisible settings-evaluation-categories-add`. That testid exists in no app source on staging:
`git grep` finds it only in the flow itself. PAD-373 (`1a113e541`, 2026-09-21, "the Settings category
editors are gone") removed the editor; the flow was not updated. That removal skipped the testid grep
(memory `removing-a-testid-obliges-a-grep`). So the Maestro proof of "a change of language never undoes
an unsaved edit" (B-155) has not been able to pass since then.

**What should happen:** the flow proves the same property against an explicit-save editor that still
sits beside the language selector.

**Root cause:** the spec (`settings.unsaved-edits`, B-155's criterion) is right, and the test points at a
removed surface. Type 7, test defect.

### Change Plan
- Flow 95 drives the coach-levels editor: add a level, type its label, do not save, switch the language
  to pt and back to en, and assert the typed row survives, the language is en, and the level count is
  unchanged. The level inputs gain testids `level-code-<i>` / `level-label-<i>`.
- Red on the old text (the 10:22Z run above), green on the new text.

### Resolution
- Flow 95 re-pointed at coach levels; `coach-levels-section.tsx` level inputs carry `level-code-<i>` /
  `level-label-<i>`.
- Red on the old text: 10:22:44Z (`scrollUntilVisible settings-evaluation-categories-add` FAILED). Green on
  the new text: 10:32:14Z, iPhone 17 Pro simulator, Metro from `feature/pad-473`.
- Resolved: 2026-10-02 (#497).
