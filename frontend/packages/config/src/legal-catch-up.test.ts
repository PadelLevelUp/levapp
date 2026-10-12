import { describe, expect, it } from "vitest";
import { legalCatchUpParts, needsLegalCatchUp } from "./legal-catch-up";

/** PAD-637 (auth.legal-catch-up rules 1, 2, 4): the next-login screen opens when something is
 * pending and the user has not skipped it this session; it shows only the missing parts. */
describe("needsLegalCatchUp", () => {
  it("opens when the Terms or the birth date is pending", () => {
    expect(needsLegalCatchUp({ legalPending: { terms: true, birthDate: false } }, false)).toBe(true);
    expect(needsLegalCatchUp({ legalPending: { terms: false, birthDate: true } }, false)).toBe(true);
  });

  it("stays closed when nothing is pending", () => {
    expect(needsLegalCatchUp({ legalPending: { terms: false, birthDate: false } }, false)).toBe(false);
  });

  it("stays closed for a server that predates the field", () => {
    expect(needsLegalCatchUp({}, false)).toBe(false);
    expect(needsLegalCatchUp(null, false)).toBe(false);
  });

  it("stays closed after a skip this session", () => {
    expect(needsLegalCatchUp({ legalPending: { terms: true, birthDate: true } }, true)).toBe(false);
  });
});

describe("legalCatchUpParts", () => {
  it("lists only the missing parts", () => {
    expect(legalCatchUpParts({ legalPending: { terms: true, birthDate: false } })).toEqual({ terms: true, birthDate: false });
    expect(legalCatchUpParts({})).toEqual({ terms: false, birthDate: false });
  });
});

describe("legalCatchUpSession", () => {
  it("remembers a skip for that user until reset", async () => {
    const { legalCatchUpSession } = await import("./legal-catch-up");
    legalCatchUpSession.reset();
    expect(legalCatchUpSession.isSkipped(7)).toBe(false);
    legalCatchUpSession.skip(7);
    expect(legalCatchUpSession.isSkipped(7)).toBe(true);
    expect(legalCatchUpSession.isSkipped(8)).toBe(false);
    legalCatchUpSession.reset();
    expect(legalCatchUpSession.isSkipped(7)).toBe(false);
  });
});
