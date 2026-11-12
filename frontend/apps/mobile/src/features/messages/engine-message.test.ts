import { describe, expect, it } from "vitest";
import { applyEngineAnswer, engineAlertClassRoute, engineAnswerPatch } from "./engine-message";

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

  it("an answer never writes an older state over a live edit that landed first (NB5)", () => {
    const tapped = { id: 1, metadata: { engine: "new", invitationId: 5, state: "open" } };
    expect(applyEngineAnswer(tapped, "open", engineAnswerPatch("sorry")).metadata).toMatchObject({ state: "sorry" });
    // The re-offer arrived first: the slower sorry answer leaves it alone.
    const reoffered = { id: 1, metadata: { engine: "new", invitationId: 5, state: "reoffered" } };
    expect(applyEngineAnswer(reoffered, "open", engineAnswerPatch("sorry"))).toBe(reoffered);
    expect(applyEngineAnswer(tapped, "open", null)).toBe(tapped);
  });

  it("links an engine_alert to its class by the materialised instance (NA3)", () => {
    expect(engineAlertClassRoute({ engine: "new", lessonInstanceId: 7 })).toEqual({
      pathname: "/class/[id]",
      params: { id: "lessoninstance-7" },
    });
    expect(engineAlertClassRoute({ lessonInstanceId: 7 })).toBeNull();
    expect(engineAlertClassRoute({ engine: "new" })).toBeNull();
  });
});
