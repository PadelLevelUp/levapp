/** The status line of the student's join block (calendar.event-detail rule 26, PAD-842): the i18n key
 * for their latest request for this class, or null for no line. One helper for web and iOS. */
export type JoinRequestStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "superseded";

export function joinRequestStatusKey(request: { status: JoinRequestStatus | string } | null | undefined): string | null {
  // An accepted request stays `accepted` after its place is gone (the student cancelled, or the coach
  // removed them), and the block shows only then: "Está marcado!" beside "Pedir para entrar".
  if (!request || request.status === "withdrawn" || request.status === "accepted") return null;
  return `calendar.joinRequest.${request.status}`;
}
