import { describe, expect, it } from "vitest";
import { classDayParts } from "./invite-simulation";

describe("classDayParts (PAD-517)", () => {
  it("names the weekday in the user's language with the day/month", () => {
    expect(classDayParts("2026-10-14", "pt")).toEqual({ weekday: "Qua", day: "14/10" });
    expect(classDayParts("2026-10-14", "en")).toEqual({ weekday: "Wed", day: "14/10" });
    expect(classDayParts("2026-10-11", "pt-PT")).toEqual({ weekday: "Dom", day: "11/10" });
  });
  it("leaves anything that is not a calendar day as it is", () => {
    expect(classDayParts("soon", "pt")).toEqual({ weekday: "", day: "soon" });
  });
});
