// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement, useState } from "react";

/**
 * PAD-837 (attendance.validation rule 17g): the tab's statistics and trend read one window. Both
 * hooks send the same `from`/`to`, both keys carry them, and a new period refetches both.
 */
const api = vi.hoisted(() => ({
  stats: vi.fn(async (p: { from?: string; to?: string }) => ({ ...p, players: [], totals: {} })),
  trend: vi.fn(async (p: { from?: string; to?: string }) => ({ ...p, buckets: [] })),
}));
vi.mock("@levelup/api/src/resources/presences", () => ({
  getPresenceStats: api.stats,
  getPresenceTrend: api.trend,
}));

import { usePresenceStats, usePresenceTrend, type PresencePeriodBounds } from "./presences";
import { queryKeys } from "./queryKeys";

describe("usePresenceStats and usePresenceTrend (PAD-837)", () => {
  it("[ATTENDANCE-VALIDATION-67] keys stats and trend by the same period", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const september = { from: "2026-09-01", to: "2026-10-01" };
    const october = { from: "2026-10-01", to: "2026-10-31" };

    const { result } = renderHook(
      () => {
        const [period, setPeriod] = useState<PresencePeriodBounds>(september);
        return { stats: usePresenceStats(period), trend: usePresenceTrend([2, 1], period), setPeriod };
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.stats.isSuccess && result.current.trend.isSuccess).toBe(true));

    // Both requests carry the bounds; both keys carry them.
    expect(api.stats).toHaveBeenLastCalledWith(september);
    expect(api.trend).toHaveBeenLastCalledWith({ ...september, playerIds: [2, 1] });
    expect(client.getQueryData(queryKeys.presenceStats(september.from, september.to))).toBeDefined();
    expect(client.getQueryData(queryKeys.presenceTrend("1,2", september.from, september.to))).toBeDefined();

    // Another period refetches both, never one.
    const statsCalls = api.stats.mock.calls.length;
    const trendCalls = api.trend.mock.calls.length;
    act(() => result.current.setPeriod(october));
    await waitFor(() => expect(result.current.stats.data).toMatchObject(october));
    await waitFor(() => expect(result.current.trend.data).toMatchObject(october));
    expect(api.stats.mock.calls.length).toBe(statsCalls + 1);
    expect(api.trend.mock.calls.length).toBe(trendCalls + 1);
    expect(api.stats).toHaveBeenLastCalledWith(october);
    expect(api.trend).toHaveBeenLastCalledWith({ ...october, playerIds: [2, 1] });
  });

  it("keeps every presence read under the prefixes a write invalidates", () => {
    expect(queryKeys.presenceStats("2026-09-01", "2026-10-01").slice(0, 1)).toEqual([
      ...queryKeys.presenceStatsPrefix,
    ]);
    expect(queryKeys.presenceTrend("all", "2026-09-01", "2026-10-01").slice(0, 1)).toEqual([
      ...queryKeys.presenceTrendPrefix,
    ]);
  });
});
