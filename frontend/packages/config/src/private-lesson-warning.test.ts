import { describe, expect, it } from "vitest";

import { PRIVATE_LESSON_WARNING_KEYS, needsPrivateLessonWarning } from "./private-lesson-warning";
import { localeT } from "./testkit/locale-t";

describe("PAD-929 the private-lesson warning (classes.join-requests rule 22)", () => {
  it("asks on a private lesson's request and waiting-list join, never on an academy class", () => {
    for (const action of ["request", "waitlist"] as const) {
      expect(needsPrivateLessonWarning({ classType: "private", studentRelation: "open_spot" }, action)).toBe(true);
      expect(needsPrivateLessonWarning({ classType: "private", studentRelation: "full" }, action)).toBe(true);
      expect(needsPrivateLessonWarning({ classType: "private" }, action)).toBe(true);
      expect(needsPrivateLessonWarning({ classType: "academy", studentRelation: "open_spot" }, action)).toBe(false);
      expect(needsPrivateLessonWarning({ classType: null }, action)).toBe(false);
      expect(needsPrivateLessonWarning({}, action)).toBe(false);
    }
  });

  it("never asks an invited or gave-up student joining the waiting list, as the server exempts them", () => {
    for (const relation of ["invited", "not_coming"]) {
      expect(needsPrivateLessonWarning({ classType: "private", studentRelation: relation }, "waitlist")).toBe(false);
      // The exemption is the waiting list's only: a request still asks.
      expect(needsPrivateLessonWarning({ classType: "private", studentRelation: relation }, "request")).toBe(true);
    }
  });

  it("has the ticket's pt copy and the en copy, one key per string", () => {
    const pt = localeT("pt");
    const en = localeT("en");
    expect(pt(PRIVATE_LESSON_WARNING_KEYS.body)).toBe(
      "Esta é uma aula privada. Pode ter preços e condições diferentes mediante o que foi definido pelo teu professor e clube. Tens a certeza que pretendes avançar?",
    );
    expect(en(PRIVATE_LESSON_WARNING_KEYS.body)).toBe(
      "This is a private class. Its prices and conditions may differ, as set by your coach and club. Are you sure you want to go ahead?",
    );
    expect([pt(PRIVATE_LESSON_WARNING_KEYS.yes), pt(PRIVATE_LESSON_WARNING_KEYS.no)]).toEqual(["SIM", "NÃO"]);
    expect([en(PRIVATE_LESSON_WARNING_KEYS.yes), en(PRIVATE_LESSON_WARNING_KEYS.no)]).toEqual(["YES", "NO"]);
  });
});
