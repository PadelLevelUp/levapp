/**
 * PAD-558 (calendar.event-detail rule 20): the add-to-waiting-list picker has a name search under
 * the class editor's rule (`nameMatchesQuery`): every word, any order, accents ignored; a blank
 * search offers everyone; the chosen student stays chosen and listed. PAD-560 / B-421: what is
 * offered is a visible list of rows — there is no second control. Rule 19 (PAD-560): each row of
 * the list says how long the student is on it. Asserted by test id.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoachClassWaitingListRow, CoachPlayer } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, params?: { date?: string }) => (params?.date ? `${key}:${params.date}` : key) }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/api/notificationEngine", () => ({
  addToClassWaitingList: vi.fn(),
  removeFromClassWaitingList: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [] })),
}));

import { ClassWaitingListSection } from "./ClassWaitingListSection";

const player = (playerId: number, name: string) => ({ playerId, name }) as unknown as CoachPlayer;
const roster = [player(1, "Álvaro Sousa"), player(2, "Ana Pinto"), player(3, "Bruno Álves"), player(9, "Enrolled One")];

function renderSection(rows: CoachClassWaitingListRow[] = []) {
  render(
    <ClassWaitingListSection
      event={{ model: "LessonInstance", originalId: 7, date: "2026-10-11" }}
      rows={rows}
      roster={roster}
      enrolledIds={[9]}
      onChanged={() => {}}
    />,
  );
  if (!screen.queryByTestId("class-waiting-list-add")) fireEvent.click(screen.getByTestId("class-waiting-list-toggle"));
}

function openPicker() {
  renderSection();
  fireEvent.click(screen.getByTestId("class-waiting-list-add"));
}

const offered = () =>
  screen.getAllByTestId(/^class-waiting-list-candidate-/).map((el) => el.getAttribute("data-testid")!.replace("class-waiting-list-candidate-", ""));

describe("PAD-558 the waiting-list picker searches by name (rule 20)", () => {
  it("shows only the rows holding every typed word, and everyone again once cleared — with no second control (B-421)", () => {
    openPicker();
    expect(offered()).toEqual(["1", "2", "3"]);
    expect(screen.queryByTestId("class-waiting-list-player")).toBeNull();
    expect(screen.getByTestId("class-waiting-list-dialog").querySelector("select")).toBeNull();
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "sousa alv" } });
    expect(offered()).toEqual(["1"]);
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "" } });
    expect(offered()).toEqual(["1", "2", "3"]);
  });

  it("keeps a chosen student chosen and listed when the search stops matching them", () => {
    openPicker();
    fireEvent.click(screen.getByTestId("class-waiting-list-candidate-3"));
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "pinto" } });
    expect(offered()).toEqual(["2", "3"]);
    expect(screen.getByTestId("class-waiting-list-candidate-3")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("class-waiting-list-candidate-2")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("class-waiting-list-confirm")).not.toBeDisabled();
  });
});

describe("PAD-560 each row says how long the student is on the list (rule 19)", () => {
  const row = (over: Partial<CoachClassWaitingListRow>): CoachClassWaitingListRow => ({
    id: 1, playerId: 1, playerName: "x", joinedAt: null, origin: "coach", standingEntryId: null, seriesScoped: false,
    scope: "occurrence", expiresOn: null, ...over,
  });

  it("labels the scope and dates the dated ones; only a coach-wide standing row says it is managed in Settings", () => {
    renderSection([
      row({ id: 1, playerId: 1, playerName: "Bruno", origin: "standing", standingEntryId: 5, scope: "standing", expiresOn: "2026-12-31" }),
      row({ id: 2, playerId: 2, playerName: "Carla", scope: "occurrence" }),
      row({ id: 3, playerId: 3, playerName: "Dinis", origin: "standing", standingEntryId: 6, seriesScoped: true, scope: "series", expiresOn: "2026-11-30" }),
    ]);
    expect(screen.getByTestId("class-waiting-list-row-1")).toHaveAttribute("data-scope", "standing");
    expect(screen.getByTestId("class-waiting-list-row-1")).toHaveTextContent("calendar.detail.waitingListScopeUntil:31/12/2026");
    expect(screen.getByTestId("class-waiting-list-managed-1")).toHaveTextContent("calendar.detail.waitingListManagedInSettings");
    expect(screen.getByTestId("class-waiting-list-row-2")).toHaveAttribute("data-scope", "occurrence");
    expect(screen.getByTestId("class-waiting-list-row-2")).toHaveTextContent("calendar.detail.waitingListScopeOccurrence");
    expect(screen.queryByTestId("class-waiting-list-managed-2")).toBeNull();
    expect(screen.getByTestId("class-waiting-list-row-3")).toHaveTextContent("calendar.detail.waitingListScopeSeries");
    expect(screen.queryByTestId("class-waiting-list-managed-3")).toBeNull();
    // Every row keeps its remove control (rule 21), the standing one included.
    expect(screen.getByTestId("class-waiting-list-remove-1")).toBeInTheDocument();
  });
});
