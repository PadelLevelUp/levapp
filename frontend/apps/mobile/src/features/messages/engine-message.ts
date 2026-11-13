/**
 * PAD-920 — the new invitation engine's messages on iOS (notifications.invitations NB1, NB5;
 * dashboard.blocks NA3). The bubble's state itself comes from `@levelup/config`
 * `engineInviteState`; this holds the two iOS-only pieces around it, pure so they are unit-tested
 * without the thread screen: what an answer writes into the cached message, and where an
 * `engine_alert` message's class link goes.
 */
import type { EngineInviteStateName, EngineRespondAction } from "@levelup/types";
import { joinRefusalOf } from "@levelup/config";
import { nativeRouteForWebPath } from "@/features/dashboard/routes";

/** What the cached message's metadata takes after an answer; null writes nothing. */
export type EngineAnswerPatch = {
  state: EngineInviteStateName;
  response?: "yes" | "no";
  answeredBy?: "student" | "coach";
} | null;

/**
 * NB5: the SERVER's action decides the state written, not the tap. A Yes the engine answered
 * `sorry` stays `sorry` (never "declined"); `class_started` writes nothing, because the started
 * state is derived from `startsAt` (NB1). The live `message_edited` keeps it current after this.
 */
export function engineAnswerPatch(action: EngineRespondAction | string | undefined): EngineAnswerPatch {
  switch (action) {
    case "confirmed":
      return { state: "answered", response: "yes", answeredBy: "student" };
    case "declined":
      return { state: "answered", response: "no", answeredBy: "student" };
    case "sorry":
      return { state: "sorry" };
    case "closed_same_hour":
      return { state: "closed_same_hour" };
    default:
      return null;
  }
}

/**
 * NB2 (NOTIFICATIONS-INVITATIONS-127): an answer the route refuses because the class was cancelled
 * (409 `class_cancelled`) writes the cancelled state, so the bubble reads the same line as the live
 * one, never a generic error. Any other failure writes nothing (the caller shows its error).
 */
export function engineRefusalPatch(err: unknown): EngineAnswerPatch {
  return joinRefusalOf(err)?.code === "class_cancelled" ? { state: "class_cancelled" } : null;
}

/**
 * NB5: apply an answer to the cached message only while it is still in the state it was tapped in.
 * A live `message_edited` that landed while the answer was in flight is newer (a sorry already
 * re-offered), so the answer must not write the older state back over it.
 */
export function applyEngineAnswer<M extends { metadata?: Record<string, unknown> | null }>(
  message: M,
  tappedState: unknown,
  patch: EngineAnswerPatch
): M {
  if (!patch || message.metadata?.state !== tappedState) return message;
  return { ...message, metadata: { ...message.metadata, ...patch } };
}

export type EngineAlertClassRoute = { pathname: "/class/[id]"; params: { id: string } & Record<string, string> };

/**
 * NA3 (DASHBOARD-BLOCKS-53): an `engine_alert` message links to its class, from its `href` (the
 * dashboard's `class_href` shape, with the date) when it has one, else from the materialised
 * instance id alone: the native class screen fetches the rest (`instanceIdFromParams`).
 */
export function engineAlertClassRoute(
  metadata: Record<string, unknown> | null | undefined
): EngineAlertClassRoute | null {
  if (metadata?.engine !== "new") return null;
  if (typeof metadata.href === "string") {
    const route = nativeRouteForWebPath(metadata.href);
    if (route?.pathname === "/class/[id]" && route.params?.id) {
      return { pathname: "/class/[id]", params: { ...route.params, id: route.params.id } };
    }
  }
  const id = Number(metadata.lessonInstanceId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { pathname: "/class/[id]", params: { id: `lessoninstance-${id}` } };
}
