/**
 * PAD-797 (dashboard.blocks rule 12c). With two classes running at once (two courts), the coach's
 * hero showed only the one that started first. The server now sends the others in `alsoRunning`
 * (its clock is pinned in test_pad797_two_running_classes_on_the_hero.py); the shell reads no
 * clock, so the payload is the input: one "A DECORRER" card per running class, each with its own
 * start–end and Abrir, and no invite button.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardNextClassBlock } from "@levelup/types";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
import { NextClassHero } from "./NextClassHero";

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

const card = (id: string, title: string, startTime: string, endTime: string) => ({
  classId: id,
  title,
  date: "2026-10-29",
  startTime,
  endTime,
  isToday: true,
  inProgress: true,
  weekday: "Thursday",
  minutesUntil: null,
  filled: 0,
  capacity: 2,
  players: [],
  href: `/calendar?classId=${id}&date=2026-10-29`,
});

const hero = (alsoRunning?: ReturnType<typeof card>[]) =>
  ({
    id: "next_class",
    type: "next_class",
    data: { ...card("lessoninstance-1", "Treino A", "19:30", "21:00"), ...(alsoRunning ? { alsoRunning } : {}) },
  }) as unknown as DashboardNextClassBlock;

describe("two classes running at once on the coach's home (PAD-797)", () => {
  it("shows one A DECORRER card per running class, each with its own times", () => {
    render(<MemoryRouter><NextClassHero block={hero([card("lessoninstance-2", "Treino B", "20:00", "21:00")])} /></MemoryRouter>);

    const first = screen.getByTestId("dashboard-next-class");
    expect(first).toHaveTextContent("Treino A");
    expect(first).toHaveTextContent('dashboard.hero.inProgress {"start":"19:30","end":"21:00"}');
    const [other] = screen.getAllByTestId("dashboard-next-class-running");
    expect(other).toHaveTextContent("Treino B");
    expect(other).toHaveTextContent('dashboard.hero.inProgress {"start":"20:00","end":"21:00"}');
    expect(other).not.toHaveTextContent("Treino A");
  });

  it("each card opens its own class, and none offers an invite", () => {
    render(<MemoryRouter><NextClassHero block={hero([card("lessoninstance-2", "Treino B", "20:00", "21:00")])} /></MemoryRouter>);

    const other = screen.getByTestId("dashboard-next-class-running");
    fireEvent.click(within(other).getByRole("button", { name: "dashboard.hero.open" }));
    expect(navigate).toHaveBeenCalledWith("/calendar?classId=lessoninstance-2&date=2026-10-29");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "dashboard.hero.open",
      "dashboard.hero.open",
    ]);
  });

  it("one running class is a single card, as in PAD-792", () => {
    render(<MemoryRouter><NextClassHero block={hero()} /></MemoryRouter>);

    expect(screen.getByTestId("dashboard-next-class")).toHaveTextContent("Treino A");
    expect(screen.queryByTestId("dashboard-next-class-running")).toBeNull();
  });
});
