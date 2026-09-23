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
import { nativeRouteForWebPath, type DashboardRoute } from "@/features/dashboard/routes";

export type PushNotificationData = {
  type?: string;
  conversationId?: string | number;
  classInstanceId?: string | number;
  /**
   * PAD-408 (rule 12): the Message row the push announces. The thread opens ON
   * it (`?message=`) rather than at the newest message.
   */
  messageId?: string | number | null;
  /**
   * PAD-327: the destination as a WEB path — the same string the push's web
   * sibling carries in its `url`. Sent rather than derived from a `kind` so the
   * server keeps sole ownership of it: a second copy of that table in the app
   * disagrees with the server the day someone adds a kind, and disagreement
   * between the two channels is the defect this shape exists to end.
   */
  path?: string;
};

export function routeForPushData(
  data: unknown
): string | DashboardRoute | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as PushNotificationData;

  if (payload.type === "message" && payload.conversationId != null) {
    const messageId = payload.messageId;
    const isId =
      (typeof messageId === "number" && Number.isFinite(messageId)) ||
      (typeof messageId === "string" && /^\d+$/.test(messageId));
    return isId
      ? `/conversation/${payload.conversationId}?message=${messageId}`
      : `/conversation/${payload.conversationId}`;
  }
  // PAD-327: a push backed by neither a message nor a class names a plain
  // in-app destination by its web path, and the app maps it with the ONE mapper
  // it already uses for server-emitted paths. An unmapped path returns null:
  // the tap goes nowhere and nothing throws, because a crash on a notification
  // tap is the worst possible reading of "unknown".
  if (payload.type === "path" && payload.path) {
    return nativeRouteForWebPath(payload.path);
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
