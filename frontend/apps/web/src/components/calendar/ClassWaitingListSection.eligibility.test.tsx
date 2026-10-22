/**
 * PAD-724 (PAD-669 R5; notifications.waiting-list rule 18) on web: adding a student who fails the
 * class's bar asks first — the warning shows inside the dialog and the button turns into "Adicionar
 * mesmo assim"; a second press adds. A student who passes is added on the first press (the control).
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
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [
    { playerId: 2, name: "Ana Pinto", failures: [{ attribute: "level", operation: "same_as_class", actual: "4", threshold: "5", ladder_distance: -1, reason: null }] },
  ] })),
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

beforeEach(() => { api.addToClassWaitingList.mockClear(); });

describe("PAD-724 the coach is warned before putting a student who fails the bar on the list", () => {
  it("the first press warns and adds nothing; the second adds", async () => {
    renderSection();
    openAdd();
    await waitFor(() => expect(screen.getByTestId("class-waiting-list-ineligible-2")).toBeInTheDocument());
    chooseAna();
    confirm();
    expect(screen.getByTestId("class-waiting-list-eligibility-warning")).toBeInTheDocument();
    expect(screen.getByTestId("class-waiting-list-confirm").textContent).toContain("calendar.eligibilityConfirm.confirm");
    expect(api.addToClassWaitingList).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1));
    expect(lastAdd().playerId).toBe(2);
  });

  it("a student who passes is added on the first press, with no warning", async () => {
    renderSection();
    openAdd();
    await waitFor(() => expect(screen.getByTestId("class-waiting-list-ineligible-2")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("class-waiting-list-candidate-1"));
    confirm();
    await waitFor(() => expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("class-waiting-list-eligibility-warning")).toBeNull();
  });
});
