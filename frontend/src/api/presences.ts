import type { AbsenceJustification, ClassInstance, Presence, PresenceStatus } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockPresences } from "@/data/mockData";

export async function confirmClassPresences(
  classInstance: ClassInstance,
  presences: Array<{
    playerId: string;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>
): Promise<Presence[]> {
  if (USE_MOCK_DATA) {
    console.log("[mock] confirmClassPresences", classInstance.id, presences);
    return mockPresences;
  }

  const res = await api.post(`/api/app/class_instance/presences/confirm`, {
    classInstance,
    presences,
  });
  return res.data;
}

export async function getClassPresences(
  lessonInstanceId: string
): Promise<Presence[]> {
  if (USE_MOCK_DATA) {
    return mockPresences.filter((p) => p.lessonInstanceId === lessonInstanceId);
  }

  const res = await api.get(
    `/api/app/class_instance/${lessonInstanceId}/presences`
  );
  return res.data;
}
