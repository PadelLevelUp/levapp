/**
 * PAD-920 (classes.instance-enrollment rule 15): adding a player to several classes at once saves
 * the classes that accept and lists each one that refused with `409 busy_same_hour`, naming the other
 * class, instead of the generic failure toast. `t` returns the key and its params.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CalendarEvent, CoachPlayer } from "@/types";

// One stable `t`: the dialog's load effect depends on it.
const i18nMock = vi.hoisted(() => ({
  t: (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key),
  i18n: { language: "pt" },
}));
vi.mock("react-i18next", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTranslation: () => i18nMock,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const api = vi.hoisted(() => ({ editClass: vi.fn(), getClassInstances: vi.fn(), checkEligibility: vi.fn() }));
vi.mock("@/api/classes", () => ({ editClass: api.editClass, getClassInstances: api.getClassInstances }));
vi.mock("@/api/notificationEngine", () => ({ checkEligibility: api.checkEligibility }));

import { AddToClassesDialog } from "./AddToClassesDialog";

// The dialog lists this week's classes that have not started. The clock is pinned to a Wednesday
// noon (Lisbon), so "today at 23:58" is always ahead and in the week, whenever the test runs.
const PINNED = new Date("2026-11-18T12:00:00Z");
const today = PINNED;
const DATE = "2026-11-18";
const DAY = "18/11";

const cls = (id: string, title: string): CalendarEvent =>
  ({
    id,
    model: "LessonInstance",
    originalId: Number(id.split("-")[1]),
    type: "class",
    title,
    date: DATE,
    startTime: "23:58",
    endTime: "23:59",
    maxPlayers: 8,
    participantCount: 2,
  }) as unknown as CalendarEvent;

const player = { playerId: 77, name: "Rita", displayName: "Rita" } as unknown as CoachPlayer;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED);
});
afterAll(() => vi.useRealTimers());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PAD-920 a same-hour refusal in the add-to-classes dialog", () => {
  it("[CLASSES-INSTANCE-ENROLLMENT-32] shows each clash and saves the classes that did not refuse", async () => {
    api.getClassInstances.mockResolvedValue([cls("c-1", "Iniciação"), cls("c-2", "Avançado")]);
    api.checkEligibility.mockResolvedValue({ ineligible: [] });
    api.editClass.mockImplementation(async (c: CalendarEvent) => {
      if (c.id === "c-2") {
        throw {
          response: {
            status: 409,
            data: {
              code: "busy_same_hour",
              clashes: [{ playerId: "77", playerName: "Rita", lessonInstanceId: 9, title: "Aula da Ana", start: `${DATE}T23:58:00` }],
            },
          },
        };
      }
      return {};
    });
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<AddToClassesDialog open onClose={onClose} onSave={onSave} player={player} />);

    fireEvent.click(await screen.findByTestId("add-to-classes-class-c-1"));
    fireEvent.click(screen.getByTestId("add-to-classes-class-c-2"));
    fireEvent.click(screen.getByText(/players\.addToSelectedClasses/));

    const line = await screen.findByTestId("add-to-classes-busy-same-hour-line-c-2-0");
    expect(line.textContent).toContain("calendar.busySameHour.line");
    expect(line.textContent).toContain('"title":"Aula da Ana"');
    expect(line.textContent).toContain(`"date":"${DAY}","time":"23:58"`);
    // The other class was saved; the refusal is not the generic toast; the dialog stays open to show it.
    expect(api.editClass).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId("add-to-classes-busy-same-hour-c-1")).toBeNull();
  });

  it("keeps the generic toast for any other failure", async () => {
    api.getClassInstances.mockResolvedValue([cls("c-1", "Iniciação")]);
    api.checkEligibility.mockResolvedValue({ ineligible: [] });
    api.editClass.mockRejectedValue({ response: { status: 500, data: {} } });
    render(<AddToClassesDialog open onClose={vi.fn()} player={player} />);
    fireEvent.click(await screen.findByTestId("add-to-classes-class-c-1"));
    fireEvent.click(screen.getByText(/players\.addToSelectedClasses/));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("common.somethingWentWrong"));
    expect(screen.queryByTestId("add-to-classes-busy-same-hour")).toBeNull();
  });
});
