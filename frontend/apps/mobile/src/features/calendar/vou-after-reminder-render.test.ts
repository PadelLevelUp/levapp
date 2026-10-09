import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reminderAnswerOutcome, studentRowAction } from "@levelup/config";

/**
 * PAD-570 on iOS (`attendance.confirm` rules 27-28, `dashboard.blocks` rule 3a).
 *
 * No render harness on mobile, so this reads the screens' own source the way
 * `attendance-state-render.test.ts` does, and pins what would regress: "Vou" is
 * gated on the SERVER's `pendingConfirmation` through the shared gate and never on
 * a date; the PAD-315 come-back is gone; the dashboard renders by the shared
 * `studentRowAction`; and every key the mapper can now return resolves in both
 * languages (the mobile i18n static-import trap).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const SCREEN = path.join(MOBILE_ROOT, "app/class/[id].tsx");
const DASHBOARD = path.join(MOBILE_ROOT, "src/features/dashboard/blocks.tsx");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

const read = (p: string) => fs.readFileSync(p, "utf8");

type Dict = Record<string, unknown>;
function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && tv && typeof sv === "object" && typeof tv === "object" && !Array.isArray(sv)) {
      deepMerge(tv as Dict, sv as Dict);
    } else target[key] = sv;
  }
  return target;
}
function tree(locale: string): Dict {
  const dir = path.join(LOCALES, locale);
  const merged: Dict = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    deepMerge(merged, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Dict);
  }
  return merged;
}
function resolve(t: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((n, part) => (n && typeof n === "object" ? (n as Dict)[part] : undefined), t);
}

describe("the class screen offers 'Vou' only on the server's flag (rule 27)", () => {
  const src = read(SCREEN);
  it("gates it through the shared gate with the payload's pendingConfirmation", () => {
    expect(src).toContain("canConfirmAttendance({");
    expect(src).toContain("pendingConfirmation: instance?.pendingConfirmation");
    expect(src).toContain('testID="class-confirm-attendance"');
  });
  it("never recomputes the reminder instant itself", () => {
    expect(src).not.toMatch(/proactiveDeclineDeadline[^\n]*(<|>|>=|<=)/);
    expect(src).not.toContain("hours_before");
  });
  it("has no way back after 'Não vou' (rule 28): the hint and the chat shortcut instead", () => {
    expect(src).not.toContain("canComeBack");
    expect(src).not.toContain("class-come-back");
    expect(src).toContain('testID="class-declined-hint"');
    expect(src).toContain('testID="class-chat-coach"');
    expect(src).toContain("calendar.detail.declinedFinalHint");
  });
});

describe("the dashboard renders by the shared row action (dashboard.blocks rule 3a)", () => {
  const src = read(DASHBOARD);
  it("hero and rows decide through studentRowAction, not through invited/confirmed", () => {
    expect(src.match(/studentRowAction\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/row\.pendingConfirmation === true && typeof row\.lessonInstanceId/);
  });
  it("offers one decline behind a dialog, and the hint after a no", () => {
    expect(src).toContain('testID="dashboard-decline-open"');
    expect(src).toContain('testID="dashboard-decline-confirm"');
    expect(src).toContain('testID="dashboard-declined-hint"');
  });
  it("the coach's hero never carries a student action", () => {
    expect(src).toContain('const heroAction = student ? studentRowAction(d) : "none"');
  });
});

describe("every key the mapper and the rows can show resolves in both languages", () => {
  const keys = [
    ...["not_yet_asked", "already_declined", "already_marked", "spot_filled", "expired", "bogus"]
      .map((a) => reminderAnswerOutcome({ action: a }).messageKey)
      .filter((k): k is string => typeof k === "string"),
    "calendar.detail.confirmAttendance",
    "calendar.detail.confirmAttendanceDone",
    "calendar.detail.declinedFinalChat",
    "dashboard.answer.notGoing",
    "dashboard.answer.notGoingTitle",
    "dashboard.answer.notGoingBody",
    "dashboard.answer.notGoingConfirm",
    "dashboard.answer.notGoingKeep",
    "dashboard.answer.notGoingDone",
    "dashboard.answer.notGoingFailed",
  ];
  it.each(["pt", "en"])("%s", (locale) => {
    const t = tree(locale);
    for (const key of keys) expect(typeof resolve(t, key), key).toBe("string");
  });
  it("the retired come-back strings are gone from both languages", () => {
    for (const locale of ["pt", "en"]) {
      const t = tree(locale);
      for (const key of ["calendar.detail.comeBack", "calendar.detail.comeBackHint", "calendar.detail.comeBackDone"]) {
        expect(resolve(t, key), `${locale}:${key}`).toBeUndefined();
      }
    }
  });
  it("a settled state beats a stale flag in the shared row action", () => {
    expect(studentRowAction({ pendingConfirmation: true, attendanceState: "not_coming" })).toBe("declined");
  });
});
