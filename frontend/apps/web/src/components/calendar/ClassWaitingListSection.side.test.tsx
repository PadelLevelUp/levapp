/**
 * PAD-803 (notifications.waiting-list rule 18a) on web: adding a student to a class's waiting list
 * asks the side — Direita, Esquerda, Ambos — the profile side pre-selected and tagged "Habitual";
 * with no profile side nothing is pre-selected and Add stays disabled until one is chosen; the add
 * posts the side; each row shows its side. Asserted by test id; the request by its payload.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachClassWaitingListRow, CoachPlayer } from "@levelup/types";

// PAD-660: these tests are about something else; the coach's resolver answers the real name.
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
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

const player = (playerId: number, name: string, side?: string) => ({ playerId, name, side }) as unknown as CoachPlayer;
const roster = [player(1, "Álvaro Sousa", "left"), player(2, "Ana Pinto")];
const row = (over: Partial<CoachClassWaitingListRow>): CoachClassWaitingListRow => ({
  id: 10, playerId: 1, playerName: "Álvaro Sousa", joinedAt: null, origin: "coach", standingEntryId: null, seriesScoped: false,
  scope: "occurrence", expiresOn: null, ...over,
});

function renderSection(rows: CoachClassWaitingListRow[] = []) {
  render(
    <ClassWaitingListSection
      event={{ model: "LessonInstance", originalId: 7, date: "2026-10-13" }}
      isRecurring
      recurrenceEnd="2026-12-31"
      rows={rows}
      roster={rows.length ? [player(2, "Ana Pinto")] : roster}
      enrolledIds={[]}
      onChanged={() => {}}
    />,
  );
  if (!screen.queryByTestId("class-waiting-list-add")) fireEvent.click(screen.getByTestId("class-waiting-list-toggle"));
}
const openAdd = () => fireEvent.click(screen.getByTestId("class-waiting-list-add"));
const lastAdd = () => (api.addToClassWaitingList.mock.calls.at(-1) as unknown[])[0] as Record<string, unknown>;

beforeEach(() => { api.addToClassWaitingList.mockClear(); });

describe("PAD-803 the coach names the side when adding to a class's waiting list (rule 18a)", () => {
  it("pre-selects the profile side, tags it Habitual, and posts the side chosen", async () => {
    renderSection();
    openAdd();
    expect(screen.queryByTestId("class-waiting-list-side")).toBeNull(); // no student chosen yet
    fireEvent.click(screen.getByTestId("class-waiting-list-candidate-1"));
    expect(screen.getByTestId("class-waiting-list-side-left").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("class-waiting-list-side-usual-left")).toBeInTheDocument();
    expect(screen.queryByTestId("class-waiting-list-side-usual-right")).toBeNull();
    fireEvent.click(screen.getByTestId("class-waiting-list-side-both"));
    fireEvent.click(screen.getByTestId("class-waiting-list-confirm"));
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1));
    expect(lastAdd()).toMatchObject({ playerId: 1, side: "both", scope: "occurrence" });
  });

  it("with no profile side nothing is pre-selected and Add waits for a side", async () => {
    renderSection();
    openAdd();
    fireEvent.click(screen.getByTestId("class-waiting-list-candidate-2"));
    for (const s of ["right", "left", "both"]) {
      expect(screen.getByTestId(`class-waiting-list-side-${s}`).getAttribute("aria-checked")).toBe("false");
      expect(screen.queryByTestId(`class-waiting-list-side-usual-${s}`)).toBeNull();
    }
    expect(screen.getByTestId("class-waiting-list-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("class-waiting-list-side-right"));
    expect(screen.getByTestId("class-waiting-list-confirm")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("class-waiting-list-confirm"));
    await waitFor(() => expect(lastAdd()).toMatchObject({ playerId: 2, side: "right" }));
  });

  it("each row shows its side; a row stored before it shows none", () => {
    renderSection([row({ id: 1, playerId: 1, side: "left" }), row({ id: 3, playerId: 3, playerName: "Dinis", side: null })]);
    expect(screen.getByTestId("class-waiting-list-side-1").textContent).toBe("players.sideLeft");
    expect(screen.queryByTestId("class-waiting-list-side-3")).toBeNull();
  });
});
