/**
 * PAD-920 — the new invitation engine's messages on iOS (notifications.invitations NB1, NB5;
 * dashboard.blocks NA3). The bubble's state itself comes from `@levelup/config`
 * `engineInviteState`; this holds the two iOS-only pieces around it, pure so they are unit-tested
 * without the thread screen: what an answer writes into the cached message, and where an
 * `engine_alert` message's class link goes.
 */
import type { EngineInviteStateName, EngineRespondAction } from "@levelup/types";

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
    case "reoffered":
      return { state: "reoffered" };
    case "closed_same_hour":
      return { state: "closed_same_hour" };
    default:
      return null;
  }
}

export type EngineAlertClassRoute = { pathname: "/class/[id]"; params: { id: string } };

/**
 * NA3: an `engine_alert` message links to its class. The native class screen opens from the
 * materialised instance id alone and fetches the rest (`instanceIdFromParams`), the way a push or
 * a message's `lessonInstanceId` opens it.
 */
export function engineAlertClassRoute(
  metadata: Record<string, unknown> | null | undefined
): EngineAlertClassRoute | null {
  if (metadata?.engine !== "new") return null;
  const id = Number(metadata.lessonInstanceId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { pathname: "/class/[id]", params: { id: `lessoninstance-${id}` } };
}
