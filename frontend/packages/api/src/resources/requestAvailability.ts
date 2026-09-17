import type { AvailabilityResponse, ParticipantCheck } from "@levelup/types";
import { getApi } from "../client";

/**
 * classes.availability (PAD-357) — the free windows for a coach and everyone
 * the student brings. Server-computed; the shells render them through
 * `@levelup/config`'s availability module (slotStarts / weeklyIntersection).
 * Named apart from `availability.ts`, which is the student's own blockers.
 */

/** classes.class-requests rule 12: one answer per username, never an oracle. */
export async function getRequestParticipants(coachId: string, usernames: string[]): Promise<ParticipantCheck[]> {
  const res = await getApi().get("/app/availability/participants", {
    params: { coachId, usernames: usernames.join(",") },
  });
  return res.data;
}

/** A bad participant answers 400 `{code: "INVALID_PARTICIPANTS", participants}`. */
export async function getCoachAvailability(params: {
  coachId: string;
  from: string;
  to: string;
  participants?: string[];
}): Promise<AvailabilityResponse> {
  const res = await getApi().get("/app/availability", {
    params: {
      coachId: params.coachId,
      from: params.from,
      to: params.to,
      ...(params.participants && params.participants.length ? { participants: params.participants.join(",") } : {}),
    },
  });
  return res.data;
}
