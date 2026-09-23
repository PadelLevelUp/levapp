/**
 * PAD-413 (B-177, attendance.validation rule 22) — the iOS half of "an earlier refresh never
 * replaces a later one". The web queue needed a guard (`PresencesPage.loadQueue` let the last
 * response to RESOLVE win). iOS reads the queue through TanStack Query and refreshes it the way
 * `useInvalidatePresences` does: every write calls
 * `invalidateQueries({ queryKey: ["presence-pending"] })`. This drives that exact sequence on
 * query-core with fetches whose timing the test controls, so the ordering iOS relies on is
 * pinned rather than assumed.
 *
 * The React hooks themselves cannot be mounted here: the mobile harness has two React copies
 * (PAD-400). The contract under test is TanStack's, called the same way.
 */
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";

type Queue = { pending: string[]; validated: string[] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the iOS validation queue under two quick undos (PAD-413)", () => {
  it("drops an earlier refresh that resolves after a later one: the queue shows the latest state", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["presence-pending", "2026-09-21", "2026-09-27"];
    const fetches: ReturnType<typeof deferred<Queue>>[] = [];
    const observer = new QueryObserver<Queue>(client, {
      queryKey: key,
      queryFn: () => {
        const d = deferred<Queue>();
        fetches.push(d);
        return d.promise;
      },
    });
    const unsubscribe = observer.subscribe(() => {}); // active, as the mounted screen keeps it
    fetches[0].resolve({ pending: [], validated: ["A", "B", "C"] }); // the queue after a bulk run
    await flush();

    // Undo A succeeds → invalidate; undo B succeeds → invalidate, while A's refresh is in flight.
    void client.invalidateQueries({ queryKey: ["presence-pending"] });
    await flush();
    void client.invalidateQueries({ queryKey: ["presence-pending"] });
    await flush();
    expect(fetches).toHaveLength(3);

    // The LATER refresh (both undone) answers first; the EARLIER one (only A undone) answers last.
    fetches[2].resolve({ pending: ["A", "B"], validated: ["C"] });
    await flush();
    fetches[1].resolve({ pending: ["A"], validated: ["B", "C"] });
    await flush();

    expect(client.getQueryData<Queue>(key)).toEqual({ pending: ["A", "B"], validated: ["C"] });
    expect(observer.getCurrentResult().data).toEqual({ pending: ["A", "B"], validated: ["C"] });
    unsubscribe();
  });
});
