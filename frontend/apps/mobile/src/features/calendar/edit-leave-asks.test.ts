import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-525 (classes.edit rule 10; B-341) on iOS: leaving the class screen with an unsaved
 * draft asks "Descartar alterações?" first, and arriving at another class ends edit mode.
 *
 * No render harness on mobile (the screen mounts react-query hooks the unit harness cannot),
 * so this reads the screen's source the way `come-back-render.test.ts` does and pins the
 * wiring that would regress: the gate is the save's own comparison, every way out is held
 * while unsaved, the three controls carry the shared test ids, and the copy exists in both
 * languages. Maestro flow 179 drives the real screen.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const SCREEN = fs.readFileSync(path.join(MOBILE_ROOT, "app/class/[id].tsx"), "utf8");
const WEB_SHEET = fs.readFileSync(
  path.resolve(MOBILE_ROOT, "../web/src/components/calendar/ClassDetailSheet.tsx"),
  "utf8"
);
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

describe("leaving the class screen with an unsaved edit asks (classes.edit rule 10)", () => {
  it("gates on the save's own comparison, never on 'was touched'", () => {
    expect(SCREEN).toMatch(/const hasUnsavedEdit = isEditing && draft !== null && instance != null && hasClassEditChanges\(instance, draft\)/);
  });

  it("holds every way out while unsaved: the screen's back button, swipe-back, any other removal", () => {
    expect(SCREEN).toMatch(/usePreventRemove\(hasUnsavedEdit,/);
    expect(SCREEN).toMatch(/<Stack\.Screen options=\{\{ gestureEnabled: !hasUnsavedEdit \}\} \/>/);
    expect(SCREEN).toMatch(/testID="class-detail-back"[\s\S]{0,200}onPress=\{requestBack\}/);
  });

  it("ends edit mode when another class arrives on the screen", () => {
    expect(SCREEN).toMatch(/setIsEditing\(false\);\s*setDraft\(null\);\s*setDiscardAskOpen\(false\);\s*\}, \[event\?\.id\]\);/);
  });

  it("offers Discard and Keep editing under the shared test ids, on both shells", () => {
    for (const source of [SCREEN, WEB_SHEET]) {
      expect(source).toMatch(/"class-unsaved-dialog"/);
      expect(source).toMatch(/"class-unsaved-keep"/);
      expect(source).toMatch(/"class-unsaved-discard"/);
      // No Save in the question (rule 10): a save has its own sequence.
      expect(source).not.toMatch(/class-unsaved-save/);
    }
  });

  it("has the copy in both languages", () => {
    for (const lng of ["pt", "en"]) {
      const dict = JSON.parse(fs.readFileSync(path.join(LOCALES, lng, "classDetail.json"), "utf8")) as {
        classDetail: { unsavedChanges?: Record<string, string> };
      };
      const copy = dict.classDetail.unsavedChanges;
      expect(copy, lng).toBeDefined();
      for (const key of ["title", "body", "discard", "keepEditing"]) {
        expect(copy?.[key], `${lng}.${key}`).toBeTruthy();
      }
    }
  });
});
