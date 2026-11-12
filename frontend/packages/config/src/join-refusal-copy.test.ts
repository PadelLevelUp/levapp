import { describe, expect, it } from "vitest";

import { JOIN_REFUSAL_CODES, joinRefusalKey, joinRefusalOf } from "./join-refusal-copy";
import { localeT } from "./testkit/locale-t";

describe("PAD-920 join refusals (classes.join-requests NJ1–NJ2)", () => {
  it("[CLASSES-JOIN-REQUESTS-37] every refusal code has copy in both locales", () => {
    for (const code of JOIN_REFUSAL_CODES) {
      const key = joinRefusalKey(code);
      expect(key).toBe(`calendar.joinRequest.refusal.${code}`);
      for (const lng of ["pt", "en"] as const) expect(localeT(lng)(key)).not.toBe(key);
    }
    expect(localeT("pt")(joinRefusalKey("side_full"))).toBe("Já não há vaga do teu lado. Podes entrar na lista de espera.");
    expect(localeT("en")(joinRefusalKey("busy_same_hour"))).toBe("You're already in another class at the same time");
    expect(localeT("en")(joinRefusalKey("has_spots"))).toBe("This class still has spots: ask to join.");
    // A code this build does not know never shows its raw key.
    const unknown = joinRefusalKey("something_new");
    for (const lng of ["pt", "en"] as const) expect(localeT(lng)(unknown)).not.toContain("something_new");
  });

  it("reads the refusal body of a 409 and nothing else", () => {
    const side = { response: { status: 409, data: { code: "side_full", requestedSide: "left", openSides: ["right"] } } };
    expect(joinRefusalOf(side)).toEqual({ code: "side_full", requestedSide: "left", openSides: ["right"] });
    expect(joinRefusalOf({ response: { status: 400, data: { code: "side_full" } } })).toBeNull();
    expect(joinRefusalOf(null)).toBeNull();
  });
});
