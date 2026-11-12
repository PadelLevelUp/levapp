/**
 * PAD-548 (calendar.event-detail rules 16–18): the invitee outcome table, read by both shells.
 * The outcome itself is decided by the backend serializer; these maps only turn it into an i18n
 * key, a tone, and the next outcome after a live event or a coach action.
 */
import type { InvitationOutcome } from "@levelup/types";

export const INVITATION_OUTCOME_KEY: Record<InvitationOutcome, string> = {
  accepted: "calendar.detail.outcomeAccepted",
  declined: "calendar.detail.outcomeDeclined",
  withdrawn: "calendar.detail.outcomeWithdrawn",
  pending: "calendar.detail.outcomePending",
  spot_filled: "calendar.detail.outcomeSpotFilled",
  expired: "calendar.detail.outcomeExpired",
  // PAD-920 (ND1): a new-engine session's outcomes.
  busy_same_hour: "calendar.detail.outcomeBusySameHour",
  sorry: "calendar.detail.outcomeSorry",
  not_counting: "calendar.detail.outcomeNotCounting",
};

export type InvitationOutcomeTone = "success" | "destructive" | "warning" | "muted" | "outline";

export const INVITATION_OUTCOME_TONE: Record<InvitationOutcome, InvitationOutcomeTone> = {
  accepted: "success",
  declined: "destructive",
  withdrawn: "muted",
  pending: "outline",
  spot_filled: "warning",
  expired: "muted",
  busy_same_hour: "muted",
  sorry: "warning",
  not_counting: "outline",
};

/**
 * Rule 17: which actions a row offers. `accepted`, `withdrawn`, `spot_filled`, `expired` offer none.
 * PAD-920: a new-engine invitation that stopped counting is still open, so it offers what `pending`
 * does; `sorry` and `busy_same_hour` are closed and offer none.
 */
export function inviteeActionsFor(outcome: InvitationOutcome): Array<"accept" | "decline" | "delete"> {
  if (outcome === "pending" || outcome === "not_counting") return ["accept", "decline", "delete"];
  if (outcome === "declined") return ["accept"];
  return [];
}

/** The `notification_responded` live event's `response` → the row's new outcome (null: unknown, re-fetch). */
export function outcomeAfterResponse(response: string): InvitationOutcome | null {
  switch (response) {
    case "yes":
      return "accepted";
    case "no":
      return "declined";
    case "spot_filled":
      return "spot_filled";
    case "withdrawn":
      return "withdrawn";
    case "expired":
      return "expired";
    default:
      return null;
  }
}

/** A coach action's server answer (`coach_respond`, or the DELETE) → the row's new outcome. */
export function outcomeAfterCoachAction(action: string): InvitationOutcome | null {
  switch (action) {
    case "confirmed":
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "withdrawn":
      return "withdrawn";
    case "spot_filled":
      return "spot_filled";
    case "expired":
      return "expired";
    case "pending":
      return "pending";
    // PAD-920: the new engine's answers (`{action}` of /coach_respond); the old engine never sends these.
    case "sorry":
      return "sorry";
    case "closed_same_hour":
      return "busy_same_hour";
    case "class_started":
      return "expired";
    case "reoffered":
      return "pending";
    default:
      return null;
  }
}

/** The `status` that goes with an outcome, kept in step so older readers of `status` stay right. */
export function statusForOutcome(outcome: InvitationOutcome): "sent" | "confirmed" | "expired" {
  if (outcome === "accepted") return "confirmed";
  if (outcome === "pending" || outcome === "not_counting") return "sent";
  return "expired";
}

/**
 * The small notes under an invitee's outcome label, in order (calendar.event-detail rule 16):
 * "recorded by the coach" (invitations rule 9) and, PAD-719, "moved from the previous spot" for an
 * invitation the engine moved to this class's other spot (invitations rule 18a). PAD-920 (ND1): a
 * new-engine invitation the engine re-offered reads "reopened" in place of the moved note. `id` is the
 * testID stem both shells render as `invitee-<id>-<playerId>`.
 */
export type InviteeNoteId = "recorded-by-coach" | "moved-from-spot" | "reopened";

export function inviteeNotes(inv: {
  answeredBy: "student" | "coach" | null;
  movedAt?: string | null;
  reofferedAt?: string | null;
}): Array<{ id: InviteeNoteId; key: string }> {
  const notes: Array<{ id: InviteeNoteId; key: string }> = [];
  if (inv.answeredBy === "coach") notes.push({ id: "recorded-by-coach", key: "calendar.detail.recordedByCoach" });
  if (inv.reofferedAt) notes.push({ id: "reopened", key: "calendar.detail.reopened" });
  else if (inv.movedAt) notes.push({ id: "moved-from-spot", key: "calendar.detail.movedFromPreviousSpot" });
  return notes;
}

/**
 * PAD-920 (ND2): "N pending" counts the invitations that still hold a spot — `pending` only, never
 * `not_counting`. An old-engine list has no `not_counting`, so its count is unchanged.
 */
export function pendingInviteCount(invitees: Array<{ outcome: InvitationOutcome }>): number {
  return invitees.filter((i) => i.outcome === "pending").length;
}

/**
 * PAD-920 (ND1): the row's secondary text for a new-engine invitation's tier, in the engine's tier
 * order (notifications.engine-tiers rule 5): 0 the coach's list, 1 the students' waiting list, then
 * the coach's groups, 2 → "grupo 1". Null for an old-engine row, which has no tier.
 */
export function inviteeTierText(tier: number | null | undefined): { key: string; params?: { n: number } } | null {
  if (tier == null || tier < 0) return null;
  if (tier === 0) return { key: "calendar.detail.tierCoachList" };
  if (tier === 1) return { key: "calendar.detail.tierWaitingList" };
  return { key: "calendar.detail.tierGroup", params: { n: tier - 1 } };
}
