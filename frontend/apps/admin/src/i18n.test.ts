import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import pt from "./locales/pt.json";
import { detectLanguage } from "./i18n";

function paths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? paths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("console i18n (admin.foundation rule 16)", () => {
  it("pt and en carry the same keys", () => {
    expect(paths(en).sort()).toEqual(paths(pt).sort());
  });

  it("every key lives under the console-only `admin` namespace", () => {
    expect(Object.keys(pt)).toEqual(["admin"]);
    expect(Object.keys(en)).toEqual(["admin"]);
  });

  it("the browser language picks en, anything else falls back to pt", () => {
    expect(detectLanguage("en-GB")).toBe("en");
    expect(detectLanguage("pt-PT")).toBe("pt");
    expect(detectLanguage("fr")).toBe("pt");
    expect(detectLanguage(undefined)).toBe("pt");
  });
});
