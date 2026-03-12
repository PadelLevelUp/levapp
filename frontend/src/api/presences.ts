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
): Promise<{ presences: Presence[]; notifiedPlayers: { id: string; name: string }[] }> {
  if (USE_MOCK_DATA) {
    console.log("[mock] confirmClassPresences", classInstance.id, presences);
    return { presences: mockPresences, notifiedPlayers: [] };
  }

  const res = await api.post(`/app/class_instance/presences/confirm`, {
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
    `/app/class_instance/${lessonInstanceId}/presences`
  );
  return res.data;
}
