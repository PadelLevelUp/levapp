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

  it("[CLASSES-DETAIL-VISIBILITY-6] hugs the title, centred, with a right gutter, not at the screen edge", () => {
    // The title used to be `flex-1`, which pushed the chip to the far right of the header row.
    expect(SCREEN).toMatch(/className="shrink text-lg font-bold"\s+numberOfLines=\{1\}/);
    expect(SCREEN).not.toMatch(/className="flex-1 text-lg font-bold"/);
    expect(SCREEN).toMatch(/testID="class-type-chip" className="self-center"/);
    expect(SCREEN).toContain('className="flex-row items-center gap-2 border-b border-border py-2 pl-2 pr-4"');
  });

  it("[CLASSES-DETAIL-VISIBILITY-6] has pt and en words for both types", () => {
    expect(locale("pt")).toMatchObject({ typePrivate: "Particular", typeAcademy: "Academia" });
    expect(locale("en")).toMatchObject({ typePrivate: "Private", typeAcademy: "Academy" });
  });
});
