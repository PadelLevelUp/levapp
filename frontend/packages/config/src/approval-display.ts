/**
 * PAD-574 (notifications.semi-auto-approval rules 4 and 7): how the two approval cards present a
 * bundle, one copy for both shells. Display only — a decision still reaches the server per
 * vacancy, and the engine still invites vacancy by vacancy.
 *
 * - A vacancy a student freed ("falta") is its own block, with that student's name; never grouped.
 * - Open spots (a never-filled place, `openSpot` / no declined player) with the same side AND the
 *   same ordered queue are one block, counted ("3 vagas · prioridade esquerda"). The key includes
 *   the side because the label names one side; identical lists on different sides stay apart.
 * - Every queue shows its first APPROVAL_QUEUE_PREVIEW players; "Ver mais" reveals the rest.
 */
import type { ApprovalQueuePlayer, ApprovalVacancyInfo, PlayerSide } from "@levelup/types";

export const APPROVAL_QUEUE_PREVIEW = 5;

export type ApprovalDisplayGroup =
  | { kind: "declined"; key: string; vacancyIds: number[]; declinedPlayerName: string | null; queue: ApprovalQueuePlayer[] }
  | { kind: "open"; key: string; vacancyIds: number[]; count: number; side: PlayerSide | null; queue: ApprovalQueuePlayer[] };

export function isOpenSpot(v: Pick<ApprovalVacancyInfo, "declinedPlayerId" | "openSpot">): boolean {
  return v.openSpot === true || v.declinedPlayerId == null;
}

export function approvalDisplayGroups(vacancies: ApprovalVacancyInfo[]): ApprovalDisplayGroup[] {
  const groups: ApprovalDisplayGroup[] = [];
  const openByKey = new Map<string, Extract<ApprovalDisplayGroup, { kind: "open" }>>();
  for (const v of vacancies) {
    if (!isOpenSpot(v)) {
      groups.push({ kind: "declined", key: `declined-${v.vacancyId}`, vacancyIds: [v.vacancyId], declinedPlayerName: v.declinedPlayerName ?? null, queue: v.queue });
      continue;
    }
    const side = v.side ?? null;
    const key = `open-${side ?? "any"}-${v.queue.map((p) => p.id).join(",")}`;
    const existing = openByKey.get(key);
    if (existing) {
      existing.vacancyIds.push(v.vacancyId);
      existing.count += 1;
      continue;
    }
    const group = { kind: "open" as const, key, vacancyIds: [v.vacancyId], count: 1, side, queue: v.queue };
    openByKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

/** The rows a list shows: all of them when expanded, else the first APPROVAL_QUEUE_PREVIEW. */
export function approvalQueuePreview<P>(queue: P[], expanded: boolean): { shown: P[]; hidden: number } {
  if (expanded || queue.length <= APPROVAL_QUEUE_PREVIEW) return { shown: queue, hidden: 0 };
  return { shown: queue.slice(0, APPROVAL_QUEUE_PREVIEW), hidden: queue.length - APPROVAL_QUEUE_PREVIEW };
}

/** How many of a group's vacancies are stale (filled or expired), for "N de M vagas já preenchidas". */
export function staleCount(group: Pick<ApprovalDisplayGroup, "vacancyIds">, staleVacancyIds: number[]): number {
  return group.vacancyIds.filter((id) => staleVacancyIds.includes(id)).length;
}
