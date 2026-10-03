/**
 * settings.explicit-save (PAD-506), made checkable on iOS: the controls PR 1 brought under the screen's
 * one "Guardar alterações" register their part of it, none saves from a change handler or keeps the
 * save-on-change machinery, and the screen has the footer Save and the back/swipe guard (rule 5).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

const HELD: Record<string, RegExp> = {
  "src/features/settings/profile-section.tsx": /useSectionSave\("profile"/,
  "src/features/settings/preferences-section.tsx": /useSectionSave\("preferences"/,
  "src/features/settings/coach-levels-section.tsx": /useSectionSave\("coachLevels"/,
  "src/features/settings/admin-section.tsx": /useSectionSave\(\s*"adminSettings"/,
  "src/features/evaluations/evaluation-reminder-setting.tsx": /useSectionSave\("evaluationReminder"/,
  "src/features/evaluations/evaluation-scale-setting.tsx": /useSectionSave\("evaluationScale"/,
};

const SAVE_ON_CHANGE_MACHINERY = /save-sign|createSerialSaver|SaveLedger|useFlushOnBackground/;
const SAVE_IN_CHANGE_HANDLER =
  /on(?:ValueChange|CheckedChange|ChangeText|Press)=\{[^}]*\b(?:updateMe|mutateAsync|updateAdminSettings|addCoachLevel|deleteCoachLevel)\(/;

describe("explicit-save guard (settings.explicit-save, PAD-506 PR 1)", () => {
  const files = Object.keys(HELD).map((rel) => ({ rel, text: readFileSync(join(ROOT, rel), "utf8") }));

  it("every held control registers its part of the one Save", () => {
    expect(files.filter((f) => !HELD[f.rel].test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("no held control keeps the save-on-change machinery", () => {
    expect(files.filter((f) => SAVE_ON_CHANGE_MACHINERY.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("no held control saves from a change handler", () => {
    expect(files.filter((f) => SAVE_IN_CHANGE_HANDLER.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("the screen has the one Save per section and asks on back and swipe (rules 3, 5)", () => {
    const screen = readFileSync(join(ROOT, "app/settings.tsx"), "utf8");
    expect(screen).toMatch(/testID=\{`settings-\$\{activeSection\.id\}-save`\}/);
    expect(screen).toMatch(/usePreventRemove\(hasUnsaved/);
  });
});
