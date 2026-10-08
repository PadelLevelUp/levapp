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
};

export type InvitationOutcomeTone = "success" | "destructive" | "warning" | "muted" | "outline";

export const INVITATION_OUTCOME_TONE: Record<InvitationOutcome, InvitationOutcomeTone> = {
  accepted: "success",
  declined: "destructive",
  withdrawn: "muted",
  pending: "outline",
  spot_filled: "warning",
  expired: "muted",
};

/** Rule 17: which actions a row offers. `accepted`, `withdrawn`, `spot_filled`, `expired` offer none. */
export function inviteeActionsFor(outcome: InvitationOutcome): Array<"accept" | "decline" | "delete"> {
  if (outcome === "pending") return ["accept", "decline", "delete"];
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
    default:
      return null;
  }
}

/** The `status` that goes with an outcome, kept in step so older readers of `status` stay right. */
export function statusForOutcome(outcome: InvitationOutcome): "sent" | "confirmed" | "expired" {
  if (outcome === "accepted") return "confirmed";
  if (outcome === "pending") return "sent";
  return "expired";
}
