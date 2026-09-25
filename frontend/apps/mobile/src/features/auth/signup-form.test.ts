/**
 * auth.register rule 18 (PAD-445) on the iOS sign-up form: under 18 is refused on the birth-date
 * field before any request (the device's date; the server judges on UTC and stays the authority),
 * and a server `UNDERAGE` maps to the same words.
 */
import { describe, expect, it } from "vitest";
import { CODE_KEYS, signUpSchema } from "./signup-form";

const pad = (n: number) => String(n).padStart(2, "0");
/** DD/MM/AAAA, `years` ago on the device's date, shifted by `days`. */
function yearsAgo(years: number, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const base = {
  name: "Teen Silva", username: "teen", email: "teen@example.com", password: "Segura123",
  repeatPassword: "Segura123", country: "PT",
};
const birthIssues = (birthDate: string) => {
  const r = signUpSchema.safeParse({ ...base, birthDate });
  return r.success ? [] : r.error.errors.filter((e) => e.path[0] === "birthDate").map((e) => e.message);
};

describe("signUpSchema — adults only (PAD-445)", () => {
  it("refuses a day short of 18 on the birth-date field", () => {
    expect(birthIssues(yearsAgo(18, 1))).toEqual(["birthDateUnderage"]);
  });

  it("accepts an 18th birthday today", () => {
    expect(signUpSchema.safeParse({ ...base, birthDate: yearsAgo(18) }).success).toBe(true);
  });

  it("refuses a 10-year-old too: the age refusal is the only issue", () => {
    const r = signUpSchema.safeParse({ ...base, birthDate: yearsAgo(10) });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.errors.map((e) => `${String(e.path[0])}:${e.message}`)).toEqual([
      "birthDate:birthDateUnderage",
    ]);
  });

  it("keeps an unreal date an invalid date, not underage", () => {
    expect(birthIssues("31/02/2000")).toEqual(["birthDateInvalid"]);
  });
});

describe("the server's UNDERAGE (PAD-445)", () => {
  it("maps UNDERAGE to the birth-date message", () => {
    expect(CODE_KEYS.UNDERAGE).toBe("birthDateUnderage");
  });
});
