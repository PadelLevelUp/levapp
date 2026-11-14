/**
 * eligibility.rules rule 13 / notifications.config rule 7d on web: the invitation groups editor (old
 * engine) and the tiers editor (new engine) mark a group rule that needs a value and has none. The
 * marking itself is `@levelup/config` `isRuleBlank` (rule-values.test.ts); this pins the row.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InvitationGroup } from "@/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { InvitationGroupsSection } from "./InvitationGroupsSection";

const GROUPS = [
  {
    id: "g1",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "g2",
    rules: [
      { attribute: "attendance_rate", operation: "greater_than" },
      { attribute: "unjustified_absences", operation: "less_than", value: 0 },
      { attribute: "subscription_status", operation: "equals" },
    ],
  },
] as unknown as InvitationGroup[];

const ENGINE = {
  method: "fixed" as const,
  perTier: undefined,
  fallback: { betweenRoundsMinutes: 10, betweenGroupsMinutes: 20 },
  onChange: () => {},
};

describe("a group rule with no value (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-20] marks a group rule with no value", () => {
    for (const engine of [undefined, ENGINE]) {
      const { unmount } = render(<InvitationGroupsSection groups={GROUPS} onChange={() => {}} engine={engine} />);
      // attendance_rate and subscription_status with no value; never level, side or has_makeups, and 0 is a value.
      const marks = screen.getAllByTestId("invitation-group-value-missing");
      expect(marks, engine ? "new engine" : "old engine").toHaveLength(2);
      for (const m of marks) expect(m).toHaveTextContent("settings.invitationGroups.valueMissing");
      unmount();
    }
  });
});
