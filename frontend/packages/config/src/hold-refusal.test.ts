import { describe, expect, it } from "vitest";

import { HOLD_OCCURRENCE_LOCKED, isHoldOccurrenceLocked } from "./hold-refusal";

// PAD-372: what the blueprint's HTTPException handler actually sends for abort(409, code).
const refused = { response: { status: 409, data: { error: HOLD_OCCURRENCE_LOCKED } } };

describe("isHoldOccurrenceLocked", () => {
  it("recognises the server's 409 {error} shape", () => {
    expect(isHoldOccurrenceLocked(refused)).toBe(true);
  });

  it("accepts a {code} field too, in case a route ever answers that way", () => {
    expect(isHoldOccurrenceLocked({ response: { status: 409, data: { code: HOLD_OCCURRENCE_LOCKED } } })).toBe(true);
  });

  it("is false for every other failure the same catch sees", () => {
    expect(isHoldOccurrenceLocked({ response: { status: 409, data: { error: "NO_CLUB" } } })).toBe(false);
    expect(isHoldOccurrenceLocked({ response: { status: 500, data: { error: HOLD_OCCURRENCE_LOCKED } } })).toBe(false);
    expect(isHoldOccurrenceLocked({ response: { status: 409 } })).toBe(false);
    expect(isHoldOccurrenceLocked(new Error("network"))).toBe(false);
    expect(isHoldOccurrenceLocked(null)).toBe(false);
    expect(isHoldOccurrenceLocked(undefined)).toBe(false);
    expect(isHoldOccurrenceLocked("HOLD_OCCURRENCE_LOCKED")).toBe(false);
  });
});
