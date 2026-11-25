/**
 * UI idea 1 (dashboard.blocks rule 14, DASHBOARD-BLOCKS-64): the student hero's Yes / No grow to 44px and
 * share its width under the "to confirm" label, with no strip; the schedule row's buttons keep today's size.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardNextClassBlock, DashboardSchedule7dBlock } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
import { NextClassHero } from "./NextClassHero";
import { Schedule7Days } from "./Schedule7Days";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const asked = { lessonInstanceId: 3, pendingConfirmation: true, attendanceState: "planned" };

const hero = {
  id: "next_class",
  type: "next_class",
  data: {
    classId: "lessoninstance-3",
    title: "Treino A",
    date: "2026-11-26",
    startTime: "19:30",
    endTime: "21:00",
    isToday: true,
    inProgress: false,
    weekday: "Thursday",
    minutesUntil: 40,
    filled: 2,
    capacity: 4,
    players: [],
    href: "/calendar?classId=lessoninstance-3",
    ...asked,
  },
} as unknown as DashboardNextClassBlock;

const schedule = {
  id: "schedule_7d",
  type: "schedule_7d",
  data: {
    totalCount: 1,
    calendarHref: "/calendar",
    items: [
      {
        id: "lessoninstance-4",
        title: "Treino B",
        date: "2026-11-27",
        weekday: "Friday",
        dayOfMonth: 27,
        timeLabel: "19:30",
        filled: 2,
        capacity: 4,
        href: "/calendar?classId=lessoninstance-4",
        inProgress: false,
        ...asked,
        lessonInstanceId: 4,
      },
    ],
  },
} as unknown as DashboardSchedule7dBlock;

describe("the hero and the schedule row keep different answer sizes (UI idea 1)", () => {
  it("[DASHBOARD-BLOCKS-64] the hero grows and the schedule row keeps its buttons", () => {
    render(
      <MemoryRouter>
        <NextClassHero block={hero} student />
      </MemoryRouter>,
    );
    const heroCard = screen.getByTestId("dashboard-next-class");
    const confirm = within(heroCard).getByTestId("dashboard-confirm");
    const label = within(heroCard).getByText("dashboard.schedule.toConfirm");
    expect(within(heroCard).queryByTestId("dashboard-answer-strip")).toBeNull();
    // The label stands above the pair; the pair share the hero's width at 44px.
    expect(label.parentElement?.contains(confirm)).toBe(true);
    expect(tokens(label.parentElement as Element)).toContain("flex-col");
    expect(tokens(confirm)).toContain("w-full");
    for (const id of ["dashboard-confirm-yes", "dashboard-confirm-no"]) {
      const b = within(heroCard).getByTestId(id);
      expect(tokens(b), id).toContain("h-11");
      expect(tokens(b), id).toContain("flex-1");
      expect(tokens(b), id).not.toContain("h-9");
    }
    cleanup();

    render(
      <MemoryRouter>
        <Schedule7Days block={schedule} role="student" />
      </MemoryRouter>,
    );
    const row = screen.getByTestId("dashboard-schedule-row");
    expect(within(row).queryByTestId("dashboard-answer-strip")).toBeNull();
    for (const id of ["dashboard-confirm-yes", "dashboard-confirm-no"]) {
      const b = within(row).getByTestId(id);
      expect(tokens(b), id).toContain("h-9");
      expect(tokens(b), id).not.toContain("h-11");
      expect(tokens(b), id).not.toContain("flex-1");
    }
  });
});
