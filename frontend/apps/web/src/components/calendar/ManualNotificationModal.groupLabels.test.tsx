/**
 * PAD-838 (notifications.groups rule 7): the manual picker's group names are per-coach data seeded
 * in English. A label still equal to its id's default is shown in the coach's language (here the
 * translation key, `t` being mocked); a label the coach changed is shown as stored.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CoachPlayer, StudentGroup } from "@/types";
import { ManualNotificationModal } from "./ManualNotificationModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, string>) => (params?.group ? `${key}:${params.group}` : key) }),
}));

const groups: StudentGroup[] = [
  { id: "same_level", label: "Same level", players: [] } as unknown as StudentGroup,
  { id: "all_students", label: "Os do sábado", players: [] } as unknown as StudentGroup,
];

vi.mock("@/api/notificationEngine", () => ({
  getNotificationGroups: vi.fn(() => Promise.resolve(groups)),
  sendManualNotifications: vi.fn(() => Promise.resolve([])),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe("manual picker: group names in the coach's language", () => {
  it("[NOTIFICATIONS-GROUPS-5] a default label is translated by its id, a renamed one is shown as stored", async () => {
    render(
      <ManualNotificationModal
        open
        onClose={() => {}}
        eventModel="LessonInstance"
        eventOriginalId="5"
        eventDate="2026-06-11"
        coachPlayers={[] as CoachPlayer[]}
        existingPlayerIds={[]}
      />
    );
    expect(await screen.findByText("settings.notificationGroups.labels.sameLevel")).toBeInTheDocument();
    expect(screen.getByText("Os do sábado")).toBeInTheDocument();
    expect(screen.queryByText("Same level")).toBeNull();
    // The select-all control names the group the same way.
    expect(
      screen.getByLabelText("calendar.notify.selectAllIn:settings.notificationGroups.labels.sameLevel")
    ).toBeInTheDocument();
  });
});
