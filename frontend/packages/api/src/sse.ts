/**
 * Builds the URL for the server-sent-events stream. The EventSource itself is
 * platform-specific (web uses the native EventSource; mobile needs a
 * polyfill), so the package only provides the URL.
 */
export function buildEventsUrl(baseURL: string, token: string): string {
  return `${baseURL}/app/events?token=${token}`;
}

// ---------------------------------------------------------------------------
// PAD-277 (audit M19) — one shared SSE connection per tab / app
// ---------------------------------------------------------------------------
//
// Every open stream holds one of the backend's 64 gunicorn threads
// (1 worker; see messaging.sse-realtime rules 11-17). Web used to open up to
// three EventSources per tab and iOS up to three per app, so about twenty
// tabs or phones took every thread. A hub owns ONE source and fans each event
// out to any number of in-app listeners; the platform supplies the
// EventSource constructor, since web has a native one and React Native needs a
// polyfill.
//
// Reconnection is owned here, not by the EventSource: a browser EventSource
// gives up for good on a non-200 answer (the server's 503 when it is at its
// stream cap), so the hub closes the source on any error and retries with
// exponential back-off and jitter. Retries are reported through `debug` only.

export type AppEvent = { type: string; [key: string]: unknown };

/** The subset of EventSource (native or react-native-sse) the hub needs. */
export interface SseSourceLike {
  addEventListener(type: "open" | "message" | "error", listener: (event: any) => void): void;
  close(): void;
}

export interface SseHubOptions {
  /** The stream URL, or null when there is no session (then nothing connects). */
  getUrl: () => string | null | Promise<string | null>;
  open: (url: string) => SseSourceLike;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
  /** Injected for tests; default setTimeout / clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Injected for tests; defaults to Date.now. PAD-616's resync throttle reads it. */
  now?: () => number;
  /** Debug-level log sink; defaults to console.debug. Never console.log/warn. */
  debug?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface SseHub {
  /** Adds a listener and returns its unsubscribe. The first one connects; the last one to leave disconnects. */
  subscribe(listener: (event: AppEvent) => void): () => void;
  /** Drops any pending retry and reconnects now with the back-off reset (e.g. an app returning to the foreground). */
  reconnectNow(): void;
  /** Disconnects and forgets every listener. */
  close(): void;
}

/**
 * PAD-616 (messaging.sse-realtime rule 18): a local event, never sent by the server. An event the
 * server published while the stream was down never arrives, so when the stream re-opens after its
 * first open the hub delivers `{ type: "resync" }` to every listener, which refreshes what it keeps
 * live. At most one per `SSE_RESYNC_MIN_INTERVAL_MS`; re-opens inside the window fold into one
 * trailing resync, so a flapping connection cannot set off a refetch storm.
 */
export const RESYNC_EVENT = "resync";
export const SSE_RESYNC_MIN_INTERVAL_MS = 5_000;

export const SSE_RETRY_BASE_MS = 1_000;
export const SSE_RETRY_MAX_MS = 30_000;

/**
 * Delay before reconnect attempt `attempt` (0-based): the ceiling doubles from
 * 1 s up to 30 s, and the delay is drawn from its upper half ("equal jitter"),
 * so clients never retry in lock-step and never faster than half the ceiling.
 */
export function sseRetryDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(SSE_RETRY_MAX_MS, SSE_RETRY_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export function createSseHub(options: SseHubOptions): SseHub {
  const random = options.random ?? Math.random;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const debug =
    options.debug ??
    ((message: string, detail?: Record<string, unknown>) => console.debug(`[sse] ${message}`, detail ?? {}));

  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(event: AppEvent) => void>();
  // PAD-616: whether this hub has ever had a stream open (a later open is a RE-open), when it last
  // told its listeners to resync, and the trailing resync a throttled re-open leaves behind.
  let everOpened = false;
  let lastResyncAt = -Infinity;
  let resyncTimer: unknown = null;
  let source: SseSourceLike | null = null;
  let timer: unknown = null;
  let attempt = 0;
  // Bumped whenever the hub (re)connects or tears down, so an in-flight async
  // getUrl() that resolves late cannot open a source nobody wants any more.
  let generation = 0;

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const dropSource = () => {
    const current = source;
    source = null;
    current?.close();
  };

  const fanOut = (data: AppEvent) => {
    for (const listener of [...listeners]) {
      try {
        listener(data);
      } catch (error) {
        // One broken screen must never stop the others hearing about events.
        debug("sse listener threw", { error: String(error) });
      }
    }
  };
  const emitResync = () => {
    lastResyncAt = now();
    debug("sse resync");
    fanOut({ type: RESYNC_EVENT });
  };
  const requestResync = () => {
    const sinceLast = now() - lastResyncAt;
    if (sinceLast >= SSE_RESYNC_MIN_INTERVAL_MS) {
      emitResync();
      return;
    }
    if (resyncTimer !== null) return; // one trailing resync covers every re-open in the window
    resyncTimer = setTimer(() => {
      resyncTimer = null;
      if (listeners.size > 0) emitResync();
    }, SSE_RESYNC_MIN_INTERVAL_MS - sinceLast);
  };
  const cancelResync = () => {
    if (resyncTimer !== null) {
      clearTimer(resyncTimer);
      resyncTimer = null;
    }
  };
  const deliver = (event: { data?: unknown }) => {
    const raw = event?.data;
    if (typeof raw !== "string" || raw === "") return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      debug("sse payload ignored", { reason: "invalid json" });
      return;
    }
    if (!data || typeof (data as AppEvent).type !== "string") {
      debug("sse payload ignored", { reason: "no type" });
      return;
    }
    fanOut(data as AppEvent);
  };

  const scheduleRetry = () => {
    if (listeners.size === 0) return;
    const delayMs = sseRetryDelay(attempt, random);
    attempt += 1;
    debug("sse retry scheduled", { attempt, delayMs });
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void connect();
    }, delayMs);
  };

  const connect = async () => {
    const mine = ++generation;
    const url = await options.getUrl();
    if (mine !== generation || listeners.size === 0 || !url) return;
    const current = options.open(url);
    source = current;
    current.addEventListener("open", () => {
      if (source !== current) return;
      attempt = 0;
      debug("sse open");
      if (everOpened) requestResync();
      everOpened = true;
    });
    current.addEventListener("message", (event) => {
      if (source === current) deliver(event);
    });
    current.addEventListener("error", () => {
      if (source !== current) return;
      dropSource();
      scheduleRetry();
    });
  };

  const reset = () => {
    generation += 1;
    cancelTimer();
    dropSource();
    attempt = 0;
    // PAD-616: with no listener left nothing is live, so the next listener's connection is a fresh
    // first open — not a re-open to resync. On web each page renders its own layout, so navigating
    // can pass through zero listeners; resyncing there broke PAD-586's "back within the window
    // makes no request" (subset red on #679).
    cancelResync();
    everOpened = false;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && source === null && timer === null) void connect();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) reset();
      };
    },
    reconnectNow() {
      cancelTimer();
      dropSource();
      attempt = 0;
      if (listeners.size > 0) void connect();
    },
    close() {
      reset();
      listeners.clear();
      // A closed hub forgets its stream: the next session's first open is not a resync.
      lastResyncAt = -Infinity;
    },
  };
}
