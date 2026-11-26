/**
 * dashboard.blocks rule 15 (UI idea 7): a metric tile's number is the largest text on its tile.
 * The coach's two `week_pulse` cards and the student's four `kpi_grid` tiles share ONE class
 * constant, `METRIC_NUMBER_CLASS`: 32px, 40px from 1024px, display face, tabular, on one line.
 * Arbitrary values are used on purpose: Tailwind's own `text-3xl` is 30px and `text-4xl` 36px.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardKpiGridBlock, DashboardWeekPulseBlock } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));

import { METRIC_NUMBER_CLASS } from "./primitives";
import { KpiTiles } from "./KpiTiles";
import { WeekPulse } from "./WeekPulse";

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

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const numberOf = (tile: HTMLElement) => {
  const hits = tile.querySelectorAll(".font-display");
  expect(hits.length, "one display-face number per tile").toBe(1);
  return hits[0] as HTMLElement;
};

describe("metric tile number size", () => {
  it("[DASHBOARD-BLOCKS-65] every metric tile uses the shared metric size", () => {
    // the constant itself: 32px, 40px from 1024px, display face, tabular, one line
    const own = METRIC_NUMBER_CLASS.split(/\s+/);
    for (const t of ["font-display", "text-[32px]", "lg:text-[40px]", "tabular-nums", "whitespace-nowrap"]) {
      expect(own, `METRIC_NUMBER_CLASS has ${t}`).toContain(t);
    }

    render(
      <MemoryRouter>
        <WeekPulse block={pulse} />
        <KpiTiles block={kpis} />
      </MemoryRouter>,
    );

    const tiles = [
      "dashboard-pulse-seats-filled",
      "dashboard-pulse-active-players",
      "dashboard-kpi-attended",
      "dashboard-kpi-missed",
      "dashboard-kpi-upcoming-lessons",
      "dashboard-kpi-invites",
    ].map((id) => screen.getByTestId(id));

    for (const tile of tiles) {
      const num = numberOf(tile);
      for (const t of own) expect(tokens(num), `${tile.getAttribute("data-testid")} number has ${t}`).toContain(t);
      // no smaller size class left on the number
      expect(tokens(num).filter((c) => /^(lg:)?text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(c))).toEqual([]);
      // the line of context under the number is still there
      const spans = Array.from(tile.querySelectorAll(":scope > span"));
      expect(spans.length, "label, number, sub line").toBeGreaterThanOrEqual(3);
      expect(spans[spans.length - 1].textContent?.length ?? 0, "context line").toBeGreaterThan(0);
    }

    // a three-digit count and 100% read whole, and the percent sign stays smaller and muted
    expect(screen.getByTestId("dashboard-pulse-active-players").textContent).toContain("123");
    const seats = numberOf(screen.getByTestId("dashboard-pulse-seats-filled"));
    expect(seats.textContent).toBe("100%");
    const pct = seats.querySelector("span") as HTMLElement;
    expect(tokens(pct)).toContain("text-base");
    expect(tokens(pct)).toContain("text-muted-foreground");
    // the accessible names do not change
    expect(screen.getByTestId("dashboard-pulse-seats-filled").getAttribute("aria-label")).toBe(
      "dashboard.pulse.seatsFilled: 100%",
    );
  });
});
