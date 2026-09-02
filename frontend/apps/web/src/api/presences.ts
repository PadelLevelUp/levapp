import "@/api/client";
import type {
  AbsenceJustification,
  ApprovalBundle,
  AttendanceGranularity,
  ClassInstance,
  PendingValidation,
  Presence,
  PresenceStats,
  PresenceStatus,
  PresenceTrend,
} from "@/types";
import type { PresenceRangeParams } from "@levelup/api/src/resources/presences";
import * as presencesApi from "@levelup/api/src/resources/presences";
import { USE_MOCK_DATA } from "@/config";
import { mockPresences } from "@/data/mockData";

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
  if (USE_MOCK_DATA) {
    console.log("[mock] confirmClassPresences", classInstance.id, presences);
    return { presences: mockPresences, notifiedPlayers: [] };
  }

  return presencesApi.confirmClassPresences(classInstance, presences);
}

export async function getClassPresences(
  lessonInstanceId: string
): Promise<Presence[]> {
  if (USE_MOCK_DATA) {
    return mockPresences.filter((p) => p.lessonInstanceId === lessonInstanceId);
  }

  return presencesApi.getClassPresences(lessonInstanceId);
}

/* ------------------------------------------------------------------ */
/* PAD-140 — the coach-facing Presences tab                            */
/* ------------------------------------------------------------------ */

export type { PresenceRangeParams };

/**
 * These four have no mock branch on purpose. `USE_MOCK_DATA` exists for the
 * demo dataset in `@/data`, which has no presence aggregates to fake; the
 * Presences tab is coach-only and always talks to a real backend.
 */
export async function getPresenceStats(
  params: PresenceRangeParams = {}
): Promise<PresenceStats> {
  return presencesApi.getPresenceStats(params);
}

export async function getPresenceTrend(
  params: PresenceRangeParams & { granularity?: AttendanceGranularity } = {}
): Promise<PresenceTrend> {
  return presencesApi.getPresenceTrend(params);
}

export async function getPendingValidation(
  params: PresenceRangeParams = {}
): Promise<PendingValidation> {
  return presencesApi.getPendingValidation(params);
}

export async function unvalidateClass(
  lessonInstanceId: number | string
): Promise<{ lessonInstanceId: number; presences: Presence[] }> {
  return presencesApi.unvalidateClass(lessonInstanceId);
}

export async function validateClassPresences(
  lessonInstanceId: number | string,
  presences: Array<{
    playerId: string | number;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>
): Promise<{ presences: Presence[] }> {
  return presencesApi.validateClassPresences(lessonInstanceId, presences);
}
