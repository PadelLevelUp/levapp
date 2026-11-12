import { describe, expect, it } from "vitest";
import { applyEngineAnswer, engineAnswerPatch } from "./engine-message";

describe("the new engine's messages on iOS (PAD-920)", () => {
  it("writes the server's answer as the bubble's state; a sorry Yes is never declined (NB5)", () => {
    expect(engineAnswerPatch("confirmed")).toEqual({ state: "answered", response: "yes", answeredBy: "student" });
    expect(engineAnswerPatch("declined")).toEqual({ state: "answered", response: "no", answeredBy: "student" });
    expect(engineAnswerPatch("sorry")).toEqual({ state: "sorry" });
    expect(engineAnswerPatch("reoffered")).toEqual({ state: "reoffered" });
    expect(engineAnswerPatch("closed_same_hour")).toEqual({ state: "closed_same_hour" });
    // Started is derived from startsAt, never written.
    expect(engineAnswerPatch("class_started")).toBeNull();
    expect(engineAnswerPatch(undefined)).toBeNull();
  });

  it("[NOTIFICATIONS-INVITATIONS-123] answers by invitation id and keeps the newest state", () => {
    // The server's action is written as the state: a sorry Yes is never "declined".
    const tapped = { id: 1, metadata: { engine: "new", invitationId: 5, state: "open" } };
    expect(applyEngineAnswer(tapped, "open", engineAnswerPatch("sorry")).metadata).toMatchObject({ state: "sorry" });
    // The re-offer arrived first: the slower sorry answer leaves it alone.
    const reoffered = { id: 1, metadata: { engine: "new", invitationId: 5, state: "reoffered" } };
    expect(applyEngineAnswer(reoffered, "open", engineAnswerPatch("sorry"))).toBe(reoffered);
    expect(applyEngineAnswer(tapped, "open", null)).toBe(tapped);
  });
});
