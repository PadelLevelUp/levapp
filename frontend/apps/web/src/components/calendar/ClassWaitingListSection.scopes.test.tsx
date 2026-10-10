/**
 * PAD-560 (calendar.event-detail rules 19–20; notifications.waiting-list rules 19, 19a, 22) on web:
 * the add dialog offers this class only, the whole series (asks nothing more, says the date it runs
 * to) and a period (exactly one of a number of classes or an end date); a row's edit control opens
 * the same dialog on the row's scope with the student fixed and saves through the PATCH; a
 * coach-wide standing row has no edit control. Asserted by test id; the requests by their payload.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachClassWaitingListRow, CoachPlayer } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { date?: string }) => (params?.date ? `${key}:${params.date}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const api = vi.hoisted(() => ({
  addToClassWaitingList: vi.fn(() => Promise.resolve({ action: "added", entryId: 1 })),
  changeClassWaitingListScope: vi.fn(() => Promise.resolve({})),
  removeFromClassWaitingList: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [] })),
}));
vi.mock("@/api/notificationEngine", () => api);

import { ClassWaitingListSection } from "./ClassWaitingListSection";

const player = (playerId: number, name: string) => ({ playerId, name }) as unknown as CoachPlayer;
const roster = [player(1, "Álvaro Sousa"), player(2, "Ana Pinto")];
const row = (over: Partial<CoachClassWaitingListRow>): CoachClassWaitingListRow => ({
  id: 10, playerId: 1, playerName: "Álvaro Sousa", joinedAt: null, origin: "coach", standingEntryId: null, seriesScoped: false,
  scope: "occurrence", expiresOn: null, ...over,
});

function renderSection(opts: { isRecurring?: boolean; recurrenceEnd?: string | null; rows?: CoachClassWaitingListRow[] } = {}) {
  render(
    <ClassWaitingListSection
      event={{ model: "LessonInstance", originalId: 7, date: "2026-10-13" }}
      isRecurring={opts.isRecurring ?? true}
      recurrenceEnd={opts.recurrenceEnd ?? "2026-12-31"}
      rows={opts.rows ?? []}
      roster={roster}
      enrolledIds={[]}
      onChanged={() => {}}
    />,
  );
  if (!screen.queryByTestId("class-waiting-list-add")) fireEvent.click(screen.getByTestId("class-waiting-list-toggle"));
}
const openAdd = () => fireEvent.click(screen.getByTestId("class-waiting-list-add"));
const chooseAna = () => fireEvent.click(screen.getByTestId("class-waiting-list-candidate-2"));
const confirm = () => fireEvent.click(screen.getByTestId("class-waiting-list-confirm"));
const lastAdd = () => (api.addToClassWaitingList.mock.calls.at(-1) as unknown[])[0] as Record<string, unknown>;

beforeEach(() => { api.addToClassWaitingList.mockClear(); api.changeClassWaitingListScope.mockClear(); });

describe("PAD-560 the add dialog's three scopes (rule 20)", () => {
  it("offers the series scopes for a recurring class only", () => {
    renderSection({ isRecurring: false });
    openAdd();
    expect(screen.getByTestId("class-waiting-list-scope-occurrence")).toBeInTheDocument();
    expect(screen.queryByTestId("class-waiting-list-scope-series")).toBeNull();
    expect(screen.queryByTestId("class-waiting-list-scope-period")).toBeNull();
  });

  it("the whole series asks nothing more, says the date it runs to (capped), and posts scope series alone", async () => {
    renderSection({ recurrenceEnd: "2030-01-01" });
    openAdd();
    chooseAna();
    fireEvent.click(screen.getByTestId("class-waiting-list-scope-series"));
    expect(screen.queryByTestId("class-waiting-list-end-date")).toBeNull();
    expect(screen.queryByTestId("class-waiting-list-classes")).toBeNull();
    const until = screen.getByTestId("class-waiting-list-series-until").textContent ?? "";
    expect(until).toMatch(/^calendar\.detail\.waitingListSeriesRunsTo:\d{2}\/\d{2}\/\d{4}$/);
    expect(until).not.toContain("2030");
    confirm();
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1));
    expect(lastAdd()).toEqual({ model: "LessonInstance", originalId: 7, date: "2026-10-13", playerId: 2, scope: "series" });
  });

  it("a period is a number of classes or an end date, never both (rule 19a)", async () => {
    renderSection();
    openAdd();
    chooseAna();
    fireEvent.click(screen.getByTestId("class-waiting-list-scope-period"));
    fireEvent.change(screen.getByTestId("class-waiting-list-classes"), { target: { value: "3" } });
    expect(screen.queryByTestId("class-waiting-list-end-date")).toBeNull();
    confirm();
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1));
    expect(lastAdd()).toMatchObject({ playerId: 2, scope: "period", classes: 3 });
    expect(lastAdd()).not.toHaveProperty("expiresOn");

    fireEvent.click(screen.getByTestId("class-waiting-list-add"));
    chooseAna();
    fireEvent.click(screen.getByTestId("class-waiting-list-scope-period"));
    fireEvent.click(screen.getByTestId("class-waiting-list-period-date"));
    expect(screen.queryByTestId("class-waiting-list-classes")).toBeNull();
    const date = screen.getByTestId("class-waiting-list-end-date") as HTMLInputElement;
    fireEvent.change(date, { target: { value: date.max } });
    confirm();
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(2));
    expect(lastAdd()).toMatchObject({ scope: "period", expiresOn: date.max });
    expect(lastAdd()).not.toHaveProperty("classes");
  });
});

describe("PAD-560 a row's edit control moves it between scopes (rules 19, 22)", () => {
  it("opens on the row's scope with the student fixed, and saves through the PATCH", async () => {
    renderSection({ rows: [row({ id: 10, playerId: 1, scope: "period", expiresOn: "2026-11-30", origin: "standing", standingEntryId: 4, seriesScoped: true })] });
    fireEvent.click(screen.getByTestId("class-waiting-list-edit-1"));
    expect(screen.getByTestId("class-waiting-list-editing-name")).toHaveTextContent("Álvaro Sousa");
    expect(screen.queryByTestId("class-waiting-list-search")).toBeNull();
    expect(screen.getByTestId("class-waiting-list-scope-period")).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByTestId("class-waiting-list-end-date") as HTMLInputElement).value).toBe("2026-11-30");
    fireEvent.click(screen.getByTestId("class-waiting-list-scope-series"));
    confirm();
    await waitFor(() => expect(api.changeClassWaitingListScope).toHaveBeenCalledWith(10, { scope: "series" }));
    expect(api.addToClassWaitingList).not.toHaveBeenCalled();
  });

  it("a coach-wide standing row has no edit control; the others do", () => {
    renderSection({ rows: [
      row({ id: 1, playerId: 1, scope: "standing", origin: "standing", standingEntryId: 5, expiresOn: "2026-12-31" }),
      row({ id: 2, playerId: 2, scope: "occurrence" }),
    ] });
    expect(screen.queryByTestId("class-waiting-list-edit-1")).toBeNull();
    expect(screen.getByTestId("class-waiting-list-edit-2")).toBeInTheDocument();
  });
});
