import type {
  AbsenceJustification,
  ApprovalBundle,
  AttendanceGranularity,
  ClassInstance,
  PendingValidation,
  PendingValidationCount,
  Presence,
  PresenceStats,
  PresenceStatus,
  PresenceTrend,
} from "@levelup/types";
import { getApi } from "../client";

export async function confirmClassPresences(
  classInstance: ClassInstance,
  presences: Array<{
    playerId: string;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>
): Promise<{
  presences: Presence[];
  notifiedPlayers: { id: string; name: string }[];
  /** Present in semi-automatic mode when absences created vacancies awaiting approval */
  approvalBundle?: ApprovalBundle;
}> {
  const res = await getApi().post(`/app/class_instance/presences/confirm`, {
    classInstance,
    presences,
  });
  return res.data;
}

export async function getClassPresences(
  lessonInstanceId: string
): Promise<Presence[]> {
  const res = await getApi().get(
    `/app/class_instance/${lessonInstanceId}/presences`
  );
  return res.data;
}

/* ------------------------------------------------------------------ */
/* PAD-140 — the coach-facing Presences tab                            */
/* ------------------------------------------------------------------ */

/**
 * Window shared by the three Presences-tab reads. `from`/`to` are only honoured
 * together; omit both to get the server's trailing-90-day default.
 */
export interface PresenceRangeParams {
  from?: string;
  to?: string;
}

/** Per-player aggregates across the calling coach's roster. Coach-only (403). */
export async function getPresenceStats(
  params: PresenceRangeParams = {}
): Promise<PresenceStats> {
  const res = await getApi().get("/app/presence_stats", { params });
  return res.data;
}

/** Roster-wide attended-class counts over time, gap-filled server-side. */
export async function getPresenceTrend(
  params: PresenceRangeParams & { granularity?: AttendanceGranularity } = {}
): Promise<PresenceTrend> {
  const res = await getApi().get("/app/presence_trend", { params });
  return res.data;
}

/**
 * Already-run classes split into pending vs validated.
 *
 * The listing behind the dashboard's `pending_validations` count, which only
 * exposes a number and a deep link.
 */
export async function getPendingValidation(
  params: PresenceRangeParams = {}
): Promise<PendingValidation> {
  const res = await getApi().get("/app/class_instances/pending_validation", {
    params,
  });
  return res.data;
}

/**
 * How many classes in the window still need validating (PAD-190 / PAD-201).
 *
 * The same helper the coach dashboard's validation card reads
 * (`attendance.validation` rule 18), so the tab trigger and the card can only
 * ever show one number.
 */
export async function getPendingValidationCount(
  params: PresenceRangeParams = {}
): Promise<PendingValidationCount> {
  const res = await getApi().get("/app/class_instances/pending_validation/count", {
    params,
  });
  return res.data;
}

/**
 * Reopen a validated class for editing.
 *
 * There is no matching "validate" call: `confirmClassPresences` already stamps
 * `validated=true` on every row it writes, so validating is just marking
 * attendance. Only the reverse needs its own endpoint.
 */
export async function unvalidateClass(
  lessonInstanceId: number | string
): Promise<{ lessonInstanceId: number; presences: Presence[] }> {
  const res = await getApi().post(
    `/app/class_instance/${lessonInstanceId}/presences/unvalidate`
  );
  return res.data;
}

/**
 * Validate one already-materialized class from the Presences tab.
 *
 * Thin wrapper over the same endpoint `confirmClassPresences` uses. That one
 * takes the full `ClassInstance` the calendar already has in hand; here the
 * caller only ever holds an instance id, and the service only needs the
 * `lessoninstance-` event-id prefix to route (it distinguishes a materialized
 * instance from a projected recurring occurrence). Writing the payload here
 * keeps the dialog from fabricating a half-empty ClassInstance to satisfy a
 * type it never uses.
 *
 * Recording attendance IS validating: `add_presences` stamps `validated=true`.
 */
export async function validateClassPresences(
  lessonInstanceId: number | string,
  presences: Array<{
    playerId: string | number;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>
): Promise<{ presences: Presence[] }> {
  const res = await getApi().post("/app/class_instance/presences/confirm", {
    classInstance: {
      id: `lessoninstance-${lessonInstanceId}`,
      originalId: String(lessonInstanceId),
    },
    presences,
  });
  return res.data;
}
