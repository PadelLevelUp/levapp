import { buildEventsUrl, createSseHub, type SseHub } from "@levelup/api";

/**
 * messaging.sse-realtime rule 15 (PAD-277): ONE EventSource per browser tab.
 *
 * Every open stream holds one of the backend's 64 gunicorn threads. Each
 * component used to open its own EventSource (AppLayout, MessagesPage and
 * ClassDetailSheet: up to three per tab). They now subscribe here instead; the
 * shared hub from `@levelup/api` fans each event out, reconnects with
 * exponential back-off and jitter (logged at debug level only), and closes the
 * stream when the last subscriber leaves.
 */

/** A parsed stream event. `payload`'s shape depends on `type` (rule 4). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppStreamEvent = { type: string; payload?: any };

let current: { token: string; hub: SseHub } | null = null;

function hubFor(token: string): SseHub {
  if (current?.token === token) return current.hub;
  // A new session token means a new identity on the stream: drop the old one.
  current?.hub.close();
  const hub = createSseHub({
    getUrl: () => buildEventsUrl("/api", token),
    open: (url) => new EventSource(url),
  });
  current = { token, hub };
  return hub;
}

/** Listen to the tab's shared event stream; returns the unsubscribe. */
export function subscribeAppEvents(
  token: string,
  listener: (event: AppStreamEvent) => void
): () => void {
  return hubFor(token).subscribe((event) => listener(event as AppStreamEvent));
}
