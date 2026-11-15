/**
 * PAD-837c on iOS (attendance.validation rules 17a, 17g; criteria 67, 71, 72): the screen's
 * reads and what an open starts from, driven through the feature hooks on a real
 * `QueryClientProvider` with the API resource mocked. The screen itself (charts, router, sheets)
 * is Maestro's; what it asks the server, with which keys, and what it shows as the period, is here.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({
  getPresenceStats: vi.fn(),
  getPresenceTrend: vi.fn(),
  getPendingValidation: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/presences", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPresenceStats: (...a: unknown[]) => api.getPresenceStats(...a),
  getPresenceTrend: (...a: unknown[]) => api.getPresenceTrend(...a),
  getPendingValidation: (...a: unknown[]) => api.getPendingValidation(...a),
}));

import { usePendingValidation, usePresenceStats, usePresenceTrend, weekBounds } from "./hooks";
import { echoedPeriodLabel, effectiveChoice, periodBounds, shortcutChoice, tabOpenState } from "./presences-period";
import { DEFAULT_SORT } from "./report-state";
import type { PresencePeriodChoice } from "./presences-period";

/** The screen's reads, as the screen wires them: one period for stats and trend, the week apart. */
function Reads({ choice, weekOffset }: { choice: PresencePeriodChoice; weekOffset: number }) {
  const period = periodBounds(choice)!;
  const stats = usePresenceStats(period);
  usePresenceTrend(undefined, period);
  usePendingValidation(weekBounds(weekOffset));
  return <View testID="period-label" accessibilityLabel={echoedPeriodLabel(stats.data) ?? "…"} />;
}

function mount(client: QueryClient, choice: PresencePeriodChoice, weekOffset = 0) {
  return (
    <QueryClientProvider client={client}>
      <Reads choice={choice} weekOffset={weekOffset} />
    </QueryClientProvider>
  );
}

describe("PresencesScreen reads (PAD-837c)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    api.getPresenceStats.mockImplementation(async ({ from, to }: { from: string; to: string }) => ({
      // The server reads a running period only up to today (rule 17h) and echoes what it read.
      from: `${from}T00:00:00`,
      to: `${to < "2026-11-15" ? to : "2026-11-15"}T23:59:59`,
      players: [],
      totals: {},
    }));
    api.getPresenceTrend.mockResolvedValue({ from: "", to: "", granularity: "day", total: 0, buckets: [] });
    api.getPendingValidation.mockResolvedValue({ pending: [], validated: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("[ATTENDANCE-VALIDATION-67] shows the period the server echoed, and asks stats and trend for the same bounds", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = await renderNative(mount(client, { kind: "custom", from: "2026-09-01", to: "2026-10-01" }));
    await ui.flush();
    expect(api.getPresenceStats).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-10-01" });
    expect(api.getPresenceTrend).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-10-01" });
    const keys = client.getQueryCache().findAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(["presence-stats", "2026-09-01", "2026-10-01"]);
    expect(keys).toContainEqual(["presence-trend", "all", "2026-09-01", "2026-10-01"]);
    expect(ui.byTestId("period-label").props.accessibilityLabel).toBe("01/09/2026 – 01/10/2026");

    // "Este mês" asks for the 30th; the label is what the server read, up to today.
    await ui.rerender(mount(client, shortcutChoice("thisMonth")));
    await ui.flush();
    expect(api.getPresenceStats).toHaveBeenLastCalledWith({ from: "2026-11-01", to: "2026-11-30" });
    expect(api.getPresenceTrend).toHaveBeenLastCalledWith({ from: "2026-11-01", to: "2026-11-30" });
    expect(api.getPresenceStats).toHaveBeenCalledTimes(2);
    expect(api.getPresenceTrend).toHaveBeenCalledTimes(2);
    expect(ui.byTestId("period-label").props.accessibilityLabel).toBe("01/11/2026 – 15/11/2026");
  });

  it("[ATTENDANCE-VALIDATION-71] keeps the validation week apart from the period", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = await renderNative(mount(client, shortcutChoice("lastMonth"), 0));
    await ui.flush();
    const week = weekBounds(0);
    expect(api.getPendingValidation).toHaveBeenCalledWith(week);
    // A new period refetches the reporting reads and leaves the week alone…
    await ui.rerender(mount(client, shortcutChoice("thisWeek"), 0));
    await ui.flush();
    expect(api.getPendingValidation).toHaveBeenCalledTimes(1);
    expect(api.getPresenceStats).toHaveBeenCalledTimes(2);
    // …and a new week leaves the period alone.
    await ui.rerender(mount(client, shortcutChoice("thisWeek"), -1));
    await ui.flush();
    expect(api.getPendingValidation).toHaveBeenLastCalledWith(weekBounds(-1));
    expect(api.getPresenceStats).toHaveBeenCalledTimes(2);
    expect(weekBounds(-1)).not.toEqual(periodBounds(shortcutChoice("thisWeek")));
  });

  it("[ATTENDANCE-VALIDATION-72] opens on the default period and sort, whatever was picked before", () => {
    // The screen resets to `tabOpenState()` on every focus; a null choice is the coach's default.
    const open = tabOpenState();
    expect(effectiveChoice(open.choice, "lastMonth")).toEqual(shortcutChoice("lastMonth"));
    expect(open.sort).toEqual(DEFAULT_SORT);
  });
});
