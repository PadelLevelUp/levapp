/**
 * PAD-838 (notifications.groups rule 7), the iOS twin of web's
 * ManualNotificationModal.groupLabels.test.tsx: a group label still equal to its id's seeded
 * English default is shown in the coach's language (the translation key, `t` being mocked); a
 * label the coach changed is shown as stored.
 */
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent, CoachPlayer, StudentGroup } from "@levelup/types";

import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.group ? `${key}:${params.group}` : key),
  }),
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
    Checkbox: (p: { testID?: string; accessibilityLabel?: string; checked: boolean; onCheckedChange: () => void }) =>
      createElement(Pressable, { testID: p.testID, accessibilityLabel: p.accessibilityLabel, role: "checkbox", "aria-checked": p.checked, onPress: p.onCheckedChange }),
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
  { id: "same_level", label: "Same level", players: [] } as unknown as StudentGroup,
  { id: "all_students", label: "Os do sábado", players: [] } as unknown as StudentGroup,
];
const roster = [] as unknown as CoachPlayer[];

vi.mock("./hooks", () => ({
  useNotificationGroups: () => ({ data: groups, isPending: false }),
  useSendManualNotifications: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: roster }) }));
vi.mock("@levelup/api", () => ({ playersApi: { getCoachPlayers: vi.fn() } }));

import { NotifyModal } from "./notify-modal";

const event = { model: "LessonInstance", originalId: "5", date: "2026-06-11" } as unknown as CalendarEvent;

describe("NotifyModal: group names in the coach's language", () => {
  it("[NOTIFICATIONS-GROUPS-6] a default label is translated by its id, a renamed one is shown as stored", async () => {
    const ui = await renderNative(
      <NotifyModal open onClose={() => {}} event={event} existingPlayerIds={[]} />
    );
    const select = ui.byTestId("notify-group-select-same_level");
    expect(select.props.accessibilityLabel).toBe("calendar.notify.selectAllIn:settings.notificationGroups.labels.sameLevel");
    expect(ui.byTestId("notify-group-select-all_students").props.accessibilityLabel).toBe(
      "calendar.notify.selectAllIn:Os do sábado"
    );

    let root = select;
    while (root.parent) root = root.parent;
    const texts = root
      .findAll((n) => String(n.type) === "Text" && typeof n.props.children === "string")
      .map((n) => n.props.children as string);
    expect(texts).toContain("settings.notificationGroups.labels.sameLevel");
    expect(texts).toContain("Os do sábado");
    expect(texts).not.toContain("Same level");
  });
});
