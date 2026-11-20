/**
 * players.profile rule 12 (PAD-834): Block 3, Assiduidade, on iOS — one period for both cards, the
 * server's totals, the list in place, empty cards with disabled toggles, "Época" only with a
 * current season, and "Ver página completa" to the full screens (attendance.history rule 17,
 * attendance.absences rule 12).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("./AttendanceChart", async () => {
  const { View } = await import("react-native");
  const React = await import("react");
  return { AttendanceChart: () => React.createElement(View, { testID: "chart-stub" }) };
});

const session = (id: number) => ({
  lessonInstanceId: id, calendarEventId: `lessoninstance-${id}`, title: `Aula ${id}`,
  startDatetime: "2026-11-10T10:00:00", date: "2026-11-10",
  href: `/calendar?classId=lessoninstance-${id}&date=2026-11-10`, justification: "justified",
});
const history = (n: number) => ({ total: n, granularity: "day", buckets: [], sessions: Array.from({ length: n }, (_, i) => session(i + 1)) });

const api = vi.hoisted(() => ({ attendance: vi.fn(), absences: vi.fn(), season: vi.fn() }));
vi.mock("@levelup/api/src/resources/attendance", async (orig) => ({
  ...(await orig<object>()),
  getAttendanceHistory: (...a: unknown[]) => api.attendance(...a),
  getAbsenceHistory: (...a: unknown[]) => api.absences(...a),
}));
vi.mock("@levelup/api", async (orig) => ({
  ...(await orig<object>()),
  seasonsApi: { getSeason: (...a: unknown[]) => api.season(...a) },
}));

import { AttendanceBlock } from "./attendance-block";

const NOW = new Date("2026-11-19T12:00:00Z");
const onOpenFull = vi.fn();

beforeEach(() => {
  api.attendance.mockReset().mockImplementation(async ({ from }: { from: string }) => history(from.endsWith("-01-01") ? 8 : 3));
  api.absences.mockReset().mockImplementation(async () => history(1));
  api.season.mockReset().mockResolvedValue(null);
  onOpenFull.mockReset();
});

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const n = await renderNative(
    createElement(QueryClientProvider, { client }, createElement(AttendanceBlock, { playerId: "7", onOpenFull, now: NOW })),
  );
  await n.flush();
  await n.flush();
  return n;
}
const rows = (n: Awaited<ReturnType<typeof mount>>, prefix: string) =>
  n.root.root.findAll((x) => x.props?.testID === `${prefix}-history-item` && typeof x.type === "string").length;

describe("AttendanceBlock on iOS (PAD-834)", () => {
  it("[PLAYERS-PROFILE-18] the same on iOS", async () => {
    const n = await mount();
    expect(n.byTestId("profile-attendance-card").props.accessibilityHint).toBe("3");
    expect(n.byTestId("profile-absences-card").props.accessibilityHint).toBe("1");
    expect(api.attendance).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-11-01", to: "2026-11-30" });

    await n.press("profile-attendance-toggle");
    expect(rows(n, "profile-attendance")).toBe(3);

    await n.press("profile-period-1y");
    await n.flush();
    await n.flush();
    expect(n.byTestId("profile-attendance-card").props.accessibilityHint).toBe("8");
    expect(rows(n, "profile-attendance")).toBe(8);
  });

  it("[PLAYERS-PROFILE-18] an empty period disables both toggles on iOS", async () => {
    api.attendance.mockImplementation(async () => history(0));
    api.absences.mockImplementation(async () => history(0));
    const n = await mount();
    expect(n.queryByTestId("profile-attendance-empty")).not.toBeNull();
    expect(n.byTestId("profile-attendance-toggle").props.disabled).toBe(true);
    expect(n.byTestId("profile-absences-toggle").props.disabled).toBe(true);
  });

  it("[PLAYERS-PROFILE-19] the same on iOS", async () => {
    const without = await mount();
    expect(without.queryByTestId("profile-period-season")).toBeNull();
    api.season.mockResolvedValue({ current: { startDate: "2026-09-01", endDate: "2027-07-31", label: "2026/2027" } });
    const withSeason = await mount();
    await withSeason.press("profile-period-season");
    await withSeason.flush();
    expect(api.attendance).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-09-01", to: "2027-07-31" });
    expect(api.absences).toHaveBeenLastCalledWith({ playerId: "7", from: "2026-09-01", to: "2027-07-31" });
  });

  it("[ATTENDANCE-HISTORY-10] the full-page link routes to the player's attendance screen", async () => {
    const n = await mount();
    await n.press("profile-attendance-toggle");
    await n.press("profile-attendance-full");
    expect(onOpenFull).toHaveBeenCalledWith("attendance");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toMatch(/pathname: kind === "attendance" \? "\/attendance" : "\/absences",\s*params: \{ playerId: String\(player\.playerId\) \}/);
  });

  it("[ATTENDANCE-ABSENCES-10] the full-page link routes to the player's absences screen", async () => {
    const n = await mount();
    await n.press("profile-absences-toggle");
    expect(n.queryByTestId("absences-justification-justified")).not.toBeNull();
    await n.press("profile-absences-full");
    expect(onOpenFull).toHaveBeenCalledWith("absences");
  });
});
