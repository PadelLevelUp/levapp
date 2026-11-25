/**
 * dashboard.blocks rule 15 (UI idea 7), iOS: the coach's two `week_pulse` cards and the student's
 * four `kpi_grid` tiles share ONE class constant, `METRIC_NUMBER_CLASS` (32px, display face,
 * tabular). The number is one line and shrinks to fit its tile at a larger text size.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardKpiGridBlock, DashboardWeekPulseBlock } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { KpiTiles, METRIC_NUMBER_CLASS, WeekPulse } from "./blocks";

const pulse = {
  id: "week_pulse",
  type: "week_pulse",
  data: {
    seatsFilled: { pct: 100, filled: 16, total: 16, deltaPct: null, trend: [100, 100, 100, 100, 100, 100, 100] },
    players: { active: 123, total: 140, idle: 17 },
  },
} as unknown as DashboardWeekPulseBlock;

const kpis = {
  id: "kpi_grid",
  type: "kpi_grid",
  data: {
    items: [
      { label: "Attended", value: 123, total: 150 },
      { label: "Missed", value: 18, total: 150 },
      { label: "Upcoming lessons", value: 36 },
      { label: "Invites", value: 0 },
    ],
  },
} as unknown as DashboardKpiGridBlock;

const tokens = (node: { props: { className?: unknown } }) => String(node.props.className ?? "").split(/\s+/);

describe("metric tile number size (iOS)", () => {
  it("[DASHBOARD-BLOCKS-66] every metric tile uses the shared metric size", async () => {
    const own = String(METRIC_NUMBER_CLASS).split(/\s+/);
    for (const t of ["font-display", "text-[32px]", "tabular-nums"]) expect(own, `METRIC_NUMBER_CLASS has ${t}`).toContain(t);

    const coach = await renderNative(createElement(WeekPulse, { block: pulse }));
    const student = await renderNative(createElement(KpiTiles, { block: kpis }));
    const tiles: Array<[typeof coach, string, string]> = [
      [coach, "dashboard-pulse-seats-filled", "100%"],
      [coach, "dashboard-pulse-active-players", "123"],
      [student, "dashboard-kpi-attended", "123"],
      [student, "dashboard-kpi-missed", "18"],
      [student, "dashboard-kpi-upcoming-lessons", "36"],
      [student, "dashboard-kpi-invites", "0"],
    ];

    for (const [n, id, text] of tiles) {
      const tile = n.byTestId(id);
      const num = tile.findAll((x) => typeof x.type === "string" && tokens(x).includes("font-display"));
      expect(num.length, `${id}: one display-face number`).toBe(1);
      for (const t of own) expect(tokens(num[0]), `${id} number has ${t}`).toContain(t);
      expect(tokens(num[0]).filter((c) => /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(c))).toEqual([]);
      // one line, shrunk to fit its tile
      expect(num[0].props.numberOfLines, `${id} one line`).toBe(1);
      expect(num[0].props.adjustsFontSizeToFit, `${id} shrinks to fit`).toBe(true);
      expect(String(num[0].props.children)).toBe(text);
      // the accessible name still carries the value, the context line is still there
      expect(String(tile.props.accessibilityLabel)).toMatch(new RegExp(`: ${text.replace("%", "%")}$`));
      const texts = tile.findAll((x) => typeof x.type === "string" && typeof x.props.children === "string" && x.props.className !== undefined);
      expect(texts.length, `${id}: label, number, context`).toBeGreaterThanOrEqual(3);
    }
  });
});
