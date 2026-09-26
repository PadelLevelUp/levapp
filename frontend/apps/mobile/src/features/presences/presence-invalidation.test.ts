/**
 * PAD-443 (attendance.validation rule 23, "Fresh") on iOS: a validate, a bulk validate or an undo
 * refreshes the Presences tab badge. Every write runs `invalidateAfterPresenceWrite`; this drives
 * it on query-core against the badge's real key, with an active observer standing in for the
 * mounted tab bar. The hooks cannot be mounted here (two React copies, PAD-400).
 */
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { queryKeys } from "@levelup/hooks/src/queryKeys";
import { invalidateAfterPresenceWrite } from "./presence-invalidation";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a presence write refreshes the Presences tab badge (PAD-443)", () => {
  it("refetches the badge query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.pendingValidationBadge,
      queryFn: async () => ({ count: ++fetches, weekOffset: 0, href: "/presences" }),
    });
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    expect(fetches).toBe(1);

    await invalidateAfterPresenceWrite(client);
    await flush();

    expect(fetches).toBe(2);
    unsubscribe();
  });
});
