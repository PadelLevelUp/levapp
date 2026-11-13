/**
 * PAD-838 (notifications.manual rule 11): with the keyboard up the notify dialog gives up list
 * height, so the search field sits above the list and, while a query is set, its matches come
 * first. Before this the field was the list's last item and the matches went below it, under
 * the keyboard on a small iPhone. Placement against the keyboard is Maestro's (flow
 * notify-search-above-keyboard); this pins the order that makes it hold.
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
    Checkbox: (p: { testID?: string; checked: boolean; onCheckedChange: () => void }) =>
      createElement(Pressable, { testID: p.testID, role: "checkbox", "aria-checked": p.checked, onPress: p.onCheckedChange }),
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

import type { ReactTestInstance } from "react-test-renderer";
import { NotifyModal } from "./notify-modal";

const event = { model: "LessonInstance", originalId: "5", date: "2026-06-11" } as unknown as CalendarEvent;

const rootOf = (n: ReactTestInstance) => {
  let r = n;
  while (r.parent) r = r.parent;
  return r;
};
/** Host testIDs in render order. */
const order = (n: ReactTestInstance) =>
  rootOf(n)
    .findAll((x) => typeof x.type === "string" && typeof x.props.testID === "string")
    .map((x) => x.props.testID as string);
const inside = (n: ReactTestInstance, type: string) => {
  for (let p = n.parent; p; p = p.parent) if (p.type === type) return p;
  return null;
};

describe("NotifyModal: search above the keyboard", () => {
  it("[NOTIFICATIONS-MANUAL-16] the search sits above the list and its matches come before the groups", async () => {
    const ui = await renderNative(
      <NotifyModal open onClose={() => {}} event={event} existingPlayerIds={[]} />
    );
    // The field is outside the scrolling list, so the list can shrink under it.
    expect(inside(ui.byTestId("class-notify-search"), "ScrollView")).toBeNull();

    await ui.changeText("class-notify-search", "Rui");
    const ids = order(ui.byTestId("class-notify-search"));
    const search = ids.indexOf("class-notify-search");
    const match = ids.indexOf("notify-player-8");
    const group = ids.indexOf("notify-group-select-all_students");
    expect(search).toBeGreaterThanOrEqual(0);
    expect(match).toBeGreaterThan(search);
    expect(group).toBeGreaterThan(match);

    // The first tap on a match selects it rather than only putting the keyboard away.
    expect(inside(ui.byTestId("notify-player-8"), "ScrollView")?.props.keyboardShouldPersistTaps).toBe("handled");
    await ui.press("notify-player-8");
    const checkbox = ui.byTestId("notify-player-8").findAll((n) => n.props.role === "checkbox")[0];
    expect(checkbox.props["aria-checked"]).toBe(true);
  });
});
