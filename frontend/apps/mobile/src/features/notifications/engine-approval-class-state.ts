import type { EngineApprovalState } from "@levelup/types";

/**
 * PAD-920 (semi-auto-approval N1, N3, N5): what the class screen's new-engine card shows next, from
 * what it showed and a fresh answer. The bundle screen's `mergeSuggestionBundles` does the same for
 * old-engine bundles (PAD-770, rule 12b); this is its new-engine half, pure so it can be tested.
 */
export type EngineClassCardEvent =
  /** A re-read of the class's approval state (`getApprovalState`). */
  | { kind: "read"; state: EngineApprovalState }
  /** The answer to "Sugestão de convites automáticos" (`recomputeApprovalState`). */
  | { kind: "recompute"; state: EngineApprovalState }
  /** The coach pressed "Ignorar" on the card. */
  | { kind: "dismissed" };

export function nextEngineClassCard(
  prev: EngineApprovalState | null,
  event: EngineClassCardEvent,
  /** The requests the coach answered on this screen (String(requestId)), kept until it closes. */
  answered: ReadonlySet<string>
): EngineApprovalState | null {
  if (event.kind === "dismissed") {
    // As web's ClassDetailSheet: the card stays and reads "Ignorado"; the recompute shows beside it.
    return prev ? { ...prev, state: "dismissed" } : prev;
  }
  const s = event.state;
  // N3: a recompute's answer is the card.
  if (event.kind === "recompute") return s.state !== "none" && s.request ? s : null;
  // N1: a pending request is the card.
  if (s.state === "pending" && s.request) return s;
  if (s.state === "dismissed") {
    // A dismissed session drops a kept answered request; it shows its request (or the one ignored
    // here) as dismissed.
    if (s.request) return s;
    return prev?.state === "dismissed" ? prev : null;
  }
  // `none`: a request the coach approved here stays until the screen closes (PAD-770, rule 12b).
  if (prev?.request && prev.state !== "dismissed" && answered.has(String(prev.request.requestId))) return prev;
  return null;
}

/** N1/N3: the recompute button shows when nothing is pending and the session is dismissed. */
export function showsEngineRecompute(card: EngineApprovalState | null): boolean {
  return !card || card.state === "dismissed";
}
