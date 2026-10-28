import { describe, expect, it } from "vitest";
import type { ApprovalBundle, ApprovalQueuePlayer, ApprovalVacancyInfo } from "@levelup/types";

import {
  APPROVAL_QUEUE_PREVIEW,
  approvalDisplayGroups,
  approvalEmptyReasonKey,
  approvalEmptyReasons,
  approvalGroupLabel,
  approvalQueuePreview,
  approvalSideKey,
  approvalStaleLabel,
  isOpenSpot,
  resolvedVacancyIds,
  staleCount,
  suggestionBundles,
  mergeSuggestionBundles,
  queueAsOfLabel,
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

describe("PAD-661 an empty queue says why (semi-auto-approval rule 4b)", () => {
  const reasons = [
    { stage: "eligibility", count: 7 },
    { stage: "excluded_by_coach", count: 2 },
    { stage: "unavailable", count: 0 },
  ];

  it("carries the reasons onto an open block only when the queue is empty, dropping zero counts", () => {
    const empty = { ...open(1, "left", []), emptyQueueReasons: reasons } as ApprovalVacancyInfo;
    const [group] = approvalDisplayGroups([empty]);
    expect(group.emptyQueueReasons).toEqual([
      { stage: "eligibility", count: 7 },
      { stage: "excluded_by_coach", count: 2 },
    ]);
    const full = { ...open(2, "left", [p(1)]), emptyQueueReasons: reasons } as ApprovalVacancyInfo;
    expect(approvalEmptyReasons(full)).toEqual([]);
  });

  it("reads an older payload without the key as no reasons, on open and freed spots alike", () => {
    const groups = approvalDisplayGroups([open(1, "left", []), declined(2, "Ana", [])]);
    expect(groups.map((g) => g.emptyQueueReasons)).toEqual([[], []]);
  });

  it("names a locale key per engine stage and falls back for a stage this build does not know", () => {
    expect(approvalEmptyReasonKey("excluded_by_coach")).toBe("notificationsUi.replacementApproval.emptyReason.excluded_by_coach");
    expect(approvalEmptyReasonKey("a_newer_stage")).toBe("notificationsUi.replacementApproval.emptyReason.other");
  });
});

describe("PAD-765 every pending prompt of the class (semi-auto-approval rules 11, 12)", () => {
  const b = (bundleId: string, vacancies: ApprovalVacancyInfo[]): ApprovalBundle =>
    ({ bundleId, lessonInstanceId: 1, windowOpenAt: null, responded: false, vacancies });

  it("reads every bundle in the server's order, an older server's one bundle, and nothing otherwise", () => {
    const older = b("b-14", [declined(1, "Case 7", [])]);
    const newer = b("b-21", [declined(2, "Case 8", [])]);
    expect(suggestionBundles({ state: "pending", bundle: older, bundles: [older, newer] }).map((x) => x.bundleId))
      .toEqual(["b-14", "b-21"]);
    expect(suggestionBundles({ state: "pending", bundle: newer }).map((x) => x.bundleId)).toEqual(["b-21"]);
    expect(suggestionBundles({ state: "dismissed" })).toEqual([]);
    expect(suggestionBundles({ state: "pending" })).toEqual([]);
  });

  it("counts a spot the message marks filled or expired as stale", () => {
    const filled = { ...open(1, "left", []), resolved: "filled" } as ApprovalVacancyInfo;
    const expired = { ...open(2, "left", []), resolved: "expired" } as ApprovalVacancyInfo;
    expect(resolvedVacancyIds(b("x", [filled, open(3, "left", []), expired]))).toEqual([1, 2]);
  });
});

describe("mergeSuggestionBundles (PAD-770, rule 12b)", () => {
  const b = (bundleId: string): ApprovalBundle =>
    ({ bundleId, lessonInstanceId: 7, windowOpenAt: null, responded: false, vacancies: [] }) as ApprovalBundle;

  it("takes the server's pending bundles, dropping one no longer pending", () => {
    expect(mergeSuggestionBundles([b("a"), b("b")], [b("b")], new Set()).map((x) => x.bundleId)).toEqual(["b"]);
  });

  it("keeps a card the coach just answered until it is closed", () => {
    expect(mergeSuggestionBundles([b("a"), b("b")], [b("b")], new Set(["a"])).map((x) => x.bundleId)).toEqual(["a", "b"]);
  });

  it("adds a bundle that became pending since", () => {
    expect(mergeSuggestionBundles([b("a")], [b("a"), b("c")], new Set()).map((x) => x.bundleId)).toEqual(["a", "c"]);
  });
});

describe("queueAsOfLabel (PAD-770, rule 12b)", () => {
  // 27 Oct is after the clocks change: Lisbon is UTC+0, so 20:41Z reads 20:41.
  const now = new Date("2026-10-27T22:00:00Z");

  it("names the time the message was built, on the club's clock", () => {
    expect(queueAsOfLabel("2026-10-27T20:41:00", now)).toEqual({
      key: "notificationsUi.replacementApproval.queueAsOf",
      values: { time: "20:41" },
    });
  });

  it("adds the day when it is not today", () => {
    expect(queueAsOfLabel("2026-10-26T09:05:00Z", now)).toEqual({
      key: "notificationsUi.replacementApproval.queueAsOfDay",
      values: { time: "09:05", day: "26/10" },
    });
  });

  it("reads summer time on the club's clock", () => {
    expect(queueAsOfLabel("2026-07-01T19:30:00Z", now)?.values.time).toBe("20:30");
  });

  it("is null without a time", () => {
    expect(queueAsOfLabel(null, now)).toBeNull();
  });
});
