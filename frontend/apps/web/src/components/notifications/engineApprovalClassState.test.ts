import { describe, expect, it } from "vitest";
import type { EngineApprovalState } from "@levelup/types";
import { ENGINE_APPROVAL_CLASS_START, engineApprovalClassState as step } from "./engineApprovalClassState";

const request = (requestId: number) => ({
  requestId,
  lessonInstanceId: 7,
  spotTypes: [{ side: "left" as const, levelId: null, levelLabel: null, queue: [] }],
});
const pending = (requestId: number): EngineApprovalState => ({
  engine: "new", state: "pending", semiAutomatic: true, approved: [], removed: [], request: request(requestId),
});
const none: EngineApprovalState = { engine: "new", state: "none", semiAutomatic: true, approved: [], removed: [] };
const dismissed: EngineApprovalState = { engine: "new", state: "dismissed", semiAutomatic: true, approved: [], removed: [] };

describe("PAD-920 the web class card across re-reads (semi-auto-approval N1, N3, N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-45] the class card follows the session's approval state across re-reads", () => {
    // pending: the card shows the request.
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: pending(41) });
    expect(v.card?.request?.requestId).toBe(41);
    // The coach approves; the re-read answers `none`, and the approved card stays while the screen is open.
    v = step(v, { type: "answered", result: "approved" });
    v = step(v, { type: "read", state: none });
    expect(v.card?.request?.requestId).toBe(41);
    expect(v.approved).toBe(true);
    // dismissed: "Ignorado", with the recompute button; the card on screen stays as the ignored one.
    v = step(v, { type: "read", state: dismissed });
    expect(v.dismissed).toBe(true);
    expect(v.approved).toBe(false);
    // The coach recomputes: the new request's card replaces it.
    v = step(v, { type: "recomputed", state: pending(42) });
    expect(v).toMatchObject({ approved: false, dismissed: false });
    expect(v.card?.request?.requestId).toBe(42);
  });

  it("drops an unanswered card when the re-read answers none, and replaces it with a newer request", () => {
    let v = step(ENGINE_APPROVAL_CLASS_START, { type: "read", state: pending(41) });
    v = step(v, { type: "read", state: pending(43) });
    expect(v.card?.request?.requestId).toBe(43);
    v = step(v, { type: "read", state: none });
    expect(v.card).toBeNull();
    // A stale answer changes nothing.
    expect(step(v, { type: "answered", result: "stale" })).toBe(v);
  });
});
