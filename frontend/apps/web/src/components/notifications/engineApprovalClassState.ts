/**
 * PAD-920 (notifications.semi-auto-approval N1, N3, N5; criterion 45): what the class's approval
 * card shows for a new-engine session, across the class's re-reads. A pure reducer, as iOS's (44):
 * - a pending request shows its card; a different request replaces it;
 * - an approved card stays while the screen is open, even when a re-read answers `none`
 *   (rule 12b keeps an answered card);
 * - `dismissed` shows the card as "Ignorado", with the recompute button beside it;
 * - a recompute replaces the card with the new request's.
 */
import type { EngineApprovalState } from "@levelup/types";

export interface EngineApprovalClassView {
  /** The class state the card renders, or null for no card. */
  card: EngineApprovalState | null;
  /** The coach approved this card here; it stays until the screen closes. */
  approved: boolean;
  /** "Ignorado": the recompute button shows. */
  dismissed: boolean;
}

export type EngineApprovalClassEvent =
  | { type: "read"; state: EngineApprovalState }
  | { type: "answered"; result: "approved" | "dismissed" | "stale" }
  | { type: "recomputed"; state: EngineApprovalState }
  | { type: "reset" };

export const ENGINE_APPROVAL_CLASS_START: EngineApprovalClassView = { card: null, approved: false, dismissed: false };

const requestIdOf = (s: EngineApprovalState | null) => s?.request?.requestId ?? null;

export function engineApprovalClassState(
  view: EngineApprovalClassView,
  event: EngineApprovalClassEvent,
): EngineApprovalClassView {
  switch (event.type) {
    case "reset":
      return ENGINE_APPROVAL_CLASS_START;
    case "answered":
      if (event.result === "approved") return { ...view, approved: true };
      if (event.result === "dismissed") return { ...view, dismissed: true };
      return view;
    case "recomputed":
      return { card: event.state.request ? event.state : null, approved: false, dismissed: event.state.state === "dismissed" };
    case "read": {
      const s = event.state;
      if (s.state === "pending" && s.request) {
        // The same request again keeps the card as it is (an answer shown on it stays).
        if (requestIdOf(view.card) === s.request.requestId) return { ...view, card: s };
        return { card: s, approved: false, dismissed: false };
      }
      if (s.state === "dismissed") {
        // The dismissed request's card, if the read still names it, else the one on screen.
        return { card: s.request ? s : view.card, approved: false, dismissed: true };
      }
      // `none`: an approved card stays while the screen is open; anything else goes.
      return view.approved ? view : ENGINE_APPROVAL_CLASS_START;
    }
  }
}
