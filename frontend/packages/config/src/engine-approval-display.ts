/**
 * PAD-920 — how a new-engine session's queues read to the coach, one copy for both shells:
 * the approval card (notifications.semi-auto-approval N5) and the Understand-invites tutorial
 * (settings.tutorials NT1–NT4). Display only; the queue order is the server's.
 *
 * - A spot type is named by its side: left, right or either (`side: null`); its test ids use the
 *   same word (`tutorial-type-either`).
 * - A queue groups by tier in the order the server sent it: 0 the coach's list, 1 the students'
 *   waiting list, n ≥ 2 invitation group n-1. The wire carries no group name.
 * - The approval card's "Sim" counts the students the coach removed.
 */
import type {
  EngineApprovalGroup,
  EngineApprovalMeta,
  EngineApprovalRequest,
  EngineApprovalSpotType,
  EngineApprovalState,
  EngineQueueEntry,
  EngineSide,
  EngineSpotType,
  EngineVerdict,
} from "@levelup/types";

import type { I18nText } from "./invite-simulation";
import { engineStageLine } from "./engine-verdict-copy";

export type EngineSideSlug = "left" | "right" | "either";

export function engineSideSlug(side: EngineSide | undefined): EngineSideSlug {
  return side === "left" || side === "right" ? side : "either";
}

/** "Esquerda" / "Direita" / "Qualquer lado" (NT1): the players' side words, and the tutorial's "either". */
export function engineSideKey(side: EngineSide | undefined): string {
  if (side === "left") return "players.sideLeft";
  if (side === "right") return "players.sideRight";
  return "tutorials.engine.sideEither";
}

/** A tier's name: the coach's list, the students' list, then "group n". */
export function engineTierLabel(tier: number): I18nText {
  if (tier <= 0) return { key: "calendar.detail.tierCoachList" };
  if (tier === 1) return { key: "calendar.detail.tierWaitingList" };
  return { key: "calendar.detail.tierGroup", params: { n: tier - 1 } };
}

/** The queue cut into runs of one tier, keeping the server's order. */
export function engineTierGroups<E extends Pick<EngineQueueEntry, "tier">>(queue: E[]): Array<{ tier: number; entries: E[] }> {
  const groups: Array<{ tier: number; entries: E[] }> = [];
  for (const entry of queue) {
    const last = groups[groups.length - 1];
    if (last && last.tier === entry.tier) last.entries.push(entry);
    else groups.push({ tier: entry.tier, entries: [entry] });
  }
  return groups;
}

/**
 * NT2: each student no type queues, once, with the first type's verdict for them. Students in a
 * queue of any type are not left out.
 */
export function engineLeftOut(spotTypes: Pick<EngineSpotType, "queue" | "verdicts">[]): EngineVerdict[] {
  const queued = new Set(spotTypes.flatMap((type) => type.queue.map((e) => e.playerId)));
  const seen = new Set<string>();
  const out: EngineVerdict[] = [];
  for (const type of spotTypes) {
    for (const verdict of type.verdicts ?? []) {
      if (queued.has(verdict.playerId) || seen.has(verdict.playerId)) continue;
      seen.add(verdict.playerId);
      out.push(verdict);
    }
  }
  return out;
}

/** The engine request a card answers (N4/N5): one group's request, from its message or the class. */
export interface EngineApprovalRequestView {
  requestId: number;
  group: EngineApprovalGroup | null;
  spotTypes: EngineApprovalSpotType[];
  /** The message's own state (N4, kept current by `message_edited`), or the class card's. */
  state: "pending" | "approved" | "dismissed" | "replaced";
  responded: boolean;
}

export function isEngineApproval(value: unknown): value is EngineApprovalMeta | EngineApprovalState {
  return !!value && typeof value === "object" && (value as { engine?: unknown }).engine === "new";
}

/**
 * A class card's source: one request of the class's state, shaped as the request message is, so the
 * card reads one shape (N1, N5). `state` is the card's own: `dismissed` once that group is ignored.
 */
export function engineApprovalCardOf(
  request: EngineApprovalRequest,
  state: "pending" | "dismissed" = "pending",
): EngineApprovalMeta {
  return {
    engine: "new",
    requestId: request.requestId,
    lessonInstanceId: request.lessonInstanceId,
    group: request.group,
    responded: false,
    state,
    spotTypes: request.spotTypes,
  };
}

export function engineApprovalRequest(meta: EngineApprovalMeta): EngineApprovalRequestView | null {
  if (meta.requestId == null || !Array.isArray(meta.spotTypes)) return null;
  // N5: the replaced line keys on `state`; an older payload without it reads `responded` as replaced.
  const state = meta.state ?? (meta.responded ? "replaced" : "pending");
  return { requestId: meta.requestId, group: meta.group ?? null, spotTypes: meta.spotTypes, state, responded: !!meta.responded };
}

/** The card's title: the group's name, in ND1's words (N5). */
export function engineApprovalGroupName(group: EngineApprovalGroup): I18nText {
  if (group.tierSource === "coach_list") return { key: "calendar.detail.tierCoachList" };
  if (group.tierSource === "students_list") return { key: "calendar.detail.tierWaitingList" };
  return { key: "calendar.detail.tierGroup", params: { n: group.groupNumber ?? 0 } };
}

/** One key per group, for matching a group across re-reads. */
export function engineApprovalGroupKey(group: EngineApprovalGroup): string {
  return group.tierSource === "pool" ? `pool-${group.groupNumber ?? 0}` : group.tierSource;
}

/** "Sim" or "Sim (N retirados)" (N5). */
export function engineApprovalYesLabel(removedCount: number): { key: string; params?: { count: number } } {
  if (removedCount <= 0) return { key: "notificationsUi.replacementApproval.engine.yes" };
  return { key: "notificationsUi.replacementApproval.engine.yesRemoved", params: { count: removedCount } };
}

/** An empty type's reasons in N6's words, each with its count; zero counts are dropped. */
export function engineEmptyQueueReasons(type: Pick<EngineApprovalSpotType, "queue" | "emptyQueueReasons">): Array<{ stage: string; count: number; line: I18nText }> {
  if (type.queue.length > 0) return [];
  return (type.emptyQueueReasons ?? [])
    .filter((r) => r.count > 0)
    .map((r) => ({ stage: r.stage, count: r.count, line: engineStageLine(r.stage) }));
}
