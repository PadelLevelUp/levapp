/**
 * settings.save-on-change rule 1 (PAD-473), made checkable on iOS: a source file that saves a setting
 * through one of the save-on-change endpoints must show the shared sign (import save-sign), unless it
 * is listed below with the reason it is not a save-on-change control.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const SAVE_ON_CHANGE_CALL = /updateNotificationConfig\(|updateMe\(|useSaveEvaluationSettings\(|useSaveEvaluationScale\(/;
const SIGN_IMPORT = /from "(?:@\/features\/settings\/save-sign|\.\/save-sign)"/;
const SAVE_CALL_SITE = /\b(?:updateMe|updateNotificationConfig|save\.mutateAsync|saveScale|saveSetting|saveLanguage|saveRequestAlerts|saveEngine)\(/g;
const TRACK_KEY = /track\(\s*"([^"]+)"/g;
const ENGINE_SAVE_KEY = /\bsave\(\{[^}]*\},\s*"([^"]+)"\)/g;
const STATUS_KEY = /status\(\s*"([^"]+)"\s*\)/g;

// Calls that are not themselves a save-on-change save, by the exact text they start with.
const UNTRACKED_CALLS: Record<string, string[]> = {};

const NOT_SAVE_ON_CHANGE: Record<string, string> = {
  "app/verify-email.tsx": "not a Settings control",
  "src/features/settings/profile-section.tsx": "explicit Save (settings.explicit-save)",
  // PAD-506 PR 1: held until the screen's one Save (settings.explicit-save); explicit-save-guard.test.ts
  "src/features/settings/preferences-section.tsx": "explicit Save (settings.explicit-save)",
  "src/features/evaluations/evaluation-reminder-setting.tsx": "explicit Save (settings.explicit-save)",
  "src/features/evaluations/evaluation-scale-setting.tsx": "explicit Save (settings.explicit-save)",
  "src/features/settings/student-notification-blocks-section.tsx": "explicit Save (settings.unsaved-edits rule 1)",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("save-on-change guard (settings.save-on-change rule 1)", () => {
  const files = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "app"))].map((path) => ({
    rel: relative(ROOT, path),
    text: readFileSync(path, "utf8"),
  }));
  const savers = files.filter((f) => SAVE_ON_CHANGE_CALL.test(f.text));

  it("finds the known save-on-change controls (the scan itself works)", () => {
    expect(savers.map((f) => f.rel)).toEqual(
      expect.arrayContaining([
        "src/features/evaluations/evaluation-reminder-setting.tsx",
        "src/features/evaluations/evaluation-scale-setting.tsx",
        "src/features/settings/auto-invite-section.tsx",
        "src/features/settings/preferences-section.tsx",
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
        // A call made by a serial saver's `send` (settings.save-on-change rule 3): the saver's own calls are
        // the ones that must sit inside track(), which the line above checks where they are made.
        const inSerialSaver = /createSerialSaver\(\s*[^;]*$/.test(before);
        const allowed = (UNTRACKED_CALLS[f.rel] ?? []).some((c) => f.text.startsWith(c, at));
        if (!inTrack && !inSerialSaver && !allowed) bad.push(`${f.rel}: ${f.text.slice(at, at + 50).split("\n")[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("on the engine card every save names its sign (no reminders sub-panel on iOS)", () => {
    const card = files.find((f) => f.rel === "src/features/settings/auto-invite-section.tsx")!.text;
    expect([...card.matchAll(/\bsave\(\{[^}]*\}\)/g)].map((m) => m[0])).toEqual([]);
  });

});
