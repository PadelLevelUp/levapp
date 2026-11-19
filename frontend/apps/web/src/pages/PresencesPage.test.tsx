/**
 * PAD-837 (attendance.validation rules 17f, 17g, 17a): the Presences tab's one period. The page
 * runs for real over the shared hooks; the API modules are the seam (the mocks echo what they were
 * asked, the server's own behaviour is pytest's). Asserted on i18n keys and test ids, not copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { presencePeriod } from "@levelup/config";
import PresencesPage from "./PresencesPage";

vi.mock("react-i18next", () => {
  const translation = {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && "from" in opts ? `${key}:${String(opts.from)}|${String(opts.to)}` : key,
    i18n: { language: "en" },
  };
  return { useTranslation: () => translation };
});
vi.mock("@/hooks/use-toast", () => {
  const toaster = { toast: () => {} };
  return { useToast: () => toaster };
});
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/presences/PresenceCharts", () => ({ PresenceCharts: () => null }));
// The validation view, reduced to its week: what it shows and the control that moves it.
vi.mock("@/components/presences/ValidateClassesDialog", () => ({
  ValidateClassesDialog: (props: { weekOffset: number; onWeekChange: (offset: number) => void }) => (
    <div>
      <span data-testid="fake-validation-week">{props.weekOffset}</span>
      <button data-testid="fake-week-back" onClick={() => props.onWeekChange(props.weekOffset - 1)} />
    </div>
  ),
}));
vi.mock("@/api/presences", () => ({
  unvalidateClass: vi.fn().mockResolvedValue(undefined),
  validateClassPresences: vi.fn().mockResolvedValue(undefined),
}));

const ana = {
  playerId: 1, name: "Ana", displayName: "Ana", total: 3, private: 1, academy: 2, justified: 0, unjustified: 0,
  invitesReceived: 0, invitesJoined: 0, presenceMinutes: 180, justifiedMinutes: 0, guestPresenceMinutes: 0,
};
const api = vi.hoisted(() => ({
  stats: vi.fn(),
  trend: vi.fn(),
  pending: vi.fn(),
  count: vi.fn(),
  viewGet: vi.fn(),
  viewPut: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/presences", () => ({
  getPresenceStats: api.stats,
  getPresenceTrend: api.trend,
  getPendingValidation: api.pending,
  getPendingValidationCount: api.count,
  getPendingValidationBadge: vi.fn().mockResolvedValue({ pendingCount: 0 }),
}));
vi.mock("@levelup/api/src/resources/presencesView", () => ({
  getCoachPresencesView: api.viewGet,
  putCoachPresencesView: api.viewPut,
}));
vi.mock("@levelup/api/src/resources/players", () => ({
  getCoachPlayers: vi.fn().mockResolvedValue([]),
}));

/** The server echoes the asked bounds, its `to` read up to the end of the day (rule 17h). */
const echo = (p: { from?: string; to?: string }) => ({ from: p.from ?? "?", to: `${p.to ?? "?"}T23:59:59` });

beforeEach(() => {
  api.stats.mockReset().mockImplementation(async (p) => ({ ...echo(p), players: [ana], totals: {} }));
  api.trend.mockReset().mockImplementation(async (p) => ({ ...echo(p), granularity: "day", total: 0, buckets: [] }));
  api.pending.mockReset().mockResolvedValue({ pending: [], validated: [] });
  api.count.mockReset().mockResolvedValue({ pendingCount: 0, pendingTotal: 0 });
  api.viewGet.mockReset().mockResolvedValue({ presencesView: null });
  api.viewPut.mockReset().mockImplementation(async (view) => ({ presencesView: view }));
});
afterEach(() => vi.restoreAllMocks());

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/presences"]}>
        <PresencesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, client };
}

const label = () => screen.getByTestId("presences-period-label").textContent;
const lastStats = () => api.stats.mock.calls.at(-1)?.[0];
const lastTrend = () => api.trend.mock.calls.at(-1)?.[0];
const thisMonth = () => presencePeriod("thisMonth")!;
const lastMonth = () => presencePeriod("lastMonth")!;

describe("the Presences period (PAD-837)", () => {
  it("[ATTENDANCE-VALIDATION-67] shows the period the server echoed", async () => {
    renderPage();
    await waitFor(() => expect(lastStats()).toEqual(thisMonth()));

    fireEvent.click(screen.getByTestId("presences-period-custom"));
    fireEvent.change(screen.getByTestId("presences-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("presences-period-to"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByTestId("presences-period-apply"));

    // Both reads ask for the same bounds.
    await waitFor(() => expect(lastStats()).toEqual({ from: "2026-09-01", to: "2026-10-01" }));
    await waitFor(() => expect(lastTrend()).toEqual({ from: "2026-09-01", to: "2026-10-01" }));
    // The label is the payload's, day only.
    await waitFor(() => expect(label()).toBe("presences.period.showing:01/09/2026|01/10/2026"));

    // A reversed range is not applied.
    const asked = api.stats.mock.calls.length;
    fireEvent.change(screen.getByTestId("presences-period-from"), { target: { value: "2026-10-02" } });
    expect(screen.getByTestId("presences-period-apply")).toBeDisabled();
    expect(api.stats.mock.calls.length).toBe(asked);
  });

  it("[ATTENDANCE-VALIDATION-71] keeps the validation week apart from the period", async () => {
    renderPage();
    await waitFor(() => expect(api.pending).toHaveBeenCalled());
    const weekAsked = api.pending.mock.calls.at(-1)?.[0];

    // A new period moves the statistics, not the validation week.
    fireEvent.click(screen.getByTestId("presences-period-lastMonth"));
    await waitFor(() => expect(lastStats()).toEqual(lastMonth()));
    expect(screen.getByTestId("fake-validation-week").textContent).toBe("0");
    expect(api.pending.mock.calls.at(-1)?.[0]).toEqual(weekAsked);

    // A new week moves the validation view, not the period.
    const statsAsked = api.stats.mock.calls.length;
    fireEvent.click(screen.getByTestId("fake-week-back"));
    await waitFor(() => expect(screen.getByTestId("fake-validation-week").textContent).toBe("-1"));
    await waitFor(() => expect(api.pending.mock.calls.at(-1)?.[0]).not.toEqual(weekAsked));
    expect(api.stats.mock.calls.length).toBe(statsAsked);
    expect(lastStats()).toEqual(lastMonth());
    // The count read is the week's, with the whole backlog beside it (rule 18), whatever the period.
    expect(api.count.mock.calls.at(-1)?.[0]).toEqual(api.pending.mock.calls.at(-1)?.[0]);
  });

  it("[ATTENDANCE-VALIDATION-72] opens on the default period and sort", async () => {
    const first = renderPage();
    await waitFor(() => expect(lastStats()).toEqual(thisMonth()));
    expect(screen.getByTestId("presences-period-thisMonth").getAttribute("aria-pressed")).toBe("true");

    // For this visit: last month, sorted by name.
    fireEvent.click(screen.getByTestId("presences-period-lastMonth"));
    await waitFor(() => expect(lastStats()).toEqual(lastMonth()));
    fireEvent.click(screen.getByRole("button", { name: "presences.column.name" }));
    expect(screen.getByRole("columnheader", { name: /presences\.column\.name/ }).getAttribute("aria-sort")).toBe("ascending");
    first.unmount();

    // Back on the tab: "Este mês" and the default sort again.
    renderPage(first.client);
    await waitFor(() => expect(screen.getByTestId("presences-period-thisMonth").getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(lastStats()).toEqual(thisMonth()));
    expect(screen.getByRole("columnheader", { name: /presences\.column\.total/ }).getAttribute("aria-sort")).toBe("descending");
  });

  it("[ATTENDANCE-VALIDATION-72] opens on the coach's saved default, and 'make default' saves it with the columns", async () => {
    api.viewGet.mockResolvedValue({ presencesView: { columns: ["total", "justified"], defaultPeriod: "lastMonth" } });
    const first = renderPage();
    await waitFor(() => expect(lastStats()).toEqual(lastMonth()));
    expect(screen.getByTestId("presences-period-is-default")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("presences-period-thisWeek"));
    fireEvent.click(screen.getByTestId("presences-period-make-default"));
    await waitFor(() => expect(api.viewPut).toHaveBeenCalledTimes(1));
    expect(api.viewPut).toHaveBeenCalledWith({ columns: ["name", "total", "justified"], defaultPeriod: "thisWeek" });
    first.unmount();

    // The next open starts from it.
    renderPage(first.client);
    await waitFor(() => expect(lastStats()).toEqual(presencePeriod("thisWeek")));
    expect(within(screen.getByTestId("presences-period")).getByTestId("presences-period-is-default")).toBeInTheDocument();
  });
});
