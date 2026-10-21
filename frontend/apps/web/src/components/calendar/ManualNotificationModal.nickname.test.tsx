/**
 * PAD-683 (players.nickname rule 9, B-631): the invite picker names a student by the coach's display
 * name — the group rows from the server's `displayName`, the search rows from the roster — and the
 * real name once the switch is off.
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
      { id: "7", name: "Rita Decliner", displayName: "Rita Tiger", nickname: "Rita Tiger", nicknameAsName: true, levelCode: "B1", levelId: "1", declinedThisClass: true },
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
  { id: "c7", coachId: "1", playerId: "7", userId: "17", name: "Rita Decliner", nickname: "Rita Tiger", nicknameAsName: true, displayName: "Rita Tiger", email: "", isActive: true },
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Other", email: "", isActive: true },
] as unknown as CoachPlayer[];

const props = {
  open: true,
  onClose: () => {},
  eventModel: "LessonInstance",
  eventOriginalId: "5",
  eventDate: "2026-06-11",
  existingPlayerIds: [] as string[],
};

describe("invite picker: the coach's display name (PAD-683)", () => {
  it("a group row reads the nickname, never the real name", async () => {
    render(<ManualNotificationModal {...props} coachPlayers={roster} />);
    fireEvent.click(await screen.findByTestId("notify-group-all_students"));
    expect(await screen.findByText("Rita Tiger")).toBeInTheDocument();
    expect(screen.queryByText("Rita Decliner")).toBeNull();
  });

  it("a search row reads the nickname, and searching the real name finds it", async () => {
    render(<ManualNotificationModal {...props} coachPlayers={roster} />);
    await screen.findByText("All students");
    fireEvent.change(screen.getByPlaceholderText("calendar.notify.searchPlaceholder"), {
      target: { value: "Decliner" },
    });
    expect(await screen.findByText("Rita Tiger")).toBeInTheDocument();
    expect(screen.queryByText("Rita Decliner")).toBeNull();
  });

  it("with the switch off the search row reads the real name", async () => {
    const off = roster.map((r) => ({ ...r, nicknameAsName: false, displayName: r.name })) as CoachPlayer[];
    render(<ManualNotificationModal {...props} coachPlayers={off} />);
    await screen.findByText("All students");
    fireEvent.change(screen.getByPlaceholderText("calendar.notify.searchPlaceholder"), {
      target: { value: "Rita" },
    });
    expect(await screen.findByText("Rita Decliner")).toBeInTheDocument();
  });
});
