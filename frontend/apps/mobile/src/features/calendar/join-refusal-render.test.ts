/**
 * PAD-920 (classes.join-requests NJ1–NJ2), the iOS half: every refusal code of a join request or a
 * waiting-list join resolves, through the phone's own i18n bundle (the static imports of
 * src/lib/i18n.ts), to a real line in both languages, and the phone's refusal sites read it through
 * the shared helper, never a key built by hand.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JOIN_REFUSAL_CODES, joinRefusalKey } from "@levelup/config";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import i18n from "@/lib/i18n";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("join refusal copy on iOS", () => {
  it("[CLASSES-JOIN-REQUESTS-37] every refusal code has copy in both locales", () => {
    for (const lng of ["pt", "en"] as const) {
      for (const code of [...JOIN_REFUSAL_CODES, "a_code_from_a_newer_server"]) {
        const key = joinRefusalKey(code);
        const line = i18n.t(key, { lng });
        expect(line, `${lng} ${code}`).toBeTypeOf("string");
        expect(line.length, `${lng} ${code}`).toBeGreaterThan(0);
        expect(line, `${lng} ${code}`).not.toBe(key);
        expect(line, `${lng} ${code}`).not.toContain("calendar.joinRequest");
      }
    }
    // The class screen and the academy step read the code through the shared helper.
    const screen = read("app/class/[id].tsx");
    expect(screen).toContain("joinRefusalOf(err)");
    expect(screen).toContain("joinRefusalKey(refusal");
    expect(screen).not.toContain("calendar.joinRequest.refusal.${");
    const academy = read("src/features/class-requests/wizard/AcademyClassStep.tsx");
    expect(academy).toContain("joinRefusalOf(err)");
    expect(academy).toContain("t(joinRefusalKey(code))");
    expect(academy).toContain('t("classRequests.academy.nowOpen")');
  });
});
