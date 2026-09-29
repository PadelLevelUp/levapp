/**
 * classes.join-requests rule 18 (PAD-461, part 2 of PAD-427): what the coach ↔
 * student chat bubble for an academy join-request ask offers.
 *
 * The ask is mirrored into the conversation as a message carrying
 * `metadata.joinRequest {id, status}` (the status frozen at send time, always
 * `pending` — only the ask itself is ever sent with that status; a decision or
 * "spot taken" reply is a separate, plain message). What the bubble offers is
 * derived from the request's LIVE row (`GET /app/class-join-requests`), not
 * the frozen metadata, so a decision made elsewhere (the class sheet, the
 * "Pedidos de Aula" list) is reflected here too. Pure, shared by both shells.
 */
export type JoinRequestLiveStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "superseded";

/** `metadata.joinRequest` on the ask message. */
export interface JoinRequestMessageMeta {
  id: number;
  status: JoinRequestLiveStatus;
}

/** The request's current row, as `GET /app/class-join-requests` lists it. */
export interface JoinRequestLive {
  id: number;
  status: JoinRequestLiveStatus;
}

export type JoinRequestBubbleKind =
  /** The reader is the coach and the request is still pending: Accept / Decline. */
  | "actions"
  /** The request has been decided, withdrawn or superseded: show its status. */
  | "outcome"
  /** Not the ask, the live row is still loading, or the reader is the student. */
  | "none";

export interface JoinRequestBubbleState {
  kind: JoinRequestBubbleKind;
  status: JoinRequestLiveStatus | undefined;
}

/**
 * @param meta  the ask message's `metadata.joinRequest`
 * @param live  the request's live row; `undefined` while it is still loading,
 *              `null` when the list does not contain it
 * @param own   whether the reader sent the message — the student's own copy
 *              never offers actions (rule 18, last bullet)
 */
export function joinRequestBubbleState(
  meta: JoinRequestMessageMeta | null | undefined,
  live: JoinRequestLive | null | undefined,
  { own }: { own: boolean }
): JoinRequestBubbleState {
  if (!meta) return { kind: "none", status: undefined };
  if (own) return { kind: "none", status: meta.status };
  if (live === undefined) return { kind: "none", status: meta.status };
  if (live === null) return { kind: "outcome", status: meta.status };
  if (live.status === "pending") return { kind: "actions", status: "pending" };
  return { kind: "outcome", status: live.status };
}
