/**
 * players.profile rule 12 (PAD-834): Block 3, Assiduidade — one period for both cards, the server's
 * totals, the list in place (no navigation), empty cards with disabled toggles, and "Época" only
 * with a current season.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const session = (id: number) => ({
  lessonInstanceId: id, calendarEventId: `lessoninstance-${id}`, title: `Aula ${id}`,
  startDatetime: "2026-11-10T10:00:00", date: "2026-11-10",
  href: `/calendar?classId=lessoninstance-${id}&date=2026-11-10`, justification: "justified",
});
const history = (n: number) => ({
  total: n, granularity: "day", buckets: [], sessions: Array.from({ length: n }, (_, i) => session(i + 1)),
});

const api = vi.hoisted(() => ({
  attendance: vi.fn(),
  absences: vi.fn(),
  season: vi.fn(),
}));
vi.mock("@/api/attendance", () => ({ getAttendanceHistory: (...a: unknown[]) => api.attendance(...a) }));
vi.mock("@/api/absences", () => ({ getAbsenceHistory: (...a: unknown[]) => api.absences(...a) }));
vi.mock("@/api/seasons", () => ({ getSeason: (...a: unknown[]) => api.season(...a) }));
vi.mock("@/components/attendance/AttendanceChart", () => ({
  AttendanceChart: () => <div data-testid="chart-stub" />,
}));

import { PlayerAttendanceBlock } from "./PlayerAttendanceBlock";

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

// 3 presences and 1 absence this month; 8 presences this year.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  api.attendance.mockReset().mockImplementation(async ({ from }: { from: string }) =>
    history(from.endsWith("-01-01") ? 8 : 3));
  api.absences.mockReset().mockImplementation(async () => history(1));
  api.season.mockReset().mockResolvedValue(null);
});

let path = "";
function Probe() {
  path = useLocation().pathname;
  return null;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/players/7"]}>
      <Probe />
      <Routes>
        <Route path="*" element={<PlayerAttendanceBlock playerId="7" />} />
      </Routes>
    </MemoryRouter>,
  );

describe("PlayerAttendanceBlock (PAD-834)", () => {
  it("[PLAYERS-PROFILE-18] totals and lists follow the shared period", async () => {
    mount();
    const presences = await screen.findByTestId("profile-attendance-card");
    await waitFor(() => expect(presences).toHaveAttribute("data-total", "3"));
    expect(screen.getByTestId("profile-absences-card")).toHaveAttribute("data-total", "1");
    expect(screen.getByTestId("profile-period-1m")).toHaveAttribute("aria-pressed", "true");
    expect(api.attendance).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-11-01", to: "2026-11-30" });
    expect(api.absences).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-11-01", to: "2026-11-30" });

    fireEvent.click(screen.getByTestId("profile-attendance-toggle"));
    const list = within(screen.getByTestId("profile-attendance-list"));
    expect(list.getAllByText(/^Aula \d+$/)).toHaveLength(3);
    expect(path).toBe("/players/7"); // listed in place, no navigation

    fireEvent.click(screen.getByTestId("profile-period-1y"));
    await waitFor(() => expect(presences).toHaveAttribute("data-total", "8"));
    expect(screen.getByTestId("profile-absences-card")).toHaveAttribute("data-total", "1");
    expect(within(screen.getByTestId("profile-attendance-list")).getAllByText(/^Aula \d+$/)).toHaveLength(8);

    // The absences list carries the justification badge; "Ver página completa" opens the page.
    fireEvent.click(screen.getByTestId("profile-absences-toggle"));
    expect(within(screen.getByTestId("profile-absences-list")).getByTestId("absences-justification")).toBeTruthy();
    fireEvent.click(screen.getByTestId("profile-absences-full"));
    expect(path).toBe("/players/7/absences");
  });

  it("[PLAYERS-PROFILE-18] an empty period says so and disables both toggles", async () => {
    api.attendance.mockImplementation(async () => history(0));
    api.absences.mockImplementation(async () => history(0));
    mount();
    expect(await screen.findByTestId("profile-attendance-empty")).toBeTruthy();
    expect(screen.getByTestId("profile-absences-empty")).toBeTruthy();
    expect(screen.getByTestId("profile-attendance-toggle")).toBeDisabled();
    expect(screen.getByTestId("profile-absences-toggle")).toBeDisabled();
  });

  it("[PLAYERS-PROFILE-19] the season chip needs a current occurrence", async () => {
    const without = mount();
    await waitFor(() => expect(api.season).toHaveBeenCalled());
    expect(screen.queryByTestId("profile-period-season")).toBeNull();
    expect(screen.getByTestId("profile-period-1w")).toBeTruthy();
    without.unmount();

    api.season.mockResolvedValue({ current: { startDate: "2026-09-01", endDate: "2027-07-31", label: "2026/2027" } });
    mount();
    fireEvent.click(await screen.findByTestId("profile-period-season"));
    await waitFor(() =>
      expect(api.attendance).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-09-01", to: "2027-07-31" }));
    expect(api.absences).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-09-01", to: "2027-07-31" });
  });
});
