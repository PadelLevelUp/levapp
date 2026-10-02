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
const SAVE_CALL_SITE = /\b(?:updateMe|updateNotificationConfig|save\.mutateAsync)\(/g;
const TRACK_KEY = /track\(\s*"([^"]+)"/g;
const ENGINE_SAVE_KEY = /\bsave\(\{[^}]*\},\s*"([^"]+)"\)/g;
const STATUS_KEY = /status\(\s*"([^"]+)"\s*\)/g;

// Calls that are not themselves a save-on-change save, by the exact text they start with.
const UNTRACKED_CALLS: Record<string, string[]> = {
  // the explicit Perfil Save (settings.save-on-change rule 4)
  "pages/SettingsPage.tsx": ["updateMe(payload)"],
  // the card's one save(): the request is tracked under the caller's key on the next line; the
  // engine check below pins every caller's key
  "components/settings/NotificationsEngineSection.tsx": ["updateNotificationConfig(patch)"],
};

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

  it("every sign key a file saves under is shown on screen, and every shown key is saved under (review #497 item 6)", () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => SIGN_IMPORT.test(x.text))) {
      const saved = new Set([...f.text.matchAll(TRACK_KEY)].map((m) => m[1]).concat([...f.text.matchAll(ENGINE_SAVE_KEY)].map((m) => m[1])));
      const shown = new Set([...f.text.matchAll(STATUS_KEY)].map((m) => m[1]));
      for (const k of saved) if (!shown.has(k)) bad.push(`${f.rel}: saves under "${k}" but shows no sign for it`);
      for (const k of shown) if (!saved.has(k)) bad.push(`${f.rel}: shows a sign for "${k}" that no save feeds`);
    }
    expect(bad).toEqual([]);
  });

  it("every save-on-change call is made through the sign (track), or is listed with its reason", () => {
    const bad: string[] = [];
    for (const f of savers.filter((x) => !NOT_SAVE_ON_CHANGE[x.rel])) {
      for (const m of f.text.matchAll(SAVE_CALL_SITE)) {
        const at = m.index ?? 0;
        const before = f.text.slice(Math.max(0, at - 160), at);
        const inTrack = /track\(\s*[^;]*$/.test(before) && !/\)\s*;\s*$/.test(before);
        const allowed = (UNTRACKED_CALLS[f.rel] ?? []).some((c) => f.text.startsWith(c, at));
        if (!inTrack && !allowed) bad.push(`${f.rel}: ${f.text.slice(at, at + 50).split("\n")[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
