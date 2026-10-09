import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-567 on iOS (`attendance.validation` rule 26). No render harness on mobile, so this
 * reads the screens' own source and pins what would regress: the selected state pressed
 * again clears the row (both editors), the save sends `clear: true` through the shared
 * `clearsFor`, the over-capacity dialog exists, and its strings resolve in both languages.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const read = (p: string) => fs.readFileSync(path.join(MOBILE_ROOT, p), "utf8");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

type Dict = Record<string, unknown>;
function resolve(t: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((n, part) => (n && typeof n === "object" ? (n as Dict)[part] : undefined), t);
}

describe("the class detail clears on a second press and saves it (rule 26)", () => {
  it("ParticipantRow reports status null when the selected state is pressed again", () => {
    const src = read("src/features/calendar/ParticipantRow.tsx");
    expect(src).toContain("if (attendance.status === status) {");
    expect(src).toContain("onChange?.({ status: null, justification: undefined });");
  });
  it("the save sends the cleared rows through the shared helper and warns over capacity", () => {
    const src = read("app/class/[id].tsx");
    expect(src).toContain("clearsFor(serverRows, attendance)");
    expect(src).toContain("payload.push({ playerId, clear: true })");
    expect(src).toContain('testID="attendance-clear-over-capacity-confirm"');
    expect(src).toContain("clearsFor(instance?.presences ?? [], attendance).length > 0");
  });
});

describe("the validate view toggles too", () => {
  it("PresenceMarkToggle reports null for the active option", () => {
    const src = read("src/features/presences/PresenceMarkToggle.tsx");
    expect(src).toContain("onChange(active ? null : option)");
  });
});

describe("the dialog's strings resolve in both languages", () => {
  it.each(["pt", "en"])("%s", (locale) => {
    const t = JSON.parse(fs.readFileSync(path.join(LOCALES, locale, "calendar.json"), "utf8")) as Dict;
    for (const key of [
      "calendar.detail.clearOverCapacityTitle",
      "calendar.detail.clearOverCapacityBody",
      "calendar.detail.clearOverCapacityConfirm",
      "calendar.detail.clearOverCapacityKeep",
    ]) {
      expect(typeof resolve(t, key), key).toBe("string");
    }
  });
});
