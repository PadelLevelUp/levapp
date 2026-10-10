import { describe, expect, it } from "vitest";
import type { ApprovalQueuePlayer, ApprovalVacancyInfo } from "@levelup/types";

import {
  APPROVAL_QUEUE_PREVIEW,
  approvalDisplayGroups,
  approvalGroupLabel,
  approvalQueuePreview,
  approvalSideKey,
  approvalStaleLabel,
  isOpenSpot,
  staleCount,
} from "./approval-display";

const p = (id: number): ApprovalQueuePlayer => ({ id: String(id), name: `P${id}` });
const declined = (vacancyId: number, name: string, queue: ApprovalQueuePlayer[]): ApprovalVacancyInfo =>
  ({ vacancyId, declinedPlayerId: vacancyId * 10, declinedPlayerName: name, queue, openSpot: false, side: "left" }) as ApprovalVacancyInfo;
const open = (vacancyId: number, side: "left" | "right" | "both" | null, queue: ApprovalQueuePlayer[]): ApprovalVacancyInfo =>
  ({ vacancyId, declinedPlayerId: null, declinedPlayerName: null, queue, openSpot: true, side }) as unknown as ApprovalVacancyInfo;

describe("PAD-574 the approval card's display groups (semi-auto-approval rules 4, 7)", () => {
  it("keeps every freed spot on its own, with the student's name, even with an identical list", () => {
    const q = [p(1), p(2)];
    const groups = approvalDisplayGroups([declined(1, "João", q), declined(2, "Ana", q)]);
    expect(groups.map((g) => g.kind)).toEqual(["declined", "declined"]);
    expect(groups.map((g) => (g.kind === "declined" ? g.declinedPlayerName : null))).toEqual(["João", "Ana"]);
  });

  it("groups open spots by side and identical ordered queue, counting them, in first-seen order", () => {
    const a = [p(1), p(2), p(3)];
    const b = [p(4), p(5)];
    const groups = approvalDisplayGroups([open(1, "left", a), open(2, "right", b), open(3, "left", a), open(4, "left", a), open(5, "right", b)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ kind: "open", side: "left", count: 3, vacancyIds: [1, 3, 4] });
    expect(groups[1]).toMatchObject({ kind: "open", side: "right", count: 2, vacancyIds: [2, 5] });
  });

  it("keeps identical lists apart when their sides differ, and a reordered list is a different list", () => {
    const a = [p(1), p(2)];
    const groups = approvalDisplayGroups([open(1, "left", a), open(2, "right", a), open(3, "left", [p(2), p(1)])]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => (g.kind === "open" ? [g.side, g.count] : null))).toEqual([["left", 1], ["right", 1], ["left", 1]]);
  });

  it("groups `both` and no side together: both read 'any side', so they are one block", () => {
    const a = [p(1), p(2)];
    const groups = approvalDisplayGroups([open(1, "both", a), open(2, null, a)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "open", count: 2 });
    expect(approvalSideKey("both")).toBe(approvalSideKey(null));
    expect(approvalSideKey("left")).toBe("notificationsUi.replacementApproval.sideLeft");
  });

  it("labels a block by count and side, and names its stale spots", () => {
    const [g] = approvalDisplayGroups([open(1, "left", [p(1)]), open(2, "left", [p(1)])]);
    expect(approvalGroupLabel(g as Extract<typeof g, { kind: "open" }>, "esquerda")).toEqual({
      key: "notificationsUi.replacementApproval.openSpotGroup", params: { count: 2, side: "esquerda" },
    });
    expect(approvalStaleLabel(g, 1)).toEqual({ key: "notificationsUi.replacementApproval.groupStale", params: { stale: 1, total: 2 } });
    expect(approvalStaleLabel({ vacancyIds: [9] }, 1)).toEqual({ key: "notificationsUi.replacementApproval.noLongerNeeded" });
  });

  it("reads an old payload without the flag: no declined player means an open spot; the flag wins when present", () => {
    expect(isOpenSpot({ declinedPlayerId: null as unknown as number, openSpot: undefined })).toBe(true);
    expect(isOpenSpot({ declinedPlayerId: 7, openSpot: undefined })).toBe(false);
    expect(isOpenSpot({ declinedPlayerId: null as unknown as number, openSpot: false })).toBe(false);
    const legacy = { vacancyId: 9, declinedPlayerId: null, declinedPlayerName: null, queue: [p(1)] } as unknown as ApprovalVacancyInfo;
    expect(approvalDisplayGroups([legacy])[0]).toMatchObject({ kind: "open", side: null, count: 1 });
  });

  it("previews the first five of a list and says how many are hidden; expanded shows all", () => {
    const q = [p(1), p(2), p(3), p(4), p(5), p(6), p(7)];
    expect(APPROVAL_QUEUE_PREVIEW).toBe(5);
    expect(approvalQueuePreview(q, false)).toEqual({ shown: q.slice(0, 5), hidden: 2 });
    expect(approvalQueuePreview(q, true)).toEqual({ shown: q, hidden: 0 });
    expect(approvalQueuePreview(q.slice(0, 5), false)).toEqual({ shown: q.slice(0, 5), hidden: 0 });
  });

  it("counts a group's stale vacancies", () => {
    expect(staleCount({ vacancyIds: [1, 3, 4] }, [3, 4, 9])).toBe(2);
  });
});
