import { describe, expect, it } from "vitest";
import { COUNTRIES, MINIMUM_SIGNUP_AGE, ageOn, countryName, isUnderSignupAge } from "./countries";

describe("countries", () => {
  it("lists unique upper-case ISO codes with Portugal first", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes[0]).toBe("PT");
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("computes full years from an ISO birth date", () => {
    const today = new Date(2026, 8, 10); // 2026-09-10
    expect(ageOn("2016-09-10", today)).toBe(10);
    expect(ageOn("2016-09-11", today)).toBe(9);
    expect(ageOn("10/05/2016", today)).toBeNull();
  });

  it("names countries in the active language", () => {
    expect(countryName("DE", "pt")).toBe("Alemanha");
    expect(countryName("DE", "en-GB")).toBe("Germany");
  });
});

describe("isUnderSignupAge — auth.register rule 18 (PAD-445)", () => {
  const today = new Date(2026, 8, 25); // 25 Sep 2026, local

  it("refuses a day short of 18 and accepts an 18th birthday today", () => {
    expect(isUnderSignupAge("2008-09-26", today)).toBe(true);
    expect(isUnderSignupAge("2008-09-25", today)).toBe(false);
    expect(isUnderSignupAge("1990-01-01", today)).toBe(false);
  });

  it("is 18 on 1 March for a 29 February birth in a non-leap year", () => {
    expect(isUnderSignupAge("2008-02-29", new Date(2026, 1, 28))).toBe(true);
    expect(isUnderSignupAge("2008-02-29", new Date(2026, 2, 1))).toBe(false);
  });

  it("leaves an empty or malformed date to the date checks", () => {
    expect(isUnderSignupAge("", today)).toBe(false);
    expect(isUnderSignupAge("25/09/2010", today)).toBe(false);
  });

  it("pins the bar at 18", () => {
    expect(MINIMUM_SIGNUP_AGE).toBe(18);
  });
});
