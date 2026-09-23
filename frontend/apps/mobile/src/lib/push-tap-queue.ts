/**
 * The pending push tap (PAD-409, B-166, messaging.push-notifications rule 13).
 *
 * A tap that launches the app is delivered before the root navigator exists;
 * navigating then loops the root layout and the tap is lost. So a tap is only
 * OFFERED here, and TAKEN once the navigator is mounted and auth has settled.
 * State is module-level on purpose: "handled once" must survive a re-mount of
 * whatever component drives it (the cold-start path re-mounted it dozens of
 * times). Only the latest tap is kept — the user acted on that one.
 */
const seen = new Set<string>();
let pending: unknown = null;
const listeners = new Set<() => void>();

export function offerPushTap(id: string, target: unknown): void {
  if (seen.has(id)) return;
  seen.add(id);
  pending = target;
  listeners.forEach((listener) => listener());
}

export function takeReadyPushTap(state: {
  navigatorReady: boolean;
  authLoading: boolean;
  signedIn: boolean;
}): unknown {
  if (!state.navigatorReady || state.authLoading) return null;
  const target = pending;
  pending = null;
  // A tap that launched a signed-out app is dropped; login runs as normal.
  return state.signedIn ? target : null;
}

/** Called when a tap is offered, so a mounted router re-checks readiness. */
export function subscribePushTaps(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetPushTapsForTest(): void {
  seen.clear();
  pending = null;
}
