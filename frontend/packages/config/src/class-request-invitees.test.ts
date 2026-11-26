import { describe, expect, it } from "vitest";
import { duplicateInvitees } from "./class-request-invitees";

describe("duplicateInvitees", () => {
  it("[CLASSES-CLASS-REQUESTS-56] flags a name that repeats an earlier one, trimmed and in any letter case", () => {
    expect(duplicateInvitees(["carla", " Carla ", "dana"])).toEqual([false, true, false]);
    expect(duplicateInvitees(["a", "b", "A", "B"])).toEqual([false, false, true, true]);
  });

  it("never flags empty fields", () => {
    expect(duplicateInvitees(["", "  ", "carla"])).toEqual([false, false, false]);
  });
});
