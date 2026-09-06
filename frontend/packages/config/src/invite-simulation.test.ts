import { describe, it, expect } from "vitest";
import type { EligibilityFailure, InviteExplain } from "@levelup/types";
import {
  describeEligibilityFailure,
  describeGate,
  describePriority,
  describeRules,
  describeSendStatus,
  describeVerdict,
  resolveText,
  sortGates,
} from "./invite-simulation";

// PAD-196 (spec: settings.tutorials rules 4–6, notifications.invite-simulation
// rule 12). The backend emits structured codes; this module is the ONE place
// both shells turn them into locale keys, so the eligibility sentence the
// tutorial shows is the sentence the manual-add warning will show.

const failure = (over: Partial<EligibilityFailure>): EligibilityFailure => ({
  attribute: "level",
  operation: "within_n_of_class",
  actual: null,
  threshold: null,
  ladder_distance: null,
  reason: null,
  ...over,
});

describe("describeEligibilityFailure", () => {
  it("says '2 levels below this class' for a positive ladder distance", () => {
    expect(
      describeEligibilityFailure(failure({ threshold: 1, ladder_distance: 2, actual: "5-" })),
    ).toEqual({ key: "tutorials.eligibility.levelBelow", params: { n: 2 } });
  });

  it("uses the singular key for one step and 'above' for a negative distance", () => {
    expect(describeEligibilityFailure(failure({ ladder_distance: -1 }))).toEqual({
      key: "tutorials.eligibility.levelAboveOne",
      params: { n: 1 },
    });
  });

  it("names the fail-closed level cases by their reason code", () => {
    expect(describeEligibilityFailure(failure({ reason: "class_has_no_level" })).key).toBe(
      "tutorials.eligibility.classHasNoLevel",
    );
    expect(describeEligibilityFailure(failure({ reason: "student_has_no_level" })).key).toBe(
      "tutorials.eligibility.studentHasNoLevel",
    );
    expect(describeEligibilityFailure(failure({ reason: "level_not_in_ladder" })).key).toBe(
      "tutorials.eligibility.levelNotInLadder",
    );
  });

  it("renders 'over the unjustified-absence limit (4, limit is 2)' from the record", () => {
    expect(
      describeEligibilityFailure(
        failure({
          attribute: "unjustified_absences",
          operation: "less_than_or_equal",
          actual: 4,
          threshold: 2,
        }),
      ),
    ).toEqual({
      key: "tutorials.eligibility.absencesOver",
      params: { actual: 4, threshold: 2 },
    });
  });

  it("falls back to a generic key for an attribute it does not know", () => {
    expect(describeEligibilityFailure(failure({ attribute: "mystery" })).key).toBe(
      "tutorials.eligibility.generic",
    );
  });
});

describe("gates", () => {
  it("keys on the gate code and formats the window-open instant on the club clock", () => {
    const text = describeGate({
      code: "invitation_window",
      blocked: true,
      opensAt: "2026-07-15T15:00:00",
    });
    expect(text.key).toBe("tutorials.gates.invitation_window");
    // 15:00 UTC in July is 16:00 in Lisbon (WEST).
    expect(text.params?.opensAt).toBe("15/07 16:00");
  });

  it("puts blocked gates first and keeps the engine's order otherwise", () => {
    const sorted = sortGates([
      { code: "auto_notify_disabled", blocked: false },
      { code: "quiet_hours", blocked: true },
      { code: "class_over", blocked: false },
      { code: "max_total_reached", blocked: true },
    ]);
    expect(sorted.map((g) => g.code)).toEqual([
      "quiet_hours",
      "max_total_reached",
      "auto_notify_disabled",
      "class_over",
    ]);
  });
});

describe("rounds, badges and priorities", () => {
  it("says 'everyone eligible' for an empty rule set", () => {
    expect(describeRules([])).toEqual([{ key: "tutorials.rounds.everyone" }]);
  });

  it("keys each rule on attribute and operation, carrying the value", () => {
    expect(
      describeRules([
        { attribute: "level", operation: "same_as_vacancy", value: null },
        { attribute: "unjustified_absences", operation: "less_than_or_equal", value: 2 },
      ]),
    ).toEqual([
      { key: "tutorials.rules.level.same_as_vacancy", params: { value: "" } },
      { key: "tutorials.rules.unjustified_absences.less_than_or_equal", params: { value: 2 } },
    ]);
  });

  it("maps send statuses to their badge keys", () => {
    expect(describeSendStatus("first_batch").key).toBe("tutorials.sendStatus.first_batch");
    expect(describeSendStatus("daily_quota").key).toBe("tutorials.sendStatus.daily_quota");
  });

  it("renders priority values as the engine sorted them", () => {
    expect(describePriority({ id: "level", ladderDistance: 0, levelCode: "5" }).key).toBe(
      "tutorials.priority.levelSame",
    );
    expect(describePriority({ id: "level", ladderDistance: 1, levelCode: "5-" })).toEqual({
      key: "tutorials.priority.levelBelow",
      params: { n: 1 },
    });
    expect(describePriority({ id: "attendance", rate: 0.923 })).toEqual({
      key: "tutorials.priority.attendance",
      params: { pct: 92 },
    });
    expect(describePriority({ id: "playing_side", match: "exact", side: "left" }).key).toBe(
      "tutorials.priority.playingSide.exact",
    );
  });
});

describe("describeVerdict + resolveText", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    `${key}${params && Object.keys(params).length ? JSON.stringify(params) : ""}`;

  it("reads 'invited in round 1, position 3 — waiting' for a queued student", () => {
    const explain: InviteExplain = {
      playerId: "7",
      name: "Hugo",
      stage: "invited",
      details: { roundNumber: 1, rank: 3, sendStatus: "queued" },
    };
    const verdict = describeVerdict(explain);
    expect(verdict.reasons).toEqual([]);
    // The nested status key is translated with the plain params in scope (the
    // fake `t` echoes them), then handed back under `status`.
    expect(resolveText(t, verdict.headline)).toBe(
      'tutorials.understandInvites.invitedPosition{"round":1,"rank":3,"status":"tutorials.sendStatus.queued{\\"round\\":1,\\"rank\\":3}"}',
    );
  });

  it("lists one reason line per failed eligibility rule", () => {
    const verdict = describeVerdict({
      playerId: "9",
      name: "Eve",
      stage: "eligibility",
      details: {
        failures: [
          failure({ ladder_distance: 2 }),
          failure({ attribute: "unjustified_absences", actual: 4, threshold: 2 }),
        ],
      },
    });
    expect(verdict.headline.key).toBe("tutorials.stages.eligibility");
    expect(verdict.reasons.map((r) => r.key)).toEqual([
      "tutorials.eligibility.levelBelow",
      "tutorials.eligibility.absencesOver",
    ]);
  });

  it("prefixes per-round failures with the round and keeps the inner params", () => {
    const verdict = describeVerdict({
      playerId: "9",
      name: "Eve",
      stage: "no_round_matched",
      details: { rounds: [{ number: 2, failures: [failure({ ladder_distance: 2 })] }] },
    });
    expect(resolveText(t, verdict.reasons[0])).toBe(
      'tutorials.understandInvites.roundReason{"round":2,"n":2,"reason":"tutorials.eligibility.levelBelow{\\"round\\":2,\\"n\\":2}"}',
    );
  });
});
