/**
 * PAD-497 (`notifications.invitations` rule 18), the iOS twin of web's
 * ManualNotificationModal.declined.test.tsx: the manual picker marks a student who said "no" to an
 * invitation for this class and keeps them selectable.
 */
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent, CoachPlayer, StudentGroup } from "@levelup/types";

import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
// PAD-562: the modal now hosts the eligibility dialog in its own portal; neither is this test's subject.
vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));
vi.mock("./eligibility-confirm-dialog", () => ({ EligibilityConfirmDialog: () => null }));
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});
vi.mock("@/components/ui/checkbox", async () => {
  const { Pressable } = await import("react-native");
  return {
    Checkbox: (p: { checked: boolean; onCheckedChange: () => void }) =>
      createElement(Pressable, { role: "checkbox", "aria-checked": p.checked, onPress: p.onCheckedChange }),
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return { Dialog: pass, DialogContent: pass, DialogFooter: pass, DialogHeader: pass, DialogTitle: pass };
});
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
const roster = [
  { id: "c7", coachId: "1", playerId: "7", userId: "17", name: "Rita Decliner", email: "", isActive: true },
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Other", email: "", isActive: true },
] as unknown as CoachPlayer[];

vi.mock("./hooks", () => ({
  useNotificationGroups: () => ({ data: groups, isPending: false }),
  useSendManualNotifications: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: roster }) }));
vi.mock("@levelup/api", () => ({ playersApi: { getCoachPlayers: vi.fn() } }));

import { NotifyModal } from "./notify-modal";

const event = { model: "LessonInstance", originalId: "5", date: "2026-06-11" } as unknown as CalendarEvent;

describe("NotifyModal: declined this class", () => {
  it("marks the decliner in the search, not the others, and keeps them selectable", async () => {
    const ui = await renderNative(
      <NotifyModal open onClose={() => {}} event={event} existingPlayerIds={[]} />
    );
    await ui.changeText("class-notify-search", "R");

    expect(ui.byTestId("notify-declined-7").props.children).toBe("calendar.notify.declinedThisClass");
    expect(ui.queryByTestId("notify-declined-8")).toBeNull();

    await ui.press("notify-player-7");
    const checkbox = ui.byTestId("notify-player-7").findAll((n) => n.props.role === "checkbox")[0];
    expect(checkbox.props["aria-checked"]).toBe(true);
  });
});
