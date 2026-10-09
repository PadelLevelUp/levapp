/**
 * settings.explicit-save (PAD-506), made checkable on web: every Settings control (PR 1 and PR 2) under the tab's
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
  "components/evaluations/EvaluationReminderSetting.tsx": /useTabSave\("evaluationReminder"/,
  "components/evaluations/EvaluationScaleSetting.tsx": /useTabSave\("evaluationScale"/,
  // PR 2: Notificações, Calendário, As minhas notificações.
  "components/settings/NotificationsEngineSection.tsx": /useTabSave\("notificationEngine"[\s\S]*useTabSave\("messageTemplates"/,
  "components/settings/SeasonsSection.tsx": /useTabSave\("seasons"/,
  "components/settings/WorkingHoursSection.tsx": /useTabSave\("workingHours"/,
  "components/settings/StudentNotificationBlocksSection.tsx": /useTabSave\("studentNotificationBlocks"/,
  "components/settings/RemindersSection.tsx": /onChange/,
  "components/settings/MessageTemplatesSection.tsx": /onChange/,
};

const SAVE_ON_CHANGE_MACHINERY = /SaveSign|createSerialSaver|SaveLedger|useFlushOnPageHide|pausedSaver|keepalive/;
// A save call written inside a change handler's braces: `onXChange={(v) => { … save( … }`.
const SAVE_IN_CHANGE_HANDLER =
  /on(?:Value|Checked)?Change=\{[^}]*\b(?:updateMe|mutateAsync|addCoachLevel|deleteCoachLevel|updateNotificationConfig|saveSeason|putCoachWorkingHours)\(/;

describe("explicit-save guard (settings.explicit-save, PAD-506)", () => {
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

  it("every tab with a setting has the header Save (rule 1)", () => {
    const page = readFileSync(join(SRC, "pages/SettingsPage.tsx"), "utf8");
    expect(page).toMatch(/TABS_WITH_SAVE: SettingsTab\[\] = \["profile", "preferences", "calendar", "notifications", "myNotifications"\]/);
  });
});
