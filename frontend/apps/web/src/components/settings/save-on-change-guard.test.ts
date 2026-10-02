/**
 * settings.save-on-change rule 1 (PAD-473), made checkable on web: a source file that saves a setting
 * through one of the save-on-change endpoints must show the shared sign (import SaveSign), unless it
 * is listed below with the reason it is not a save-on-change control. And on the engine card, the
 * only save() that names no sign is the reminders sub-panel's (the PAD-478 exception).
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const SAVE_ON_CHANGE_CALL = /updateNotificationConfig\(|updateMe\(|useSaveEvaluationSettings\(|useSaveEvaluationScale\(/;
const SIGN_IMPORT = /from "(?:@\/components\/settings\/SaveSign|\.\/SaveSign)"/;

const NOT_SAVE_ON_CHANGE: Record<string, string> = {
  "api/auth.ts": "defines updateMe",
  "components/settings/MessageTemplatesSection.tsx": "explicit Save (settings.unsaved-edits rule 1)",
  "components/settings/StudentNotificationBlocksSection.tsx": "explicit Save (settings.unsaved-edits rule 1)",
  "pages/VerifyEmailPage.tsx": "not a Settings control",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("save-on-change guard (settings.save-on-change rule 1)", () => {
  const files = sources(SRC).map((path) => ({ rel: relative(SRC, path), text: readFileSync(path, "utf8") }));
  const savers = files.filter((f) => SAVE_ON_CHANGE_CALL.test(f.text));

  it("finds the known save-on-change controls (the scan itself works)", () => {
    expect(savers.map((f) => f.rel)).toEqual(
      expect.arrayContaining([
        "components/evaluations/EvaluationReminderSetting.tsx",
        "components/evaluations/EvaluationScaleSetting.tsx",
        "components/settings/NotificationsEngineSection.tsx",
        "pages/SettingsPage.tsx",
      ]),
    );
  });

  it("every file that saves on change shows the sign, or is listed with its reason", () => {
    const offenders = savers.filter((f) => !NOT_SAVE_ON_CHANGE[f.rel] && !SIGN_IMPORT.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the exception list has no stale entries", () => {
    const stale = Object.keys(NOT_SAVE_ON_CHANGE).filter((rel) => !savers.some((f) => f.rel === rel));
    expect(stale).toEqual([]);
  });

  it("on the engine card, only the reminders sub-panel saves without a sign (PAD-478)", () => {
    const card = files.find((f) => f.rel === "components/settings/NotificationsEngineSection.tsx")!.text;
    const unsigned = [...card.matchAll(/\bsave\(\{[^}]*\}\)/g)].map((m) => m[0]);
    expect(unsigned).toEqual(["save({ reminderTiming })"]);
  });
});
