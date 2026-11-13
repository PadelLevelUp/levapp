/**
 * PAD-932 (dashboard.blocks NA5): a manual invitation on a new-engine class goes through the
 * engine, so the coach's 7-day schedule offers Convidar on every class with open spots, whatever
 * its `engineVersion`. Located by test id.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardSchedule7dBlock } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
import { Schedule7Days } from "./Schedule7Days";

afterEach(cleanup);

const row = (id: string, engineVersion?: "old" | "new") => ({
  id,
  title: id,
  date: "2026-11-19",
  weekday: "Thursday",
  dayOfMonth: 19,
  timeLabel: "19:30",
  filled: 1,
  capacity: 4,
  href: `/calendar?classId=${id}&date=2026-11-19`,
  inProgress: false,
  inviteHref: `/calendar?classId=${id}&date=2026-11-19&notify=1`,
  ...(engineVersion ? { engineVersion } : {}),
});

describe("the coach's 7-day schedule on a new-engine class (PAD-932)", () => {
  it("[DASHBOARD-BLOCKS-61] keeps Convidar on a new-engine class", () => {
    const block = {
      id: "schedule_7d",
      type: "schedule_7d",
      data: {
        totalCount: 3,
        items: [row("lessoninstance-1", "new"), row("lessoninstance-2", "old"), row("lessoninstance-3")],
        calendarHref: "/calendar",
      },
    } as unknown as DashboardSchedule7dBlock;

    render(<MemoryRouter><Schedule7Days block={block} /></MemoryRouter>);
    const [fresh, old, unknown] = screen.getAllByTestId("dashboard-schedule-row");
    expect(within(fresh).getByTestId("dashboard-schedule-invite")).toBeInTheDocument();
    expect(fresh).toHaveTextContent("dashboard.schedule.seats");
    expect(within(old).getByTestId("dashboard-schedule-invite")).toBeInTheDocument();
    expect(within(unknown).getByTestId("dashboard-schedule-invite")).toBeInTheDocument();
  });
});
