import { describe, expect, it } from "vitest";
import type { EngineApprovalGroup, EngineApprovalState } from "@levelup/types";
import { ENGINE_APPROVAL_CLASS_START, engineApprovalClassState as step } from "./engineApprovalClassState";

const G1: EngineApprovalGroup = { tierSource: "pool", groupNumber: 1 };
const G2: EngineApprovalGroup = { tierSource: "pool", groupNumber: 2 };
const request = (requestId: number, group: EngineApprovalGroup) => ({
  requestId,
  lessonInstanceId: 7,
  group,
  spotTypes: [{ side: "left" as const, levelId: null, levelLabel: null, queue: [] }],
});
const state = (over: Partial<EngineApprovalState>): EngineApprovalState => ({
  engine: "new", state: "none", semiAutomatic: true, approvedGroups: [], dismissedGroups: [], removed: [], requests: [], ...over,
});
const ids = (v: ReturnType<typeof step>) => v.cards.map((c) => c.meta.requestId);

describe("PAD-920 the web class cards across re-reads (semi-auto-approval N1, N3, N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-45] the class card follows the session's approval state across re-reads", () => {
    // Pending for group 1: its card shows.
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: state({ state: "pending", requests: [request(41, G1)] }) });
    expect(ids(v)).toEqual([41]);
    // The coach approves; the re-read answers `none`: the approved card stays while the screen is open.
    v = step(v, { type: "answered", requestId: 41, result: "approved" });
    v = step(v, { type: "read", state: state({ approvedGroups: [G1] }) });
    expect(ids(v)).toEqual([41]);
    expect(v.cards[0].approved).toBe(true);
    // Group 2's request then shows as its own card.
    v = step(v, { type: "read", state: state({ state: "pending", approvedGroups: [G1], requests: [request(42, G2)] }) });
    expect(ids(v)).toEqual([41, 42]);
    // The coach dismisses group 2: it reads "Ignorado", and the recompute button shows.
    v = step(v, { type: "answered", requestId: 42, result: "dismissed" });
    v = step(v, { type: "read", state: state({ approvedGroups: [G1], dismissedGroups: [G2] }) });
    expect(v.dismissed).toBe(true);
    expect(v.cards.find((c) => c.meta.requestId === 42)).toMatchObject({ dismissed: true, meta: { state: "dismissed" } });
    // The coach recomputes: group 2's new request replaces it.
    v = step(v, { type: "recomputed", state: state({ state: "pending", approvedGroups: [G1], requests: [request(43, G2)] }) });
    expect(ids(v)).toEqual([41, 43]);
    expect(v.dismissed).toBe(false);
  });

  it("drops an unanswered card when the read no longer lists it, and replaces a group's older request", () => {
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: state({ state: "pending", requests: [request(41, G1)] }) });
    v = step(v, { type: "read", state: state({ state: "pending", requests: [request(44, G1)] }) });
    expect(ids(v)).toEqual([44]);
    v = step(v, { type: "read", state: state({}) });
    expect(v.cards).toEqual([]);
    expect(step(v, { type: "answered", requestId: 44, result: "stale" })).toBe(v);
  });
});
