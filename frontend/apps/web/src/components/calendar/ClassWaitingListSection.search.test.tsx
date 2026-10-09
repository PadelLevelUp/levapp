/**
 * PAD-558 (calendar.event-detail rule 20): the add-to-waiting-list picker has a name search under
 * the class editor's rule (`nameMatchesQuery`): every word, any order, accents ignored; a blank
 * search offers everyone; the chosen student stays chosen and listed. Asserted by test id.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CoachPlayer } from "@levelup/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/api/notificationEngine", () => ({
  addToClassWaitingList: vi.fn(),
  removeFromClassWaitingList: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [] })),
}));

import { ClassWaitingListSection } from "./ClassWaitingListSection";

const player = (playerId: number, name: string) => ({ playerId, name }) as unknown as CoachPlayer;
const roster = [player(1, "Álvaro Sousa"), player(2, "Ana Pinto"), player(3, "Bruno Álves"), player(9, "Enrolled One")];

function openPicker() {
  render(
    <ClassWaitingListSection
      event={{ model: "LessonInstance", originalId: 7, date: "2026-10-11" }}
      rows={[]}
      roster={roster}
      enrolledIds={[9]}
      onChanged={() => {}}
    />,
  );
  if (!screen.queryByTestId("class-waiting-list-add")) fireEvent.click(screen.getByTestId("class-waiting-list-toggle"));
  fireEvent.click(screen.getByTestId("class-waiting-list-add"));
}

const offered = () =>
  within(screen.getByTestId("class-waiting-list-player"))
    .getAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean);

describe("PAD-558 the waiting-list picker searches by name (rule 20)", () => {
  it("offers only the names holding every typed word, and everyone again once cleared", () => {
    openPicker();
    expect(offered()).toEqual(["1", "2", "3"]);
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "sousa alv" } });
    expect(offered()).toEqual(["1"]);
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "" } });
    expect(offered()).toEqual(["1", "2", "3"]);
  });

  it("keeps a chosen student chosen and listed when the search stops matching them", () => {
    openPicker();
    fireEvent.change(screen.getByTestId("class-waiting-list-player"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("class-waiting-list-search"), { target: { value: "pinto" } });
    expect(offered()).toEqual(["2", "3"]);
    expect((screen.getByTestId("class-waiting-list-player") as HTMLSelectElement).value).toBe("3");
  });
});
