import { describe, expect, it } from "vitest";
import { joinRequestBubbleState, type JoinRequestMessageMeta } from "./join-request-message";

const meta: JoinRequestMessageMeta = { id: 42, status: "pending" };
const live = { id: 42, status: "pending" as const };

describe("joinRequestBubbleState (classes.join-requests rule 18, PAD-461)", () => {
  it("offers the coach Accept / Decline while the request is live pending", () => {
    expect(joinRequestBubbleState(meta, live, { own: false })).toEqual({ kind: "actions", status: "pending" });
  });

  it("shows the outcome once the request is decided, withdrawn or superseded", () => {
    expect(joinRequestBubbleState(meta, { ...live, status: "accepted" }, { own: false })).toEqual({ kind: "outcome", status: "accepted" });
    expect(joinRequestBubbleState(meta, { ...live, status: "rejected" }, { own: false })).toEqual({ kind: "outcome", status: "rejected" });
    expect(joinRequestBubbleState(meta, { ...live, status: "withdrawn" }, { own: false })).toEqual({ kind: "outcome", status: "withdrawn" });
    expect(joinRequestBubbleState(meta, { ...live, status: "superseded" }, { own: false })).toEqual({ kind: "outcome", status: "superseded" });
  });

  it("falls back to the outcome when the request is not in the live list any more", () => {
    expect(joinRequestBubbleState(meta, null, { own: false })).toEqual({ kind: "outcome", status: "pending" });
  });

  it("shows nothing while the live row is still loading, or when there is no ask at all", () => {
    expect(joinRequestBubbleState(meta, undefined, { own: false })).toEqual({ kind: "none", status: "pending" });
    expect(joinRequestBubbleState(null, live, { own: false })).toEqual({ kind: "none", status: undefined });
    expect(joinRequestBubbleState(undefined, live, { own: false })).toEqual({ kind: "none", status: undefined });
  });

  it("never offers the student's own copy of the message any actions", () => {
    expect(joinRequestBubbleState(meta, live, { own: true })).toEqual({ kind: "none", status: "pending" });
    expect(joinRequestBubbleState(meta, { ...live, status: "accepted" }, { own: true })).toEqual({ kind: "none", status: "pending" });
    expect(joinRequestBubbleState(meta, null, { own: true })).toEqual({ kind: "none", status: "pending" });
  });
});
