import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESYNC_EVENT,
  SSE_RESYNC_MIN_INTERVAL_MS,
  SSE_RETRY_MAX_MS,
  createSseHub,
  sseRetryDelay,
  type SseSourceLike,
} from "./sse";

/**
 * PAD-277 (audit M19) — one shared SSE connection per tab / app, with
 * exponential back-off and jitter, logged only at debug level.
 * `messaging.sse-realtime` rules 15-17.
 */

class FakeSource implements SseSourceLike {
  listeners: Record<string, ((event: any) => void)[]> = {};
  closed = false;
  constructor(public url: string) {}
  addEventListener(type: string, listener: (event: any) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, event: any = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

function harness(overrides: { url?: string | null; random?: () => number; now?: () => number } = {}) {
  const sources: FakeSource[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const debug = vi.fn();
  const hub = createSseHub({
    getUrl: () => (overrides.url === undefined ? "https://api.test/app/events?token=t" : overrides.url),
    open: (url) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source;
    },
    random: overrides.random ?? (() => 0),
    ...(overrides.now ? { now: overrides.now } : {}),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    debug,
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { hub, sources, timers, debug, flush };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sseRetryDelay — exponential with equal jitter", () => {
  it("doubles the ceiling each attempt and keeps at least half of it", () => {
    expect(sseRetryDelay(0, () => 0)).toBe(500);
    expect(sseRetryDelay(0, () => 1)).toBe(1_000);
    expect(sseRetryDelay(1, () => 0)).toBe(1_000);
    expect(sseRetryDelay(2, () => 0)).toBe(2_000);
    expect(sseRetryDelay(3, () => 0.5)).toBe(6_000);
  });

  it("never exceeds the maximum, however many attempts", () => {
    for (const attempt of [5, 10, 50]) {
      const low = sseRetryDelay(attempt, () => 0);
      const high = sseRetryDelay(attempt, () => 1);
      expect(low).toBe(SSE_RETRY_MAX_MS / 2);
      expect(high).toBe(SSE_RETRY_MAX_MS);
    }
  });
});

describe("createSseHub — one connection shared by every listener", () => {
  it("opens a single source for several listeners and delivers to all of them", async () => {
    const { hub, sources, flush } = harness();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(a);
    hub.subscribe(b);
    await flush();
    expect(sources).toHaveLength(1);

    sources[0].emit("message", { data: JSON.stringify({ type: "message_created", payload: { id: 1 } }) });
    expect(a).toHaveBeenCalledWith({ type: "message_created", payload: { id: 1 } });
    expect(b).toHaveBeenCalledWith({ type: "message_created", payload: { id: 1 } });
  });

  it("closes the source when the last listener leaves and reopens for the next", async () => {
    const { hub, sources, flush } = harness();
    const offA = hub.subscribe(vi.fn());
    const offB = hub.subscribe(vi.fn());
    await flush();
    offA();
    expect(sources[0].closed).toBe(false);
    offB();
    expect(sources[0].closed).toBe(true);

    hub.subscribe(vi.fn());
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1].closed).toBe(false);
  });

  it("makes no connection while there is no session", async () => {
    const { hub, sources, flush } = harness({ url: null });
    hub.subscribe(vi.fn());
    await flush();
    expect(sources).toHaveLength(0);
  });

  it("ignores payloads that are not JSON events, and one throwing listener does not starve the others", async () => {
    const { hub, sources, flush } = harness();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    hub.subscribe(bad);
    hub.subscribe(good);
    await flush();

    sources[0].emit("message", { data: "not json" });
    sources[0].emit("message", { data: JSON.stringify({ noType: true }) });
    expect(good).not.toHaveBeenCalled();

    sources[0].emit("message", { data: JSON.stringify({ type: "notify_sent", payload: {} }) });
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("createSseHub — reconnection", () => {
  it("reconnects after an error with growing, jittered delays, and an open resets them", async () => {
    const { hub, sources, timers, flush } = harness({ random: () => 0 });
    hub.subscribe(vi.fn());
    await flush();

    sources[0].emit("error");
    expect(sources[0].closed).toBe(true);
    expect(timers.map((t) => t.ms)).toEqual([500]);

    timers[0].fn();
    await flush();
    expect(sources).toHaveLength(2);
    sources[1].emit("error");
    expect(timers.map((t) => t.ms)).toEqual([500, 1_000]);

    timers[1].fn();
    await flush();
    sources[2].emit("open");
    sources[2].emit("error");
    expect(timers.map((t) => t.ms)).toEqual([500, 1_000, 500]);
  });

  it("does not reconnect once nobody is listening", async () => {
    const { hub, sources, timers, flush } = harness();
    const off = hub.subscribe(vi.fn());
    await flush();
    sources[0].emit("error");
    off();
    expect(timers[0].cleared).toBe(true);
  });

  it("reconnectNow drops the pending retry and connects at once with the back-off reset", async () => {
    const { hub, sources, timers, flush } = harness({ random: () => 0 });
    hub.subscribe(vi.fn());
    await flush();
    sources[0].emit("error");
    timers[0].fn();
    await flush();
    sources[1].emit("error");
    expect(timers.map((t) => t.ms)).toEqual([500, 1_000]);

    hub.reconnectNow();
    await flush();
    expect(timers[1].cleared).toBe(true);
    expect(sources).toHaveLength(3);
    sources[2].emit("error");
    expect(timers.at(-1)!.ms).toBe(500);
  });
});

describe("createSseHub — logging", () => {
  it("reports retries through the debug hook only, never console.log / warn / error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { hub, sources, debug, flush } = harness();
    hub.subscribe(vi.fn());
    await flush();
    sources[0].emit("message", { data: "not json" });
    sources[0].emit("error");

    expect(debug).toHaveBeenCalledWith("sse retry scheduled", expect.objectContaining({ attempt: 1, delayMs: 500 }));
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});


// PAD-616 (messaging.sse-realtime rule 18): an event published while the stream was down never
// arrives, so a re-open tells every listener to resync — once per re-open, never on the first
// open, and throttled so a flapping connection cannot set off a refetch storm.
describe("createSseHub — resync after a re-open (PAD-616)", () => {
  const resyncs = (events: { type: string }[]) => events.filter((e) => e.type === RESYNC_EVENT).length;

  it("the first open is not a resync", async () => {
    const { hub, sources, flush } = harness();
    const seen: { type: string }[] = [];
    hub.subscribe((e) => seen.push(e));
    await flush();
    sources[0].emit("open");
    expect(resyncs(seen)).toBe(0);
  });

  it("open, drop, re-open: exactly one resync, delivered to every listener", async () => {
    let t = 0;
    const { hub, sources, timers, flush } = harness({ now: () => t });
    const a: { type: string }[] = [];
    const b: { type: string }[] = [];
    hub.subscribe((e) => a.push(e));
    hub.subscribe((e) => b.push(e));
    await flush();
    sources[0].emit("open");
    sources[0].emit("error"); // the stream drops
    t = 60_000;
    timers[timers.length - 1].fn(); // the back-off retry fires
    await flush();
    sources[1].emit("open");
    expect(resyncs(a)).toBe(1);
    expect(resyncs(b)).toBe(1);
  });

  it("an app returning to the foreground (reconnectNow) resyncs too", async () => {
    let t = 0;
    const { hub, sources, flush } = harness({ now: () => t });
    const seen: { type: string }[] = [];
    hub.subscribe((e) => seen.push(e));
    await flush();
    sources[0].emit("open");
    t = 60_000;
    hub.reconnectNow();
    await flush();
    sources[1].emit("open");
    expect(resyncs(seen)).toBe(1);
  });

  it("a flapping stream resyncs at most once per window, with one trailing resync", async () => {
    let t = 0;
    const { hub, sources, timers, flush } = harness({ now: () => t });
    const seen: { type: string }[] = [];
    hub.subscribe((e) => seen.push(e));
    await flush();
    sources[0].emit("open"); // first open: no resync
    for (const at of [10_000, 11_000, 12_000]) {
      t = at;
      hub.reconnectNow();
      await flush();
      sources[sources.length - 1].emit("open");
    }
    expect(resyncs(seen)).toBe(1); // 10 s resyncs; 11 s and 12 s fold into one trailing resync
    const trailing = timers.filter((x) => !x.cleared && x.ms === SSE_RESYNC_MIN_INTERVAL_MS - 1_000);
    expect(trailing).toHaveLength(1);
    t = 15_000;
    trailing[0].fn();
    expect(resyncs(seen)).toBe(2);
  });

  it("close() forgets the stream: the next session's first open is not a resync", async () => {
    let t = 0;
    const { hub, sources, flush } = harness({ now: () => t });
    hub.subscribe(() => undefined);
    await flush();
    sources[0].emit("open");
    hub.close();
    const seen: { type: string }[] = [];
    t = 60_000;
    hub.subscribe((e) => seen.push(e));
    await flush();
    sources[1].emit("open");
    expect(resyncs(seen)).toBe(0);
  });
});
