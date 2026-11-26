/**
 * classes.coach-requests-table rule 10 (PAD-795): the words a coach reads for a request's status,
 * on the table, the list and the chat bubbles, from one function shared by web and iOS. Every
 * (kind, status) is `classRequests.coachStatus.<status>` except a private `declined` that the
 * STUDENT decided (a proposal they refused), which has its own words.
 */
import type { CoachRequestRow } from "@levelup/types";

export function coachRequestStatusKey(
  kind: CoachRequestRow["kind"],
  status: CoachRequestRow["status"],
  decidedBy: CoachRequestRow["decidedBy"]
): string {
  if (kind === "private" && status === "declined" && decidedBy === "student") {
    return "classRequests.coachStatus.declinedByStudent";
  }
  return `classRequests.coachStatus.${status}`;
}
