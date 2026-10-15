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
import type { ApprovalEmptyQueueReason, ApprovalQueuePlayer, ApprovalVacancyInfo, PlayerSide } from "@levelup/types";

export const APPROVAL_QUEUE_PREVIEW = 5;

type ApprovalGroupBase = {
  key: string;
  vacancyIds: number[];
  queue: ApprovalQueuePlayer[];
  /** PAD-661 (rule 4b): why the queue is empty; `[]` for a non-empty queue or an older payload. */
  emptyQueueReasons: ApprovalEmptyQueueReason[];
};

export type ApprovalDisplayGroup =
  | (ApprovalGroupBase & { kind: "declined"; declinedPlayerName: string | null })
  | (ApprovalGroupBase & { kind: "open"; count: number; side: PlayerSide | null });

/** PAD-661 (rule 4b): the engine stages this build has a line for (the backend's CANDIDATE_STAGES minus the non-reasons). */
export const APPROVAL_EMPTY_REASON_STAGES = new Set([
  "declined_this_class",
  "already_invited",
  "eligibility",
  "excluded_by_coach",
  "inactive_account",
  "has_class_same_day",
  "unavailable",
  "auto_invites_off",
  "no_round_matched",
  "offered_another_spot",
]);

/**
 * PAD-661 (rule 4b): the i18n key of one "why nobody is suggested" line. An unknown stage (a newer
 * server) falls back to the generic line so nothing renders raw.
 */
export function approvalEmptyReasonKey(stage: string): string {
  return `notificationsUi.replacementApproval.emptyReason.${APPROVAL_EMPTY_REASON_STAGES.has(stage) ? stage : "other"}`;
}

/** The reasons a block shows under its empty state: only when the queue is empty, counts > 0. */
export function approvalEmptyReasons(v: Pick<ApprovalVacancyInfo, "queue" | "emptyQueueReasons">): ApprovalEmptyQueueReason[] {
  if (v.queue.length > 0) return [];
  return (v.emptyQueueReasons ?? []).filter((r) => r.count > 0);
}

/** The payload's flag wins; an older payload without it reads "no declined player" as open. */
export function isOpenSpot(v: Pick<ApprovalVacancyInfo, "declinedPlayerId" | "openSpot">): boolean {
  return v.openSpot ?? v.declinedPlayerId == null;
}

/** Rule 7a's label names one side; `both` and no side both read "any side" — and group together. */
export function approvalSideKey(side: PlayerSide | null | undefined): string {
  if (side === "left") return "notificationsUi.replacementApproval.sideLeft";
  if (side === "right") return "notificationsUi.replacementApproval.sideRight";
  return "notificationsUi.replacementApproval.sideAny";
}

function sideGroupKey(side: PlayerSide | null | undefined): "left" | "right" | "any" {
  return side === "left" || side === "right" ? side : "any";
}

/** The counted label of an open-spot block: `t(key, params)` with `side` already resolved by the caller. */
export function approvalGroupLabel(
  group: Extract<ApprovalDisplayGroup, { kind: "open" }>,
  sideLabel: string,
): { key: string; params: { count: number; side: string } } {
  return { key: "notificationsUi.replacementApproval.openSpotGroup", params: { count: group.count, side: sideLabel } };
}

/** What a block says when some of its spots are already filled or expired (rule 7a). */
export function approvalStaleLabel(
  group: Pick<ApprovalDisplayGroup, "vacancyIds">,
  stale: number,
): { key: string; params?: { stale: number; total: number } } {
  if (group.vacancyIds.length > 1) {
    return { key: "notificationsUi.replacementApproval.groupStale", params: { stale, total: group.vacancyIds.length } };
  }
  return { key: "notificationsUi.replacementApproval.noLongerNeeded" };
}

export function approvalDisplayGroups(vacancies: ApprovalVacancyInfo[]): ApprovalDisplayGroup[] {
  const groups: ApprovalDisplayGroup[] = [];
  const openByKey = new Map<string, Extract<ApprovalDisplayGroup, { kind: "open" }>>();
  for (const v of vacancies) {
    if (!isOpenSpot(v)) {
      groups.push({ kind: "declined", key: `declined-${v.vacancyId}`, vacancyIds: [v.vacancyId], declinedPlayerName: v.declinedPlayerName ?? null, queue: v.queue, emptyQueueReasons: approvalEmptyReasons(v) });
      continue;
    }
    const side = v.side ?? null;
    const key = `open-${sideGroupKey(side)}-${v.queue.map((p) => p.id).join(",")}`;
    const existing = openByKey.get(key);
    if (existing) {
      existing.vacancyIds.push(v.vacancyId);
      existing.count += 1;
      continue;
    }
    // Grouped spots share side and (empty) queue, so the first one's reasons stand for the block.
    const group = { kind: "open" as const, key, vacancyIds: [v.vacancyId], count: 1, side, queue: v.queue, emptyQueueReasons: approvalEmptyReasons(v) };
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
