/**
 * PAD-475 (messaging.push-notifications rule 12a, B-236) — a warm push tap.
 *
 * The coach read the thread seconds ago, so its cache entry is FRESH (30 s staleTime), then
 * left the app. The pushed message is not in that entry: the event stream is suspended in
 * the background and an unmounted thread receives nothing. Before the fix a push-target open
 * kept the cache unconditionally (B-190, for flow 103): no GET, the message never rendered,
 * and the open's phase was "none", so the thread was marked read at once.
 * Driven on query-core, the way the screen's hook observes the entry (the hooks cannot be
 * mounted here: two React copies, PAD-400).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { advanceOpenFetch, shouldMarkRead, threadQueryOverrides, type OpenFetch } from "./open-sequence";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const KEY = ["conversation", "1"];
type Thread = { id: string; messages: { id: number | string }[]; firstUnreadMessageId: number | null };
const cachedThread: Thread = { id: "1", messages: [{ id: 1 }, { id: 2 }], firstUnreadMessageId: null };
const serverThread: Thread = { id: "1", messages: [{ id: 1 }, { id: 2 }, { id: 3 }], firstUnreadMessageId: 3 };

function client() {
  // The app's global default (apps/mobile/app/_layout.tsx).
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
}

/** Mount the thread screen's observer on `c` for a push-target open, as the screen does. */
async function openOnTarget(c: QueryClient, target: string) {
  const cached = c.getQueryData<Thread>(KEY);
  let fetches = 0;
  const observer = new QueryObserver(c, {
    queryKey: KEY,
    queryFn: async () => {
      fetches += 1;
      return serverThread;
    },
    ...threadQueryOverrides(target, cached ? cached.messages.map((m) => m.id) : null),
  });
  const firstRender = c.defaultQueryOptions(observer.options);
  firstRender._optimisticResults = "optimistic";
  let phase: OpenFetch | null = advanceOpenFetch(null, "1", observer.getOptimisticResult(firstRender).isFetching);
  // What the mark-read effect would decide on the first commit, with the cached thread on screen.
  const marksReadOnMount = shouldMarkRead({ conversationId: "1", hasConversation: !!cached, phase: phase.phase }, null);
  const unsubscribe = observer.subscribe((r) => (phase = advanceOpenFetch(phase, "1", r.isFetching)));
  await flush();
  const data = observer.getCurrentResult().data as Thread;
  unsubscribe();
  return { fetches: () => fetches, data, phase: phase!.phase, marksReadOnMount };
}

describe("a warm push tap on a thread read seconds ago (PAD-475, B-236)", () => {
  it("makes its own GET for a target newer than the cached thread, and renders the message", async () => {
    const c = client();
    c.setQueryData(KEY, cachedThread);

    const open = await openOnTarget(c, "3");

    expect(open.fetches()).toBe(1);
    expect(open.data.messages.map((m) => m.id)).toContain(3);
    expect(open.phase).toBe("settled");
  });

  it("does not mark the thread read before that GET has settled", async () => {
    const c = client();
    c.setQueryData(KEY, cachedThread);

    const open = await openOnTarget(c, "3");

    expect(open.marksReadOnMount).toBe(false);
    expect(shouldMarkRead({ conversationId: "1", hasConversation: true, phase: open.phase }, null)).toBe(true);
    // The GET ran before the read mark, so it still carries the first unread for the divider.
    expect(open.data.firstUnreadMessageId).toBe(3);
  });

  it("a thread still mounted with a dead stream: the tap's new instance makes exactly one GET", async () => {
    const c = client();
    c.setQueryData(KEY, cachedThread);
    // The screen the coach left open: an observer on the same entry, mounted, not fetching.
    const mounted = new QueryObserver(c, { queryKey: KEY, queryFn: async () => serverThread });
    const unsubscribeMounted = mounted.subscribe(() => undefined);
    await flush();

    const open = await openOnTarget(c, "3");

    expect(open.fetches()).toBe(1);
    expect(open.phase).toBe("settled");
    expect((mounted.getCurrentResult().data as Thread).messages.map((m) => m.id)).toContain(3);
    unsubscribeMounted();
  });
});

describe("when a push-target open may keep the cached thread (rule 12a)", () => {
  it("keeps it when the target is in the cached thread", () => {
    expect(threadQueryOverrides("2", [1, 2])).toBeUndefined();
    expect(threadQueryOverrides("2", ["1", "2"])).toBeUndefined();
  });

  it("keeps it when the target is older than the newest cached message (flow 103's walk)", () => {
    expect(threadQueryOverrides("3", [16, 17, 45])).toBeUndefined();
  });

  it("fetches when the target is newer than everything cached", () => {
    expect(threadQueryOverrides("46", [16, 17, 45])).toEqual({ refetchOnMount: "always" });
  });

  it("fetches when the ids cannot be compared: the default is to fetch, not to keep", () => {
    expect(threadQueryOverrides("46", [])).toEqual({ refetchOnMount: "always" });
    expect(threadQueryOverrides("46", ["temp-1"])).toEqual({ refetchOnMount: "always" });
    expect(threadQueryOverrides("abc", [16, 17])).toEqual({ refetchOnMount: "always" });
  });

  it("leaves a thread that is not cached at all to the mount's own fetch", () => {
    expect(threadQueryOverrides("46", null)).toBeUndefined();
  });

  it("a plain open always fetches, as before (B-190)", () => {
    expect(threadQueryOverrides(null, [1, 2])).toEqual({ refetchOnMount: "always" });
    expect(threadQueryOverrides(null, null)).toEqual({ refetchOnMount: "always" });
  });
});

describe("a tap on the conversation already on screen is a new open", () => {
  it("PushTapRouter navigates with router.push, which always mounts a new thread instance", () => {
    // expo-router's stack reuses the focused route for NAVIGATE but never for PUSH (no
    // `singular`). A reused instance would not mount, so rule 12a's GET would not run.
    const source = readFileSync(join(__dirname, "..", "..", "components", "PushTapRouter.tsx"), "utf8");
    expect(source).toMatch(/router\.push\(target/);
    expect(source).not.toMatch(/router\.(navigate|replace)\(/);
  });
});

describe("the open's GET fails (rule 12a): nothing unseen is marked read", () => {
  async function openWithFailingGet(target: string | null = "3") {
    const c = client();
    c.setQueryData(KEY, cachedThread);
    let fail = true;
    const observer = new QueryObserver<Thread>(c, {
      queryKey: KEY,
      queryFn: async () => {
        if (fail) throw new Error("network");
        return serverThread;
      },
      ...threadQueryOverrides(target, cachedThread.messages.map((m) => m.id)),
    });
    const firstRender = c.defaultQueryOptions(observer.options);
    firstRender._optimisticResults = "optimistic";
    let phase: OpenFetch = advanceOpenFetch(null, "1", observer.getOptimisticResult(firstRender).isFetching, false);
    const unsubscribe = observer.subscribe((r) => (phase = advanceOpenFetch(phase, "1", r.isFetching, r.isError)));
    await flush();
    const marksRead = () => shouldMarkRead({ conversationId: "1", hasConversation: true, phase: phase.phase }, null);
    return {
      observer,
      phase: () => phase.phase,
      marksRead,
      succeedNext: () => (fail = false),
      unsubscribe,
    };
  }

  it("is neither settled nor marked read, and the screen has an error to show", async () => {
    const open = await openWithFailingGet();

    expect(open.observer.getCurrentResult().isError).toBe(true);
    expect(open.phase()).toBe("failed");
    expect(open.marksRead()).toBe(false);
    open.unsubscribe();
  });

  it("holds for a plain open too: a failed GET over a cached thread does not mark it read", async () => {
    const open = await openWithFailingGet(null);

    expect(open.phase()).toBe("failed");
    expect(open.marksRead()).toBe(false);
    open.unsubscribe();
  });

  it("marks read once a later GET settles (Retry, or a focus refetch)", async () => {
    const open = await openWithFailingGet();
    open.succeedNext();

    await open.observer.refetch();
    await flush();

    expect(open.phase()).toBe("settled");
    expect(open.marksRead()).toBe(true);
    expect((open.observer.getCurrentResult().data as Thread).messages.map((m) => m.id)).toContain(3);
    open.unsubscribe();
  });
});
