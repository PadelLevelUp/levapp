import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { guardEnd, parseTypedTime } from "@/lib/time-entry";

/**
 * PAD-559 on iOS (`classes.create` rule 8c): typed entry beside the wheel, the end guard, and the
 * new-class screen wiring the usual length. No render harness on mobile, so the screen's source
 * is read the way the other render tests do.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const read = (p: string) => fs.readFileSync(path.join(MOBILE_ROOT, p), "utf8");

describe("parseTypedTime", () => {
  it.each([["9", "09:00"], ["930", "09:30"], ["9:30", "09:30"], ["9h30", "09:30"], ["21.15", "21:15"], ["2359", "23:59"]])("%s → %s", (i, o) => {
    expect(parseTypedTime(i)).toBe(o);
  });
  it.each(["", "abc", "25", "2460", "9:7"])("%s → null", (i) => {
    expect(parseTypedTime(i)).toBeNull();
  });
});

describe("guardEnd (rule 8c)", () => {
  it("snaps an end at or before the start to the start plus the usual length and says so", () => {
    expect(guardEnd("17:30", "18:00", 90)).toEqual({ value: "19:30", refused: true });
    expect(guardEnd("18:00", "18:00", undefined)).toEqual({ value: "19:00", refused: true });
    expect(guardEnd("23:45", "23:30", 60)).toEqual({ value: "23:45", refused: false });
    expect(guardEnd("23:30", "23:30", 60)).toEqual({ value: "23:59", refused: true });
  });
  it("leaves a start field (no `from`) and a later end alone", () => {
    expect(guardEnd("18:30", undefined, 60)).toEqual({ value: "18:30", refused: false });
    expect(guardEnd("19:00", "18:00", 60)).toEqual({ value: "19:00", refused: false });
  });
});

describe("the picker and the new-class screen carry the rule", () => {
  it("the iOS dialog has the typed entry and commits through the guard", () => {
    const src = read("src/components/ui/time-picker-input.tsx");
    expect(src).toContain("testID={`${testID}-typed`}");
    expect(src).toContain("const parsed = typed.trim() ? parseTypedTime(typed) : null;");
    expect(src).toContain("commit(parsed ?? toTimeString(draft));");
    expect(src).toContain('className="h-12'); // ≥ 44 pt
  });
  it("the new-class screen suggests the end from the usual length and refuses an early end", () => {
    const src = read("app/class/new.tsx");
    expect(src).toContain("usualClassMinutes(dayEvents ?? [])");
    expect(src).toContain("setEndTime(endFromUsualLength(value, usualMinutes))");
    expect(src).toContain("from={startTime}");
    expect(src).toContain("usualMinutes={usualMinutes}");
    expect(src).toContain('endTime: t("classDetail.new.mustBeAfterStart")');
  });
  it("the typed-entry hint resolves in both languages", () => {
    for (const locale of ["pt", "en"]) {
      const ui = JSON.parse(fs.readFileSync(path.resolve(MOBILE_ROOT, `../../src/locales/${locale}/ui.json`), "utf8"));
      expect(typeof ui.ui.timePicker.typeHint).toBe("string");
    }
  });
});
