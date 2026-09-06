import type { ApprovalBundle } from "@levelup/types";
import { describe, expect, it } from "vitest";

import {
  approvalBundleFrom,
  approvalCardState,
  approvalRespondOutcome,
  queueBadgeLabel,
} from "./approval-bundle";

function bundle(overrides: Partial<ApprovalBundle> = {}): ApprovalBundle {
  return {
    bundleId: "bundle-1",
    lessonInstanceId: 7,
    windowOpenAt: null,
    responded: false,
    vacancies: [
      {
        vacancyId: 1,
        declinedPlayerId: 10,
        declinedPlayerName: "Ana",
        queue: [],
      },
    ],
    ...overrides,
  };
}

describe("approvalBundleFrom", () => {
  it("accepts a bundle carrying an id and at least one vacancy", () => {
    const metadata = bundle();
    expect(approvalBundleFrom(metadata)).toEqual(metadata);
  });

  it("rejects metadata that is not a bundle at all", () => {
    expect(approvalBundleFrom(null)).toBeNull();
    expect(approvalBundleFrom(undefined)).toBeNull();
    expect(approvalBundleFrom("bundle-1")).toBeNull();
    expect(approvalBundleFrom({ responded: true })).toBeNull();
  });

  it("rejects a bundle with no vacancies — the card would be empty", () => {
    expect(approvalBundleFrom(bundle({ vacancies: [] }))).toBeNull();
    expect(
      approvalBundleFrom({ bundleId: "bundle-1", vacancies: undefined })
    ).toBeNull();
  });

  it("rejects a blank bundleId (the respond call needs a real one)", () => {
    expect(approvalBundleFrom(bundle({ bundleId: "" }))).toBeNull();
  });
});

describe("queueBadgeLabel", () => {
  it("prefers the server-authored group label verbatim", () => {
    expect(
      queueBadgeLabel({ groupLabel: "Terça 19h", roundNumber: 2, groupIndex: 1 })
    ).toEqual({ text: "Terça 19h" });
  });

  it("falls back to the round, then the group index", () => {
    expect(queueBadgeLabel({ roundNumber: 2, groupIndex: 1 })).toEqual({
      key: "notificationsUi.replacementApproval.round",
      params: { number: 2 },
    });
    expect(queueBadgeLabel({ groupIndex: 3 })).toEqual({
      key: "notificationsUi.replacementApproval.group",
      params: { index: 3 },
    });
  });

  it("renders no chip when the backend sent no position at all", () => {
    expect(queueBadgeLabel({})).toBeNull();
  });

  it("keeps round 0 and group 0 as real positions", () => {
    expect(queueBadgeLabel({ roundNumber: 0 })).toEqual({
      key: "notificationsUi.replacementApproval.round",
      params: { number: 0 },
    });
    expect(queueBadgeLabel({ groupIndex: 0 })).toEqual({
      key: "notificationsUi.replacementApproval.group",
      params: { index: 0 },
    });
  });
});

describe("approvalCardState", () => {
  const now = new Date("2026-09-06T10:00:00");

  it("shows the buttons on a fresh, unanswered bundle", () => {
    expect(approvalCardState(bundle(), { now })).toEqual({
      windowOpenInFuture: false,
      allStale: false,
      response: null,
      showActions: true,
    });
  });

  it("offers the at-window choice only while the window is still ahead", () => {
    expect(
      approvalCardState(bundle({ windowOpenAt: "2026-09-06T18:00:00" }), { now })
        .windowOpenInFuture
    ).toBe(true);
    expect(
      approvalCardState(bundle({ windowOpenAt: "2026-09-06T09:00:00" }), { now })
        .windowOpenInFuture
    ).toBe(false);
  });

  it("reads the recorded answer off the bundle and hides the buttons", () => {
    const state = approvalCardState(
      bundle({ responded: true, response: "yes_now" }),
      { now }
    );
    expect(state.response).toBe("yes_now");
    expect(state.showActions).toBe(false);
  });

  it("ignores a stale response field when the bundle was never answered", () => {
    expect(
      approvalCardState(bundle({ responded: false, response: "dismiss" }), {
        now,
      }).response
    ).toBeNull();
  });

  it("prefers an answer given in this session over the bundle's", () => {
    const state = approvalCardState(
      bundle({ responded: true, response: "yes_now" }),
      { localResponse: "dismiss", now }
    );
    expect(state.response).toBe("dismiss");
  });

  it("is read-only for your own message: no buttons, no answer invented", () => {
    const state = approvalCardState(bundle(), { readOnly: true, now });
    expect(state.showActions).toBe(false);
    expect(state.response).toBeNull();
  });

  it("marks the whole bundle stale only when every vacancy is", () => {
    const two = bundle({
      vacancies: [
        { vacancyId: 1, declinedPlayerId: 10, declinedPlayerName: "Ana", queue: [] },
        { vacancyId: 2, declinedPlayerId: 11, declinedPlayerName: "Bea", queue: [] },
      ],
    });
    expect(approvalCardState(two, { staleVacancyIds: [1], now }).allStale).toBe(
      false
    );
    expect(
      approvalCardState(two, { staleVacancyIds: [1, 2], now }).allStale
    ).toBe(true);
  });

  it("does not call an untouched bundle stale (empty every() is true)", () => {
    expect(approvalCardState(bundle(), { staleVacancyIds: [], now }).allStale).toBe(
      false
    );
  });
});

describe("approvalRespondOutcome", () => {
  it("collects the vacancies the server refused", () => {
    const outcome = approvalRespondOutcome([
      { vacancyId: 1, result: "approved_now" },
      { vacancyId: 2, result: "stale" },
    ]);
    expect(outcome.staleVacancyIds).toEqual([2]);
    expect(outcome.allStale).toBe(false);
    expect(outcome.toastKey).toBeNull();
  });

  it("says so out loud when nothing could be actioned", () => {
    const outcome = approvalRespondOutcome([
      { vacancyId: 1, result: "stale" },
      { vacancyId: 2, result: "stale" },
    ]);
    expect(outcome.allStale).toBe(true);
    expect(outcome.toastKey).toBe(
      "notificationsUi.replacementApproval.spotsFilledOrExpired"
    );
  });

  it("treats an empty or missing vacancy list as nothing to report", () => {
    expect(approvalRespondOutcome([])).toEqual({
      staleVacancyIds: [],
      allStale: false,
      toastKey: null,
    });
    expect(approvalRespondOutcome(undefined).allStale).toBe(false);
  });
});
