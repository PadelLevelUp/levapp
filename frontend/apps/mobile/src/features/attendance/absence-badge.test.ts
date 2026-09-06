import { describe, expect, it } from "vitest";

import { absenceBadge } from "./absence-badge";

/**
 * PAD-163. Pins the justified/unjustified → badge mapping the "Faltas" screen
 * renders per row, so a future change to the variant or label key fails a
 * fast unit test rather than only showing up as a colour regression in a
 * Maestro screenshot.
 */
describe("absenceBadge", () => {
  it("returns null when the session has no justification", () => {
    expect(absenceBadge(null)).toBeNull();
    expect(absenceBadge(undefined)).toBeNull();
  });

  it("maps a justified absence to the secondary (muted) badge", () => {
    expect(absenceBadge("justified")).toEqual({
      justification: "justified",
      labelKey: "absences.justified",
      variant: "secondary",
    });
  });

  it("maps an unjustified absence to the destructive badge", () => {
    expect(absenceBadge("unjustified")).toEqual({
      justification: "unjustified",
      labelKey: "absences.unjustified",
      variant: "destructive",
    });
  });
});
