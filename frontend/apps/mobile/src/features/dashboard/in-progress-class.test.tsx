/**
 * PAD-792 (dashboard.blocks rule 12b, B-711). At 20:23 the coach's home showed "Treino A"
 * (19:30–21:00, 0/2) as "A SEGUIR · 19:30" in the hero and "Vazia" in the next 7 days. The server
 * now marks a class that has started `inProgress` (its clock is pinned in
 * test_pad792_started_class_on_dashboard.py); the shell never reads a clock, so these payloads are
 * the whole input: the hero reads "A DECORRER · 19:30–21:00" and the row has no seats badge.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { DashboardNextClassBlock, DashboardSchedule7dBlock } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
// `./blocks` pulls in `@/components/ui/toast`, which reaches `@expo/vector-icons` at import time.
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NextClassHero, Schedule7Days } from "./blocks";

const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const hero = (inProgress: boolean) =>
  ({
    id: "next_class",
    type: "next_class",
    data: {
      classId: "lessoninstance-7",
      title: "Treino A",
      date: "2026-10-29",
      startTime: "19:30",
      endTime: "21:00",
      isToday: true,
      inProgress,
      weekday: "Thursday",
      minutesUntil: null,
      filled: 0,
      capacity: 2,
      players: [],
      href: "/calendar?classId=lessoninstance-7&date=2026-10-29",
    },
  }) as unknown as DashboardNextClassBlock;

const row = (id: string, title: string, inProgress: boolean) => ({
  id,
  title,
  date: "2026-10-29",
  weekday: "Thursday",
  dayOfMonth: 29,
  timeLabel: "19:30",
  filled: 0,
  capacity: 2,
  href: `/calendar?classId=${id}&date=2026-10-29`,
  inProgress,
  ...(inProgress ? {} : { inviteHref: `/calendar?classId=${id}&date=2026-10-29&notify=1` }),
});

describe("a class that has started on the coach's home (PAD-792)", () => {
  it("the hero reads A DECORRER with start and end while it runs", async () => {
    const n = await renderNative(createElement(NextClassHero, { block: hero(true) }));
    const all = text(n.byTestId("dashboard-next-class"));
    expect(all).toContain('dashboard.hero.inProgress {"start":"19:30","end":"21:00"}');
    expect(all).not.toContain("dashboard.hero.upNext");
  });

  it("before its start the hero still reads A SEGUIR", async () => {
    const n = await renderNative(createElement(NextClassHero, { block: hero(false) }));
    const all = text(n.byTestId("dashboard-next-class"));
    expect(all).toContain('dashboard.hero.upNext {"time":"19:30"}');
    expect(all).not.toContain("dashboard.hero.inProgress");
  });

  it("the running row has no seats badge; the row that has not started keeps its Vazia", async () => {
    const block = {
      id: "schedule_7d",
      type: "schedule_7d",
      data: {
        totalCount: 2,
        items: [row("lessoninstance-7", "Treino A", true), row("lessoninstance-8", "Treino B", false)],
        calendarHref: "/calendar",
      },
    } as unknown as DashboardSchedule7dBlock;

    const n = await renderNative(createElement(Schedule7Days, { block }));
    const rows = n.root.root.findAll((node) => node.props.testID === "dashboard-schedule-row");
    // Host and composite both carry the testID; keep one per row.
    const hosts = rows.filter((node) => typeof node.type === "string");
    expect(hosts.map(text).map((t) => t.includes("Treino A"))).toEqual([true, false]);
    const [running, upcoming] = hosts.map(text);
    expect(running).not.toContain("dashboard.schedule.empty");
    expect(running).not.toContain("dashboard.schedule.invite");
    expect(upcoming).toContain("dashboard.schedule.empty");
  });
});
