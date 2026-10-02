/**
 * PAD-497 (`notifications.invitations` rule 18): the manual picker marks a student who said "no"
 * to an invitation for this class — the engine will not ask them again, the coach still can — and
 * keeps them selectable. Group rows read the server's `declinedThisClass`; search rows (from the
 * roster list) take it from the groups.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { CoachPlayer, StudentGroup } from "@/types";
import { ManualNotificationModal } from "./ManualNotificationModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const groups: StudentGroup[] = [
  {
    id: "all_students",
    label: "All students",
    players: [
      { id: "7", name: "Rita Decliner", levelCode: "B1", levelId: "1", declinedThisClass: true },
      { id: "8", name: "Rui Other", levelCode: "B1", levelId: "1", declinedThisClass: false },
    ],
  } as StudentGroup,
];

vi.mock("@/api/notificationEngine", () => ({
  getNotificationGroups: vi.fn(() => Promise.resolve(groups)),
  sendManualNotifications: vi.fn(() => Promise.resolve([])),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const roster = [
  { id: "c7", coachId: "1", playerId: "7", userId: "17", name: "Rita Decliner", email: "", isActive: true },
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Other", email: "", isActive: true },
] as unknown as CoachPlayer[];

describe("manual picker: declined this class", () => {
  it("marks the decliner, not the others, and keeps them selectable", async () => {
    render(
      <ManualNotificationModal
        open
        onClose={() => {}}
        eventModel="LessonInstance"
        eventOriginalId="5"
        eventDate="2026-06-11"
        coachPlayers={roster}
        existingPlayerIds={[]}
      />
    );
    await screen.findByText("All students");
    fireEvent.change(screen.getByPlaceholderText("calendar.notify.searchPlaceholder"), {
      target: { value: "R" },
    });

    const mark = await screen.findByTestId("notify-declined-7");
    expect(mark).toHaveTextContent("calendar.notify.declinedThisClass");
    expect(screen.queryByTestId("notify-declined-8")).toBeNull();

    const row = mark.closest("label") as HTMLElement;
    const checkbox = row.querySelector('[role="checkbox"]') as HTMLElement;
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });
});
