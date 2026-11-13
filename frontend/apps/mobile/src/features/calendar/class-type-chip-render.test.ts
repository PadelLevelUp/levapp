import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-925 (classes.detail-visibility rule 6), the phone's half: the class screen shows the
 * "Particular" / "Academia" chip beside the title. Source-reading, like class-side-sheet-render:
 * app/class/[id].tsx mounts react-query hooks, and a test file under app/ would break Metro. */
const root = resolve(__dirname, "../../..");
const SCREEN = readFileSync(resolve(root, "app/class/[id].tsx"), "utf8");
const locale = (lang: string) =>
  JSON.parse(readFileSync(resolve(root, `../../src/locales/${lang}/calendar.json`), "utf8")).calendar.detail;

describe("the class type chip", () => {
  it("[CLASSES-DETAIL-VISIBILITY-6] sits beside the title, from the loaded class or the event, off while editing", () => {
    expect(SCREEN).toContain("classTypeChipKey(active?.classType ?? event.classType)");
    expect(SCREEN).toMatch(/chipKey && !isEditing/);
    expect(SCREEN).toContain('testID="class-type-chip"');
    expect(SCREEN).toContain("t(chipKey)");
  });

  it("[CLASSES-DETAIL-VISIBILITY-6] has pt and en words for both types", () => {
    expect(locale("pt")).toMatchObject({ typePrivate: "Particular", typeAcademy: "Academia" });
    expect(locale("en")).toMatchObject({ typePrivate: "Private", typeAcademy: "Academy" });
  });
});
