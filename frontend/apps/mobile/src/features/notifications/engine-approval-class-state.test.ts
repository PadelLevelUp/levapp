/**
 * PAD-920 (semi-auto-approval N1, N3, N5) on iOS: the class screen's new-engine cards, one per group
 * about to start, follow the session's approval state across re-reads, as web's
 * `engineApprovalClassState` does (criterion 45). The screen has no render harness, so the decision
 * is a pure reducer and its use in the screen is read from the source.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineApprovalGroup, EngineApprovalState } from "@levelup/types";

import { ENGINE_APPROVAL_CLASS_START, engineApprovalClassState as step } from "./engine-approval-class-state";

const src = readFileSync(join(__dirname, "../../../app/class/[id].tsx"), "utf8");

const G1: EngineApprovalGroup = { tierSource: "pool", groupNumber: 1 };
const G2: EngineApprovalGroup = { tierSource: "pool", groupNumber: 2 };
const request = (requestId: number, group: EngineApprovalGroup) => ({
  requestId,
  lessonInstanceId: 40,
  group,
  spotTypes: [{ side: "left" as const, levelId: 3, levelLabel: "Nível 3", count: 1, queue: [] }],
});
const state = (over: Partial<EngineApprovalState>): EngineApprovalState => ({
  engine: "new",
  state: "none",
  semiAutomatic: true,
  approvedGroups: [],
  dismissedGroups: [],
  removed: [],
  requests: [],
  ...over,
});
const ids = (v: ReturnType<typeof step>) => v.cards.map((c) => c.meta.requestId);

describe("the class screen's new-engine cards (semi-auto-approval N1, N3, N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-44] the class card follows the session's approval state across re-reads", () => {
    // Pending for group 1: its card shows, carrying its group for the title, and no recompute.
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: state({ state: "pending", requests: [request(41, G1)] }) });
    expect(ids(v)).toEqual([41]);
    expect(v.cards[0].meta).toMatchObject({ engine: "new", group: G1, state: "pending", responded: false });
    expect(v.dismissed).toBe(false);
    // The coach approves; the re-read answers `none`: the approved card stays while the screen is open.
    v = step(v, { type: "answered", requestId: 41, result: "approved" });
    v = step(v, { type: "read", state: state({ approvedGroups: [G1] }) });
    expect(ids(v)).toEqual([41]);
    expect(v.cards[0].approved).toBe(true);
    // Group 2's request then shows as its own card.
    v = step(v, { type: "read", state: state({ state: "pending", approvedGroups: [G1], requests: [request(42, G2)] }) });
    expect(ids(v)).toEqual([41, 42]);
    expect(v.cards[1].meta.group).toEqual(G2);
    // The coach dismisses group 2: it reads "Ignorado", and the recompute button shows.
    v = step(v, { type: "answered", requestId: 42, result: "dismissed" });
    expect(v.dismissed).toBe(true);
    v = step(v, { type: "read", state: state({ approvedGroups: [G1], dismissedGroups: [G2] }) });
    expect(v.dismissed).toBe(true);
    expect(ids(v)).toEqual([41, 42]);
    expect(v.cards.find((c) => c.meta.requestId === 42)).toMatchObject({ dismissed: true, meta: { state: "dismissed" } });
    // The coach recomputes: group 2's new request replaces it; group 1's approved card stays.
    v = step(v, { type: "recomputed", state: state({ state: "pending", approvedGroups: [G1], requests: [request(43, G2)] }) });
    expect(ids(v)).toEqual([41, 43]);
    expect(v.cards[1]).toMatchObject({ approved: false, dismissed: false, meta: { state: "pending" } });
    expect(v.dismissed).toBe(false);

    // The screen renders one card per entry of this view, and the recompute when it says so.
    expect(src).toContain("React.useReducer(engineApprovalClassState, ENGINE_APPROVAL_CLASS_START)");
    expect(src).toContain('dispatchEngineApproval({ type: "read", state: s })');
    expect(src).toContain('dispatchEngineApproval({ type: "recomputed", state: s })');
    expect(src).toContain("engineApproval.cards.map((card)");
    expect(src).toContain("bundle={card.meta}");
    expect(src).toContain('dispatchEngineApproval({ type: "answered", requestId: card.meta.requestId');
    expect(src).toContain("(suggestionsIgnored || engineApproval.dismissed)");
  });

  it("drops an unanswered card when the read no longer lists it, and replaces a group's older request", () => {
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: state({ state: "pending", requests: [request(41, G1)] }) });
    v = step(v, { type: "read", state: state({ state: "pending", requests: [request(44, G1)] }) });
    expect(ids(v)).toEqual([44]);
    v = step(v, { type: "read", state: state({}) });
    expect(v.cards).toEqual([]);
    expect(step(v, { type: "answered", requestId: 44, result: "stale" })).toBe(v);
    expect(step(v, { type: "reset" })).toBe(ENGINE_APPROVAL_CLASS_START);
  });
});
