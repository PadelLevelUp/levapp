/**
 * PAD-616 end to end at the data layer: the real SSE hub, a fake stream, a real QueryClient and
 * the shared handler branch both shells run. The stream drops, the server's unread count changes
 * while nothing is listening (the event that announced it is lost), the stream re-opens, and the
 * on-screen unread query shows the new number without anything else happening.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createSseHub, type SseSourceLike } from "../../api/src/sse";
import { queryKeys } from "./queryKeys";
import { answerResync } from "./requestEvents";

class FakeSource implements SseSourceLike {
  listeners: Record<string, ((event: unknown) => void)[]> = {};
  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  close() {}
  emit(type: string, event: unknown = {}) {
    for (const l of this.listeners[type] ?? []) l(event);
  }
}

describe("drop, publish, re-open: the screen catches up (PAD-616)", () => {
  it("the unread count on screen shows what was published while the stream was down", async () => {
    let serverUnread = 0;
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    const sources: FakeSource[] = [];
    const timers: (() => void)[] = [];
    let t = 0;
    const hub = createSseHub({
      getUrl: () => "https://api.test/app/events?token=t",
      open: () => {
        const s = new FakeSource();
        sources.push(s);
        return s;
      },
      random: () => 0,
      now: () => t,
      setTimer: (fn) => {
        timers.push(fn);
        return fn;
      },
      clearTimer: () => undefined,
      debug: () => undefined,
    });
    // The app-level handler, as both shells run it.
    hub.subscribe((event) => {
      answerResync(event, qc);
    });
    // The badge on screen.
    const observer = new QueryObserver(qc, {
      queryKey: queryKeys.unreadCount,
      queryFn: async () => ({ unreadCount: serverUnread }),
    });
    const shown: number[] = [];
    const unsubscribe = observer.subscribe((r) => {
      if (r.data) shown.push(r.data.unreadCount);
    });
    await vi.waitFor(() => expect(shown.at(-1)).toBe(0));
    await new Promise((r) => setTimeout(r, 0));
    sources[0].emit("open");

    sources[0].emit("error"); // the stream drops
    serverUnread = 1; // a message arrives; its message_created event is lost
    t = 2_000;
    timers.at(-1)!(); // the back-off retry
    await new Promise((r) => setTimeout(r, 0));
    expect(shown.at(-1)).toBe(0); // nothing has told the screen yet
    sources[1].emit("open"); // the stream is back

    await vi.waitFor(() => expect(shown.at(-1)).toBe(1));
    unsubscribe();
    hub.close();
  });
});
