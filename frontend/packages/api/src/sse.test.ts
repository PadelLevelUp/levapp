import { afterEach, describe, expect, it, vi } from "vitest";
import {
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

function harness(overrides: { url?: string | null; random?: () => number } = {}) {
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
