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
  EngineApprovalMeta,
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

/** The engine request a card answers, from the message's metadata (N4) or the class's state (N1). */
export interface EngineApprovalRequestView {
  requestId: number;
  spotTypes: EngineApprovalSpotType[];
  /** The class's state, or the message's own (N4, kept current by `message_edited`). */
  state: "pending" | "approved" | "dismissed" | "replaced";
  responded: boolean;
}

export function isEngineApproval(value: unknown): value is EngineApprovalMeta | EngineApprovalState {
  return !!value && typeof value === "object" && (value as { engine?: unknown }).engine === "new";
}

export function engineApprovalRequest(source: EngineApprovalMeta | EngineApprovalState): EngineApprovalRequestView | null {
  // The class's state has no top-level `requestId`; a message's metadata always does.
  if (!("requestId" in source)) {
    const state = source as EngineApprovalState;
    if (!state.request) return null;
    return {
      requestId: state.request.requestId,
      spotTypes: state.request.spotTypes,
      state: state.state === "dismissed" ? "dismissed" : "pending",
      responded: false,
    };
  }
  const meta = source as EngineApprovalMeta;
  if (meta.requestId == null || !Array.isArray(meta.spotTypes)) return null;
  // N5: the replaced line keys on `state`; an older payload without it reads `responded` as replaced.
  const state = meta.state ?? (meta.responded ? "replaced" : "pending");
  return { requestId: meta.requestId, spotTypes: meta.spotTypes, state, responded: !!meta.responded };
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
