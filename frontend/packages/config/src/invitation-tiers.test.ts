import { describe, expect, it } from "vitest";

import {
  DEFAULT_INVITATION_GROUPS,
  MAX_TIERS,
  moveTier,
  perTierAfterMove,
  perTierAfterRemove,
  perTierAligned,
  ruleForAttribute,
  tierAttributesFor,
} from "./invitation-tiers";
import { localeT } from "./testkit/locale-t";

const sideOps = (v?: "old" | "new") => tierAttributesFor(v).find((a) => a.id === "side")!.operations.map((o) => o.id);

describe("PAD-920 the tiers editor's shared data (notifications.config rule 20)", () => {
  it("offers the other-side tier to a coach on the new engine only", () => {
    expect(sideOps("new")).toEqual(["same_as_vacancy", "different_from_vacancy"]);
    expect(sideOps("old")).toEqual(["same_as_vacancy"]);
    expect(sideOps(undefined)).toEqual(["same_as_vacancy"]);
    expect(localeT("pt")("settings.invitationGroups.operations.otherSide")).toBe("Lado contrário");
    expect(localeT("en")("settings.invitationGroups.operations.otherSide")).toBe("Other side");
  });

  it("starts a picked attribute at its first operation, and moves a group", () => {
    expect(ruleForAttribute("unjustified_absences")).toEqual({ attribute: "unjustified_absences", operation: "less_than", value: undefined });
    const [a, b, c] = DEFAULT_INVITATION_GROUPS;
    expect(moveTier([a, b, c], 0, 2).map((g) => g.id)).toEqual([b.id, c.id, a.id]);
    expect(moveTier([a, b], 0, 5)).toEqual([a, b]);
    expect(MAX_TIERS).toBe(10);
  });

  it("keeps perTier aligned with the tiers: 2 fixed entries, then one per group", () => {
    expect(perTierAligned(undefined, 2)).toEqual([null, null, null, null]);
    expect(perTierAligned(["a", "b", "c", "d", "e"], 2)).toEqual(["a", "b", "c", "d"]);
    // Groups g0, g1, g2 sit at tiers 2, 3, 4.
    expect(perTierAfterMove(["c", "w", "g0", "g1", "g2"], 0, 2)).toEqual(["c", "w", "g1", "g2", "g0"]);
    expect(perTierAfterRemove(["c", "w", "g0", "g1"], 1)).toEqual(["c", "w", "g0"]);
  });
});
