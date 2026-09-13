/**
 * Push tap-routing contract — messaging.push-notifications rule 7 (PAD-240).
 *
 * The backend's `data` payload says where a tap lands. Two shapes exist:
 *   - `{ type: "message", conversationId }` → the conversation thread. Every
 *     push backed by a Message row uses this: direct messages AND the
 *     notification engine's system messages (invitations, reminders, spot
 *     filled, waiting-list offers, cancellations to the coach), because the
 *     thing the user acts on lives in the thread.
 *   - `{ type: "class", classInstanceId }` → RETIRED (PAD-326). No producer
 *     since the join-request push took the message shape; ignored now.
 *
 * A `classInstanceId` on a message push is context only and must never win —
 * a message-backed push opens the THREAD because that is where the user acts
 * (the Yes/No, the reply), which is the rule's own merit. The old reason (the
 * class screen could not rebuild itself from an id) no longer holds: since
 * PAD-326 it resolves the instance from the id.
 *
 * Pure so it is unit-testable without expo-notifications.
 */
export type PushNotificationData = {
  type?: string;
  conversationId?: string | number;
  classInstanceId?: string | number;
};

export function routeForPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as PushNotificationData;

  if (payload.type === "message" && payload.conversationId != null) {
    return `/conversation/${payload.conversationId}`;
  }
  // PAD-326: the `class` type is retired (`messaging.push-notifications`
  // rule 7). It lost its last producer when the join-request push took the
  // message shape, and a type nobody sends must not be routable — a payload
  // that somehow carries it is ignored rather than sent somewhere. Note the
  // reason has changed: the class screen CAN now open from an id alone
  // (`calendar.event-detail` rule 15), so this is no longer "the destination is
  // broken", it is "we do not keep a branch alive for a case nothing emits".
  return null;
}
