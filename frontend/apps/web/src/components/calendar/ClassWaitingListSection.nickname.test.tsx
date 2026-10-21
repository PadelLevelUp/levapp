/** players.nickname rule 8 (PAD-660): the class's waiting list prints the coach's name for each student. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoachClassWaitingListRow, CoachPlayer } from "@levelup/types";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "1" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/api/notificationEngine", () => ({
  addToClassWaitingList: vi.fn(),
  removeFromClassWaitingList: vi.fn(),
  changeClassWaitingListScope: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [] })),
}));

import { ClassWaitingListSection } from "./ClassWaitingListSection";

const row = (id: number, playerId: number, playerName: string): CoachClassWaitingListRow =>
  ({ id, playerId, playerName, joinedAt: null, origin: "coach", standingEntryId: null, seriesScoped: false,
     scope: "occurrence", expiresOn: null }) as unknown as CoachClassWaitingListRow;
const roster = [{ playerId: 1, name: "Jorge Silva" }, { playerId: 2, name: "Ana Pinto" }] as unknown as CoachPlayer[];

const mount = (rows: CoachClassWaitingListRow[]) =>
  render(
    <ClassWaitingListSection event={{ model: "LessonInstance", originalId: 7, date: "2026-10-11" }}
      rows={rows} roster={roster} enrolledIds={[]} onChanged={() => {}} />,
  );

describe("ClassWaitingListSection names students the way the coach does", () => {
  it("prints the nickname on a row, the real name for an unnamed student", () => {
    mount([row(1, 1, "Jorge Silva"), row(2, 2, "Ana Pinto")]);
    expect(screen.getByTestId("class-waiting-list-row-1")).toHaveTextContent("Jorge chato");
    expect(screen.getByTestId("class-waiting-list-row-1")).not.toHaveTextContent("Jorge Silva");
    expect(screen.getByTestId("class-waiting-list-row-2")).toHaveTextContent("Ana Pinto");
  });

  it("prints the nickname in the add picker, the real name for an unnamed student", () => {
    mount([]);
    fireEvent.click(screen.getByTestId("class-waiting-list-toggle"));
    fireEvent.click(screen.getByTestId("class-waiting-list-add"));
    expect(screen.getByTestId("class-waiting-list-candidate-1")).toHaveTextContent("Jorge chato");
    expect(screen.getByTestId("class-waiting-list-candidate-2")).toHaveTextContent("Ana Pinto");
  });
});
