/** players.nickname rule 8 (PAD-660): a coach viewing a student on the attendance page sees their own name for the student. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: (opts?: { enabled?: boolean }) => (id: unknown, real: string | null | undefined) =>
    opts?.enabled && String(id) === "9" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}|${opts.name}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: unknown }) => <div>{children as never}</div> }));
vi.mock("@/components/attendance/AttendanceChart", () => ({ AttendanceChart: () => null }));
vi.mock("@/components/attendance/AttendanceHistoryList", () => ({ AttendanceHistoryList: () => null }));
vi.mock("@/components/attendance/AttendanceRangeControls", () => ({ AttendanceRangeControls: () => null }));
vi.mock("@/api/seasons", () => ({ getSeason: vi.fn().mockResolvedValue(null) }));
const hist = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/api/attendance", () => ({ getAttendanceHistory: hist.fn }));

import Page from "./AttendancePage";

const history = (playerId: number, playerName: string) => ({
  playerId, playerName, from: "2026-09-01", to: "2026-09-30", granularity: "week", total: 0, buckets: [], sessions: [],
});

describe("AttendancePage subtitle", () => {
  it("prints the nickname for one student and the real name for another", async () => {
    hist.fn.mockResolvedValueOnce(history(9, "Jorge Silva"));
    const { unmount } = render(
      <MemoryRouter initialEntries={["/players/9/attendance"]}>
        <Routes><Route path="/players/:playerId/attendance" element={<Page />} /></Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId("attendance-subject")).textContent).toBe("attendance.subtitleOther|Jorge chato");
    unmount();
    hist.fn.mockResolvedValueOnce(history(10, "Ana Pinto"));
    render(
      <MemoryRouter initialEntries={["/players/10/attendance"]}>
        <Routes><Route path="/players/:playerId/attendance" element={<Page />} /></Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId("attendance-subject")).textContent).toBe("attendance.subtitleOther|Ana Pinto");
  });
});
