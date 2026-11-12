/**
 * PAD-920 (notifications.semi-auto-approval N1, N3, N5; criterion 45, iOS's twin 44): the class's
 * approval cards for a new-engine session, one per group about to start (the owner's per-group
 * approval), kept across the class's re-reads by a pure reducer:
 * - each pending request shows its own card; an unanswered card the read no longer lists goes, so a
 *   group's newer request takes its place;
 * - an approved card stays while the screen is open, even when a re-read no longer lists it
 *   (rule 12b keeps an answered card);
 * - a dismissed group's card reads "Ignorado", with the recompute button beside it;
 * - a recompute replaces the cards with the class's requests as they are now.
 */
import type { EngineApprovalGroup, EngineApprovalMeta, EngineApprovalRequest, EngineApprovalState } from "@levelup/types";
import { engineApprovalCardOf, engineApprovalGroupKey } from "@levelup/config";

export interface EngineApprovalClassCard {
  /** The card's source, in the request message's shape. */
  meta: EngineApprovalMeta;
  approved: boolean;
  dismissed: boolean;
}

export interface EngineApprovalClassView {
  cards: EngineApprovalClassCard[];
  /** Some group is dismissed: the recompute button shows. */
  dismissed: boolean;
}

export type EngineApprovalClassEvent =
  | { type: "read"; state: EngineApprovalState }
  | { type: "answered"; requestId: number; result: "approved" | "dismissed" | "stale" }
  | { type: "recomputed"; state: EngineApprovalState }
  | { type: "reset" };

export const ENGINE_APPROVAL_CLASS_START: EngineApprovalClassView = { cards: [], dismissed: false };

const keyOf = (group: EngineApprovalGroup | undefined) => (group ? engineApprovalGroupKey(group) : "");

const pendingCard = (request: EngineApprovalRequest): EngineApprovalClassCard => ({
  meta: engineApprovalCardOf(request),
  approved: false,
  dismissed: false,
});

const asDismissed = (c: EngineApprovalClassCard): EngineApprovalClassCard => ({
  ...c,
  dismissed: true,
  meta: { ...c.meta, state: "dismissed" },
});

export function engineApprovalClassState(
  view: EngineApprovalClassView,
  event: EngineApprovalClassEvent,
): EngineApprovalClassView {
  switch (event.type) {
    case "reset":
      return ENGINE_APPROVAL_CLASS_START;
    case "answered": {
      if (event.result === "stale") return view;
      const cards = view.cards.map((c) =>
        c.meta.requestId !== event.requestId ? c : event.result === "approved" ? { ...c, approved: true } : asDismissed(c),
      );
      return { cards, dismissed: view.dismissed || event.result === "dismissed" };
    }
    case "recomputed": {
      // The approved cards stay while the screen is open; everything else is the class as it is now.
      const kept = view.cards.filter((c) => c.approved);
      const keptIds = new Set(kept.map((c) => c.meta.requestId));
      const fresh = event.state.requests.filter((r) => !keptIds.has(r.requestId)).map(pendingCard);
      return { cards: [...kept, ...fresh], dismissed: event.state.dismissedGroups.length > 0 };
    }
    case "read": {
      const s = event.state;
      const dismissedKeys = new Set(s.dismissedGroups.map(keyOf));
      const byId = new Map(view.cards.map((c) => [c.meta.requestId, c]));
      // Every pending request shows; the same request again keeps its card as it is.
      const pending = s.requests.map((r) => byId.get(r.requestId) ?? pendingCard(r));
      const pendingIds = new Set(pending.map((c) => c.meta.requestId));
      const kept = view.cards
        .filter((c) => !pendingIds.has(c.meta.requestId))
        .filter((c) => c.approved || dismissedKeys.has(keyOf(c.meta.group)))
        // A card whose group the read names as dismissed reads "Ignorado".
        .map((c) => (!c.approved && dismissedKeys.has(keyOf(c.meta.group)) ? asDismissed(c) : c));
      return { cards: [...kept, ...pending], dismissed: s.dismissedGroups.length > 0 };
    }
  }
}
