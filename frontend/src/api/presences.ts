import type { AbsenceJustification, ClassInstance, Presence, PresenceStatus } from "@/types";
import { api } from "@/api/client";

export async function confirmClassPresences(
  classInstance: ClassInstance,
  presences: Array<{
    playerId: string;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>
): Promise<Presence[]> {
  const res = await api.post(
    `/api/app/class_instance/presences/confirm`,
    { classInstance, presences }
  );
  return res.data;
}

export async function getClassPresences(
  lessonInstanceId: string
): Promise<Presence[]> {
  const res = await api.get(
    `/api/app/class_instance/${lessonInstanceId}/presences`
  );
  return res.data;
}