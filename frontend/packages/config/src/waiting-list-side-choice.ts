/**
 * PAD-920 (notifications.config rule 20; notifications.engine-settings rule 4): with the coach's
 * `waitingListSideChoice` on, a student joining a new-engine class's waiting list picks their side
 * relative to their own, "my side", "the other side" or "both", and the join sends `sides`. Otherwise
 * (the setting off, or an old-engine class) the choice is today's absolute one, and this returns null.
 */
import type { PlayerSide, WaitingListSides } from "@levelup/types";

export interface WaitingListSideOption {
  value: WaitingListSides;
  labelKey: string;
  testId: string;
}

export const WAITING_LIST_SIDE_OPTIONS: WaitingListSideOption[] = [
  { value: "own", labelKey: "calendar.waitingList.sideChoice.own", testId: "waiting-list-side-own" },
  { value: "other", labelKey: "calendar.waitingList.sideChoice.other", testId: "waiting-list-side-other" },
  { value: "both", labelKey: "calendar.waitingList.sideChoice.both", testId: "waiting-list-side-both" },
];

export function waitingListSideChoice(cls: {
  engineVersion?: "old" | "new" | null;
  waitingListSideChoice?: boolean | null;
}): WaitingListSideOption[] | null {
  return cls.engineVersion === "new" && cls.waitingListSideChoice === true ? WAITING_LIST_SIDE_OPTIONS : null;
}

/** The waiting-list join's body addition: `{sides}` with the relative choice, nothing otherwise. */
export function waitingListJoinSides(choice: WaitingListSides | null): { sides?: WaitingListSides } {
  return choice ? { sides: choice } : {};
}

/**
 * After a `side_full` refusal with the side choice on (notifications.config rule 20, criterion 76),
 * waiting joins the asked side's list in the choice's terms: "own" when that side is one of the
 * student's sides (a student who plays both, or has no side, counts as own), "other" when it is not.
 */
export function waitingListSidesFor(
  askedSide: "left" | "right",
  studentSide: PlayerSide | null | undefined,
): WaitingListSides {
  if (studentSide !== "left" && studentSide !== "right") return "own";
  return askedSide === studentSide ? "own" : "other";
}
