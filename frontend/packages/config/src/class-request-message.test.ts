import { describe, expect, it } from "vitest";
import { classRequestBubbleState, type ClassRequestMessageMeta } from "./class-request-message";

const slot = { date: "2026-09-30", startTime: "15:00", endTime: "16:00" };
const proposed: ClassRequestMessageMeta = { id: 7, status: "countered", kind: "proposed", slot };
const live = { id: 7, status: "countered" as const, ...slot };

describe("classRequestBubbleState (classes.class-requests rule 6, PAD-281)", () => {
  it("offers the student the three answers while the proposal is live at that slot", () => {
    expect(classRequestBubbleState(proposed, live, { own: false })).toEqual({ kind: "actions", status: "countered" });
  });

  it("shows the coach their own proposal as waiting", () => {
    expect(classRequestBubbleState(proposed, live, { own: true })).toEqual({ kind: "waiting", status: "countered" });
  });

  it("shows the outcome once the request moved on", () => {
    expect(classRequestBubbleState(proposed, { ...live, status: "accepted" }, { own: false })).toEqual({ kind: "outcome", status: "accepted" });
    expect(classRequestBubbleState(proposed, { ...live, status: "declined" }, { own: true })).toEqual({ kind: "outcome", status: "declined" });
    expect(classRequestBubbleState(proposed, { ...live, status: "withdrawn" }, { own: false })).toEqual({ kind: "outcome", status: "withdrawn" });
  });

  it("marks an older round's proposal superseded when the slot on the table differs", () => {
    expect(classRequestBubbleState(proposed, { ...live, startTime: "17:00", endTime: "18:00" }, { own: false })).toEqual({ kind: "superseded", status: "countered" });
    // Back with the coach after the student counter-proposed: the old proposal is also superseded.
    expect(classRequestBubbleState(proposed, { ...live, status: "pending", startTime: "17:00", endTime: "18:00" }, { own: false })).toEqual({ kind: "superseded", status: "pending" });
  });

  it("offers the coach the same three answers on the student's counter-proposal", () => {
    const countered: ClassRequestMessageMeta = { id: 7, status: "pending", kind: "countered", slot: { ...slot, startTime: "17:00", endTime: "18:00" } };
    const back = { ...live, status: "pending" as const, startTime: "17:00", endTime: "18:00" };
    expect(classRequestBubbleState(countered, back, { own: false })).toEqual({ kind: "actions", status: "pending" });
    expect(classRequestBubbleState(countered, back, { own: true })).toEqual({ kind: "waiting", status: "pending" });
    // The coach proposed again: the student's counter is superseded.
    expect(classRequestBubbleState(countered, { ...back, status: "countered", startTime: "19:00", endTime: "20:00" }, { own: true })).toEqual({ kind: "superseded", status: "countered" });
    expect(classRequestBubbleState(countered, { ...back, status: "accepted" }, { own: false })).toEqual({ kind: "outcome", status: "accepted" });
  });

  it("keeps older messages without a slot answerable while the request is countered", () => {
    const legacy: ClassRequestMessageMeta = { id: 7, status: "countered", kind: "proposed" };
    expect(classRequestBubbleState(legacy, live, { own: false })).toEqual({ kind: "actions", status: "countered" });
  });

  it("renders nothing extra for the other kinds and while the live status is unknown", () => {
    expect(classRequestBubbleState({ id: 7, status: "pending", kind: "requested" }, live, { own: false })).toEqual({ kind: "none", status: "pending" });
    expect(classRequestBubbleState({ id: 7, status: "accepted", kind: "accepted" }, live, { own: false })).toEqual({ kind: "none", status: "accepted" });
    expect(classRequestBubbleState(proposed, undefined, { own: false })).toEqual({ kind: "none", status: "countered" });
    expect(classRequestBubbleState(undefined, live, { own: false })).toEqual({ kind: "none", status: undefined });
  });

  it("falls back to the message's own status when the request is not in the live list", () => {
    expect(classRequestBubbleState(proposed, null, { own: false })).toEqual({ kind: "outcome", status: "countered" });
  });
});
