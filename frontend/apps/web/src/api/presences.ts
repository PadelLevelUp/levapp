import "@/api/client";
import type { AbsenceJustification, ApprovalBundle, ClassInstance, Presence, PresenceStatus } from "@/types";
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
