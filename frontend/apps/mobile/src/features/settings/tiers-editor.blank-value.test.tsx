/**
 * eligibility.rules rule 13 / notifications.config rule 7d on iOS: the tiers editor (iOS's only groups
 * editor, new engine) marks a group rule that needs a value and has none, with the same test id as
 * web. The marking itself is `@levelup/config` `isRuleBlank` (rule-values.test.ts).
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { EngineConfig, InvitationGroup } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const pass = ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children);
  return { Select: pass, SelectTrigger: pass, SelectValue: () => null, SelectContent: pass, SelectItem: () => null };
});

import { TiersEditor } from "./tiers-editor";

const ENGINE: EngineConfig = {
  maxAtATime: 12,
  timing: { method: "fixed", betweenRoundsMinutes: 10, betweenGroupsMinutes: 20 },
  autoEntryBeforeAttendanceRequest: false,
  waitingListSideChoice: false,
};
const PAIR = { betweenRoundsMinutes: 10, betweenGroupsMinutes: 20 };

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

describe("a group rule with no value on iOS (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-20] marks a group rule with no value", async () => {
    const n = await renderNative(<TiersEditor groups={GROUPS} engine={ENGINE} pair={PAIR} onChange={() => {}} />);
    const marks = n.root.root.findAll((x) => x.props?.testID === "invitation-group-value-missing" && typeof x.type === "string");
    // attendance_rate and subscription_status with no value; never level, side or has_makeups, and 0 is a value.
    expect(marks).toHaveLength(2);
    expect(String(marks[0].props.children)).toBe("settings.invitationGroups.valueMissing");
  });
});
