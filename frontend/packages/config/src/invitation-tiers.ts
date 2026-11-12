/**
 * PAD-920 (notifications.config rule 20): the tiers editor's data and pure edits, one copy for both
 * shells. Moved out of web's InvitationGroupsSection so the iOS tiers editor (it had no groups editor
 * before the swap) offers exactly the same attributes, operations and limits. The wire stays
 * `invitationGroups`; the coach's list and the students' list are the two fixed tiers before them.
 */
import type { EngineVersion, GroupRule, InvitationGroup } from "@levelup/types";

export interface TierOperation {
  id: string;
  labelKey: string;
  /** Offered only to a coach on the new engine (an old-engine save of it is refused, 400). */
  newEngineOnly?: boolean;
}

export interface TierAttribute {
  id: string;
  labelKey: string;
  operations: TierOperation[];
  valueType: "none" | "number" | "percentage" | "select";
  valueOptions?: Array<{ id: string; labelKey: string }>;
}

/** The most groups a coach may have (today's web limit, `groups.length < 10`). */
export const MAX_TIERS = 10;

/** The two fixed tiers before the groups, in the engine's tier order (notifications.engine-tiers rule 5). */
export const FIXED_TIERS = [
  { index: 0, labelKey: "calendar.detail.tierCoachList" },
  { index: 1, labelKey: "calendar.detail.tierWaitingList" },
] as const;

export const TIER_ATTRIBUTES: TierAttribute[] = [
  {
    id: "level",
    labelKey: "settings.invitationGroups.attributes.level",
    operations: [
      { id: "same_as_vacancy", labelKey: "settings.invitationGroups.operations.sameAsVacancy" },
      { id: "one_above_vacancy", labelKey: "settings.invitationGroups.operations.oneAboveVacancy" },
      { id: "one_below_vacancy", labelKey: "settings.invitationGroups.operations.oneBelowVacancy" },
      { id: "all_above_vacancy", labelKey: "settings.invitationGroups.operations.allAboveVacancy" },
      { id: "all_below_vacancy", labelKey: "settings.invitationGroups.operations.allBelowVacancy" },
    ],
    valueType: "none",
  },
  {
    id: "side",
    labelKey: "settings.invitationGroups.attributes.side",
    operations: [
      // PAD-564: the stored operation stays `same_as_vacancy`; the copy is SideBalanceHelp's.
      { id: "same_as_vacancy", labelKey: "settings.invitationGroups.operations.balanceSides" },
      // PAD-920 (notifications.config rule 20): an "other side" tier, the new engine's only.
      { id: "different_from_vacancy", labelKey: "settings.invitationGroups.operations.otherSide", newEngineOnly: true },
    ],
    valueType: "none",
  },
  {
    id: "has_makeups",
    labelKey: "settings.invitationGroups.attributes.hasMakeups",
    operations: [
      { id: "is_true", labelKey: "settings.invitationGroups.operations.hasPendingMakeup" },
    ],
    valueType: "none",
  },
  {
    id: "unjustified_absences",
    labelKey: "settings.invitationGroups.attributes.unjustifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.invitationGroups.operations.lessThan" },
      { id: "equals", labelKey: "settings.invitationGroups.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.invitationGroups.operations.atMost" },
    ],
    valueType: "number",
  },
  {
    id: "justified_absences",
    labelKey: "settings.invitationGroups.attributes.justifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.invitationGroups.operations.lessThan" },
      { id: "equals", labelKey: "settings.invitationGroups.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.invitationGroups.operations.atMost" },
    ],
    valueType: "number",
  },
  {
    id: "attendance_rate",
    labelKey: "settings.invitationGroups.attributes.attendanceRate",
    operations: [
      { id: "greater_than", labelKey: "settings.invitationGroups.operations.greaterThan" },
      { id: "greater_than_or_equal", labelKey: "settings.invitationGroups.operations.atLeast" },
    ],
    valueType: "percentage",
  },
  {
    id: "subscription_status",
    labelKey: "settings.invitationGroups.attributes.subscription",
    operations: [
      { id: "equals", labelKey: "settings.invitationGroups.operations.is" },
    ],
    valueType: "select",
    valueOptions: [
      { id: "active", labelKey: "settings.invitationGroups.subscriptionActive" },
      { id: "inactive", labelKey: "settings.invitationGroups.subscriptionInactive" },
    ],
  },
];

/** The attributes a coach on `engineVersion` may pick, the new engine's own operations dropped for `old`. */
export function tierAttributesFor(engineVersion: EngineVersion | undefined): TierAttribute[] {
  if (engineVersion === "new") return TIER_ATTRIBUTES;
  return TIER_ATTRIBUTES.map((a) => ({ ...a, operations: a.operations.filter((op) => !op.newEngineOnly) }));
}

/** The rule a freshly picked attribute starts with: its first operation and no value. */
export function ruleForAttribute(attributeId: string): GroupRule {
  const attr = TIER_ATTRIBUTES.find((a) => a.id === attributeId);
  return { attribute: attributeId, operation: attr?.operations[0]?.id ?? "", value: undefined };
}

/** Move a group from one place to another (drag and drop, or the iOS up/down buttons). */
export function moveTier(groups: InvitationGroup[], from: number, to: number): InvitationGroup[] {
  if (from === to || from < 0 || to < 0 || from >= groups.length || to >= groups.length) return groups;
  const next = [...groups];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const DEFAULT_INVITATION_GROUPS: InvitationGroup[] = [
  {
    id: "default_1",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_2",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_3",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
    ],
  },
  {
    id: "default_4",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
    ],
  },
  {
    id: "default_5",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_6",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_7",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
    ],
  },
  {
    id: "default_8",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
    ],
  },
];

/** PAD-564 (notifications.groups rule 6a): the balancing examples under a side rule. */
export const SIDE_BALANCE_EXAMPLES = ["example1", "example2", "example3"] as const;
