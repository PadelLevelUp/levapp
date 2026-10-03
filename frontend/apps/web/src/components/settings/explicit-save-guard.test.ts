/**
 * settings.explicit-save (PAD-506), made checkable on web: the controls PR 1 brought under the tab's
 * one "Guardar alterações" register their part of it, and none of them saves from a change handler
 * or keeps the save-on-change machinery (the sign, the serial saver, the page-hide flush).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

// Each held file, and how it registers its part of the tab's Save.
const HELD: Record<string, RegExp> = {
  "pages/SettingsPage.tsx": /savers\.current\.set\("preferences"/,
  "components/settings/CoachLevelsSection.tsx": /useTabSave\("coachLevels"/,
  "components/settings/AdminSection.tsx": /useTabSave\("adminSettings"/,
  "components/evaluations/EvaluationReminderSetting.tsx": /useTabSave\("evaluationReminder"/,
  "components/evaluations/EvaluationScaleSetting.tsx": /useTabSave\("evaluationScale"/,
};

const SAVE_ON_CHANGE_MACHINERY = /SaveSign|createSerialSaver|SaveLedger|useFlushOnPageHide/;
// A save call written inside a change handler's braces: `onXChange={(v) => { … save( … }`.
const SAVE_IN_CHANGE_HANDLER =
  /on(?:Value|Checked)?Change=\{[^}]*\b(?:updateMe|mutateAsync|updateAdminSettings|addCoachLevel|deleteCoachLevel)\(/;

describe("explicit-save guard (settings.explicit-save, PAD-506 PR 1)", () => {
  const files = Object.keys(HELD).map((rel) => ({ rel, text: readFileSync(join(SRC, rel), "utf8") }));

  it("every held control registers its part of the tab's one Save", () => {
    expect(files.filter((f) => !HELD[f.rel].test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("no held control keeps the save-on-change machinery", () => {
    expect(files.filter((f) => SAVE_ON_CHANGE_MACHINERY.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("no held control saves from a change handler", () => {
    expect(files.filter((f) => SAVE_IN_CHANGE_HANDLER.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
});
