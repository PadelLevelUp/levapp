import type { AbsenceJustification, ApprovalBundle, ClassInstance, Presence, PresenceStatus } from "@levelup/types";
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
