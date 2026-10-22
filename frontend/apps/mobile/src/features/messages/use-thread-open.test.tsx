/**
 * PAD-475 (#488 review): the thread screen takes its four open decisions from `useThreadOpen`,
 * and this mounts that hook, so mis-wiring is a test failure rather than something only the
 * iOS-only flow 122 would notice. The hooks are the REAL `@levelup/hooks` since PAD-406 (a
 * scripted `useConversationThread` before): the messages api module is the spy below, the thread
 * lives in a real `QueryClient` (the app's 60 s staleTime), and "a GET in flight / failed /
 * answered" is a gate this file opens or rejects. Everything else is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { ReactElement } from "react";
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@levelup/hooks";
import { renderNative } from "@/test/render-native";
import { useThreadOpen } from "./use-thread-open";

type Row = { id: number | string };
type Thread = { messages: Row[]; hasMore?: boolean };

const api = vi.hoisted(() => ({ getConversation: vi.fn() }));
vi.mock("@levelup/api/src/resources/messages", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}));

let client: QueryClient;
// The open's own GET: pending until a test answers or rejects it.
let gate: { resolve: (t: Thread) => void; reject: (e: Error) => void };

const wrap = (el: ReactElement) => createElement(QueryClientProvider, { client }, el);
// react-query notifies its observers on a macrotask (and a settled promise takes a few microtask
// hops to reach it), so every change waits a few out inside act, which holds under a loaded machine.
const change = (fn: () => void) =>
  act(async () => {
    fn();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
const seed = (thread: Thread) => change(() => { client.setQueryData(queryKeys.conversation("1"), thread); });
/** The override the thread query's observer was given (`refetchOnMount`), read off the live observer. */
const refetchOnMount = () =>
  (client.getQueryCache().find({ queryKey: queryKeys.conversation("1") })?.observers[0]?.options as { refetchOnMount?: unknown })
    ?.refetchOnMount;

let open: ReturnType<typeof useThreadOpen>;
function Probe(props: { target: string | null }) {
  open = useThreadOpen({ conversationId: "1", target: props.target, queryClient: client });
  return createElement(View, { testID: "probe" });
}
const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id }));
const mount = (target: string | null) => renderNative(wrap(createElement(Probe, { target })));

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 60_000 }, mutations: { retry: false } } });
  api.getConversation.mockReset().mockImplementation(
    () => new Promise<Thread>((resolve, reject) => { gate = { resolve, reject }; })
  );
});

describe("useThreadOpen: the override the thread query is given (rule 12a)", () => {
  it("a push target newer than the cached thread forces the open's own GET", async () => {
    await seed({ messages: rows(1, 2) });
    await mount("3");
    expect(refetchOnMount()).toEqual("always");
    expect(api.getConversation).toHaveBeenCalledTimes(1);
  });

  it("a push target the cached thread holds keeps the cache", async () => {
    await seed({ messages: rows(1, 2) });
    await mount("2");
    expect(refetchOnMount()).toBeUndefined();
    expect(api.getConversation).not.toHaveBeenCalled();
  });

  it("is decided once per open: the GET putting the target into the cache does not flip it", async () => {
    await seed({ messages: rows(1, 2) });
    const n = await mount("3");
    await seed({ messages: rows(1, 2, 3) });
    await n.rerender(wrap(createElement(Probe, { target: "3" })));
    expect(refetchOnMount()).toEqual("always");
  });
});

describe("useThreadOpen: the phase comes from the thread's own isFetching and isError", () => {
  it("a GET that ends in error is failed, not settled", async () => {
    await seed({ messages: rows(1, 2) });
    await mount("3");
    expect(open.openPhase).toBe("in-flight");
    await change(() => gate.reject(new Error("offline")));
    expect(open.openPhase).toBe("failed");
  });
});

describe("useThreadOpen: the target step (rule 12b)", () => {
  it("waits while the open's GET is in flight, then finds the target in its answer", async () => {
    await seed({ messages: rows(1, 2), hasMore: true });
    await mount("3");
    expect(open.targetStep("3", 0)).toEqual({ kind: "wait" });
    await change(() => gate.resolve({ messages: rows(1, 2, 3), hasMore: true }));
    expect(open.targetStep("3", 0)).toEqual({ kind: "scroll", index: 2 });
  });

  it("walks older pages for a target older than the cached page, with no GET in flight (flow 103)", async () => {
    await seed({ messages: rows(16, 17, 45), hasMore: true });
    await mount("3");
    expect(open.targetStep("3", 0)).toEqual({ kind: "load-older" });
  });
});

describe("useThreadOpen: a retried landing scroll (conversation-detail rule 9b)", () => {
  it("finds the row by message id in the list as it is now, not at its old index", async () => {
    const before = rows(...Array.from({ length: 51 }, (_, i) => 2 + i)); // ids 2..52, index 50 = 52
    await seed({ messages: before });
    await mount(null);
    open.scrollStarted(52);
    await seed({ messages: before.slice(21) }); // the first page: 30 rows
    expect(open.retryIndex()).toBe(29);
  });

  it("drops the retry when the message is no longer loaded", async () => {
    await seed({ messages: rows(1, 2, 3) });
    await mount(null);
    open.scrollStarted(1);
    await seed({ messages: rows(2, 3) });
    expect(open.retryIndex()).toBeNull();
  });
});
