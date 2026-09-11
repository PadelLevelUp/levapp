/**
 * classes.class-requests rule 6 (PAD-281, B-077): what a class-request chat
 * message offers the reader.
 *
 * The coach's proposal reaches the student as a chat message ("Do you
 * accept?"), so the answers have to live on that bubble. A bubble is a record
 * of one moment; the request moves on (another round, an accept, a withdraw),
 * so what it offers is derived from the request's LIVE row, not from the
 * metadata frozen at send time. Pure, shared by both shells.
 */
export type ClassRequestLiveStatus = "pending" | "countered" | "accepted" | "declined" | "withdrawn";

export interface ClassRequestSlot {
  date: string;
  startTime: string;
  endTime: string;
}

/** `metadata.classRequest` on every class-request message (rule 6). */
export interface ClassRequestMessageMeta {
  id: number;
  status: ClassRequestLiveStatus;
  kind: "requested" | "proposed" | "countered" | "accepted" | "declined" | "withdrawn";
  /** The time this message is about (absent on messages sent before PAD-281). */
  slot?: ClassRequestSlot;
}

/** The request's current row, as `GET /app/class-requests` lists it. */
export interface ClassRequestLive extends ClassRequestSlot {
  id: number;
  status: ClassRequestLiveStatus;
}

export type ClassRequestBubbleKind =
  /** The reader is the other side and this proposal is the one on the table: Accept / Decline / Propose another time. */
  | "actions"
  /** The reader sent this proposal and it is still unanswered. */
  | "waiting"
  /** The request has been decided (or is out of sight): show its status. */
  | "outcome"
  /** A later round replaced this proposal: nothing to answer here any more. */
  | "superseded"
  /** Not a proposal, or the live row is still loading: plain text. */
  | "none";

export interface ClassRequestBubbleState {
  kind: ClassRequestBubbleKind;
  status: ClassRequestLiveStatus | undefined;
}

function sameSlot(a: ClassRequestSlot, b: ClassRequestSlot): boolean {
  return a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime;
}

/**
 * @param meta  the message's `metadata.classRequest`
 * @param live  the request's live row; `undefined` while it is still loading,
 *              `null` when the list does not contain it
 * @param own   whether the reader sent the message
 */
export function classRequestBubbleState(
  meta: ClassRequestMessageMeta | null | undefined,
  live: ClassRequestLive | null | undefined,
  { own }: { own: boolean }
): ClassRequestBubbleState {
  if (!meta) return { kind: "none", status: undefined };
  // A proposal travels one way: the coach's `proposed` waits for the student
  // (`countered`), the student's `countered` waits for the coach (`pending`).
  const awaiting = meta.kind === "proposed" ? "countered" : meta.kind === "countered" ? "pending" : null;
  if (awaiting === null) return { kind: "none", status: meta.status };
  if (live === undefined) return { kind: "none", status: meta.status };
  if (live === null) return { kind: "outcome", status: meta.status };
  if (live.status === "pending" || live.status === "countered") {
    if (live.status !== awaiting) return { kind: "superseded", status: live.status };
    if (meta.slot && !sameSlot(meta.slot, live)) return { kind: "superseded", status: live.status };
    return { kind: own ? "waiting" : "actions", status: live.status };
  }
  return { kind: "outcome", status: live.status };
}
