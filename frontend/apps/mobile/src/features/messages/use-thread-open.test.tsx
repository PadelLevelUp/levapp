/**
 * PAD-475 (#488 review): the thread screen takes its four open decisions from `useThreadOpen`,
 * and this mounts that hook, so mis-wiring is a test failure rather than something only the
 * iOS-only flow 122 would notice. `@levelup/hooks`'s `useConversationThread` is scripted (real
 * react-query hooks cannot mount here: two React copies, PAD-400); everything else is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { View } from "react-native";
import { renderNative } from "@/test/render-native";
import { useThreadOpen } from "./use-thread-open";

type Row = { id: number | string };
type ThreadResult = { data: { messages: Row[] } | undefined; isFetching: boolean; isError: boolean; hasMore: boolean };
const script: { result: ThreadResult; optionsSeen: unknown[] } = {
  result: { data: undefined, isFetching: false, isError: false, hasMore: false },
  optionsSeen: [],
};

vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useConversationThread: (_id: string, options: unknown) => {
    script.optionsSeen.push(options);
    return script.result;
  },
}));

let open: ReturnType<typeof useThreadOpen>;
function Probe(props: { target: string | null; cached: Row[] | null }) {
  open = useThreadOpen({
    conversationId: "1",
    target: props.target,
    queryClient: { getQueryData: (() => (props.cached ? { messages: props.cached } : undefined)) as never },
  });
  return createElement(View, { testID: "probe" });
}
const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id }));
const mount = (target: string | null, cached: Row[] | null) => renderNative(createElement(Probe, { target, cached }));

beforeEach(() => {
  script.result = { data: undefined, isFetching: false, isError: false, hasMore: false };
  script.optionsSeen = [];
});

describe("useThreadOpen: the override the thread query is given (rule 12a)", () => {
  it("a push target newer than the cached thread forces the open's own GET", async () => {
    script.result = { data: { messages: rows(1, 2) }, isFetching: true, isError: false, hasMore: false };
    await mount("3", rows(1, 2));
    expect(script.optionsSeen[0]).toEqual({ refetchOnMount: "always" });
  });

  it("a push target the cached thread holds keeps the cache", async () => {
    script.result = { data: { messages: rows(1, 2) }, isFetching: false, isError: false, hasMore: false };
    await mount("2", rows(1, 2));
    expect(script.optionsSeen[0]).toBeUndefined();
  });

  it("is decided once per open: the GET putting the target into the cache does not flip it", async () => {
    script.result = { data: { messages: rows(1, 2) }, isFetching: true, isError: false, hasMore: false };
    const n = await mount("3", rows(1, 2));
    await n.rerender(createElement(Probe, { target: "3", cached: rows(1, 2, 3) }));
    expect(script.optionsSeen.at(-1)).toEqual({ refetchOnMount: "always" });
  });
});

describe("useThreadOpen: the phase comes from the thread's own isFetching and isError", () => {
  it("a GET that ends in error is failed, not settled", async () => {
    script.result = { data: { messages: rows(1, 2) }, isFetching: true, isError: false, hasMore: false };
    const n = await mount("3", rows(1, 2));
    expect(open.openPhase).toBe("in-flight");
    script.result = { ...script.result, isFetching: false, isError: true };
    await n.rerender(createElement(Probe, { target: "3", cached: rows(1, 2) }));
    expect(open.openPhase).toBe("failed");
  });
});

describe("useThreadOpen: the target step (rule 12b)", () => {
  it("waits while the open's GET is in flight, then finds the target in its answer", async () => {
    script.result = { data: { messages: rows(1, 2) }, isFetching: true, isError: false, hasMore: true };
    const n = await mount("3", rows(1, 2));
    expect(open.targetStep("3", 0)).toEqual({ kind: "wait" });
    script.result = { data: { messages: rows(1, 2, 3) }, isFetching: false, isError: false, hasMore: true };
    await n.rerender(createElement(Probe, { target: "3", cached: rows(1, 2, 3) }));
    expect(open.targetStep("3", 0)).toEqual({ kind: "scroll", index: 2 });
  });

  it("walks older pages for a target older than the cached page, with no GET in flight (flow 103)", async () => {
    script.result = { data: { messages: rows(16, 17, 45) }, isFetching: false, isError: false, hasMore: true };
    await mount("3", rows(16, 17, 45));
    expect(open.targetStep("3", 0)).toEqual({ kind: "load-older" });
  });
});

describe("useThreadOpen: a retried landing scroll (conversation-detail rule 9b)", () => {
  it("finds the row by message id in the list as it is now, not at its old index", async () => {
    const before = rows(...Array.from({ length: 51 }, (_, i) => 2 + i)); // ids 2..52, index 50 = 52
    script.result = { data: { messages: before }, isFetching: false, isError: false, hasMore: false };
    const n = await mount(null, before);
    open.scrollStarted(52);
    script.result = { ...script.result, data: { messages: before.slice(21) } }; // the first page: 30 rows
    await n.rerender(createElement(Probe, { target: null, cached: before }));
    expect(open.retryIndex()).toBe(29);
  });

  it("drops the retry when the message is no longer loaded", async () => {
    script.result = { data: { messages: rows(1, 2, 3) }, isFetching: false, isError: false, hasMore: false };
    const n = await mount(null, rows(1, 2, 3));
    open.scrollStarted(1);
    script.result = { ...script.result, data: { messages: rows(2, 3) } };
    await n.rerender(createElement(Probe, { target: null, cached: rows(2, 3) }));
    expect(open.retryIndex()).toBeNull();
  });
});
