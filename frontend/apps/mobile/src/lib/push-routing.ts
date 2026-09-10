/**
 * Push tap-routing contract — messaging.push-notifications rule 7 (PAD-240).
 *
 * The backend's `data` payload says where a tap lands. Two shapes exist:
 *   - `{ type: "message", conversationId }` → the conversation thread. Every
 *     push backed by a Message row uses this: direct messages AND the
 *     notification engine's system messages (invitations, reminders, spot
 *     filled, waiting-list offers, cancellations to the coach), because the
 *     thing the user acts on lives in the thread.
 *   - `{ type: "class", classInstanceId }` → the class screen. Reserved for
 *     pushes with no message behind them.
 *
 * A `classInstanceId` on a message push is context only and must never win:
 * `app/class/[id].tsx` rebuilds its CalendarEvent from route params
 * (`model`, `originalId`, `date`) that a push cannot carry, so `/class/<id>`
 * from a push renders "this class could not be found" — the PAD-240 defect.
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
  if (payload.type === "class" && payload.classInstanceId != null) {
    return `/class/${payload.classInstanceId}`;
  }
  return null;
}
