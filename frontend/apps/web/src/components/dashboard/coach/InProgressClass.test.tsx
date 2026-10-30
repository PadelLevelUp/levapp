/**
 * PAD-792 (dashboard.blocks rule 12b, B-711). At 20:23 the coach's home showed "Treino A"
 * (19:30–21:00, 0/2) as "A SEGUIR · 19:30" and as "Vazia · Convidar" in the next 7 days. The server
 * marks a class that has started `inProgress` (its clock is pinned in
 * test_pad792_started_class_on_dashboard.py); the shell reads no clock, so the payload is the input.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardNextClassBlock, DashboardSchedule7dBlock } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
import { NextClassHero } from "./NextClassHero";
import { Schedule7Days } from "./Schedule7Days";

afterEach(cleanup);

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
  it("the hero reads A DECORRER with start and end while it runs", () => {
    render(<MemoryRouter><NextClassHero block={hero(true)} /></MemoryRouter>);
    const section = screen.getByTestId("dashboard-next-class");
    expect(section).toHaveTextContent('dashboard.hero.inProgress {"start":"19:30","end":"21:00"}');
    expect(section).not.toHaveTextContent("dashboard.hero.upNext");
  });

  it("before its start the hero still reads A SEGUIR", () => {
    render(<MemoryRouter><NextClassHero block={hero(false)} /></MemoryRouter>);
    expect(screen.getByTestId("dashboard-next-class")).toHaveTextContent('dashboard.hero.upNext {"time":"19:30"}');
  });

  it("the running row has neither Vazia nor Convidar; the row that has not started keeps both", () => {
    const block = {
      id: "schedule_7d",
      type: "schedule_7d",
      data: {
        totalCount: 2,
        items: [row("lessoninstance-7", "Treino A", true), row("lessoninstance-8", "Treino B", false)],
        calendarHref: "/calendar",
      },
    } as unknown as DashboardSchedule7dBlock;

    render(<MemoryRouter><Schedule7Days block={block} /></MemoryRouter>);
    const [running, upcoming] = screen.getAllByTestId("dashboard-schedule-row");
    expect(running).toHaveTextContent("Treino A");
    expect(running).not.toHaveTextContent("dashboard.schedule.empty");
    expect(within(running).queryByTestId("dashboard-schedule-invite")).toBeNull();
    expect(upcoming).toHaveTextContent("dashboard.schedule.empty");
    expect(within(upcoming).getByTestId("dashboard-schedule-invite")).toBeInTheDocument();
  });
});
