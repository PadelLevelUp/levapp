import { describe, expect, it } from "vitest";
import { legalCatchUpBody, legalCatchUpErrors } from "./legal-catch-up";

/** PAD-637 (auth.legal-catch-up rules 2, 3, 5): only pending parts are checked and sent. */
const both = { terms: true, birthDate: true };

describe("legalCatchUpErrors", () => {
  it("asks for an unticked box and a missing date", () => {
    expect(legalCatchUpErrors(both, { termsAccepted: false, birthDate: "" })).toEqual({
      terms: "termsRequired",
      birthDate: "birthDateRequired",
    });
  });

  it("refuses under 18 before sending", () => {
    const y = new Date().getFullYear() - 17;
    expect(legalCatchUpErrors(both, { termsAccepted: true, birthDate: `01/01/${y}` })).toEqual({ birthDate: "underage" });
  });

  it("ignores a part that is not pending", () => {
    expect(legalCatchUpErrors({ terms: true, birthDate: false }, { termsAccepted: true, birthDate: "" })).toEqual({});
  });
});

describe("legalCatchUpBody", () => {
  it("sends only the pending parts, the date as ISO", () => {
    expect(legalCatchUpBody(both, { termsAccepted: true, birthDate: "05/05/1990" })).toEqual({
      termsAccepted: true,
      birthDate: "1990-05-05",
    });
    expect(legalCatchUpBody({ terms: false, birthDate: true }, { termsAccepted: false, birthDate: "05/05/1990" })).toEqual({
      birthDate: "1990-05-05",
    });
  });
});
