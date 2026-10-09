/**
 * eligibility.enforcement rule 6a / notifications.manual rule 8 (PAD-562), the iOS twin of web's
 * ManualNotificationModal.eligibility.test.tsx: inviting a student who fails the bar asks first
 * through the shared dialog (invite verb); cancel sends nothing, confirm sends the selection.
 * The nested native modal itself (PortalHost inside the sheet) is proven by Maestro flow 210.
 */
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent, CoachPlayer, StudentGroup } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));
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
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const pass = (p: { children?: ReactNode; testID?: string }) => createElement(View, { testID: p.testID }, p.children);
  const press = (p: { children?: ReactNode; testID?: string; onPress?: () => void }) =>
    createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children);
  return {
    AlertDialog: (p: { open: boolean; children?: ReactNode }) => (p.open ? createElement(View, null, p.children) : null),
    AlertDialogContent: pass, AlertDialogHeader: pass, AlertDialogTitle: pass, AlertDialogDescription: pass,
    AlertDialogFooter: pass, AlertDialogCancel: press, AlertDialogAction: press,
  };
});
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const groups: StudentGroup[] = [
  {
    id: "all_students",
    label: "All students",
    players: [
      { id: "7", name: "Rita Below", levelCode: "B1", levelId: "1" },
      { id: "8", name: "Rui Fine", levelCode: "B2", levelId: "2" },
    ],
  } as StudentGroup,
];
const roster = [
  { id: "c7", coachId: "1", playerId: "7", userId: "17", name: "Rita Below", email: "", isActive: true },
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Fine", email: "", isActive: true },
] as unknown as CoachPlayer[];

const mutateAsync = vi.hoisted(() => vi.fn());
const checkEligibility = vi.hoisted(() => vi.fn());
vi.mock("./hooks", () => ({
  useNotificationGroups: () => ({ data: groups, isPending: false }),
  useSendManualNotifications: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: roster }) }));
vi.mock("@levelup/api", () => ({
  playersApi: { getCoachPlayers: vi.fn() },
  notificationEngineApi: { checkEligibility },
}));

import { NotifyModal } from "./notify-modal";

const event = { model: "LessonInstance", originalId: "5", date: "2026-06-11" } as unknown as CalendarEvent;
const failingRita = [
  {
    playerId: "7",
    name: "Rita Below",
    failures: [{ attribute: "level", operation: "same_as_class", actual: "B1", threshold: "B2", ladder_distance: 1, reason: null }],
  },
];

async function openAndSend(ids: string[]) {
  const ui = await renderNative(<NotifyModal open onClose={() => {}} event={event} existingPlayerIds={[]} />);
  await ui.changeText("class-notify-search", "R");
  for (const id of ids) await ui.press(`notify-player-${id}`);
  await ui.press("class-notify-send");
  return ui;
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ sent: 1, blocked: [] });
  checkEligibility.mockReset();
});

describe("NotifyModal: inviting below the bar", () => {
  it("asks first with the invite verb; cancel sends nothing", async () => {
    checkEligibility.mockResolvedValue({ ineligible: failingRita });
    const ui = await openAndSend(["7"]);
    expect(checkEligibility).toHaveBeenCalledWith("LessonInstance", "5", "2026-06-11", ["7"]);
    expect(ui.byTestId("eligibility-confirm")).toBeTruthy();
    expect(ui.byTestId("eligibility-confirm-student")).toBeTruthy(); // Rita, with her reason
    expect(ui.byTestId("eligibility-confirm-reason")).toBeTruthy();
    await ui.press("eligibility-confirm-cancel");
    expect(ui.queryByTestId("eligibility-confirm")).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(ui.byTestId("class-notify-send")).toBeTruthy(); // the modal and its selection stay
  });

  it("confirm sends the whole selection", async () => {
    checkEligibility.mockResolvedValue({ ineligible: failingRita });
    const ui = await openAndSend(["7", "8"]);
    await ui.press("eligibility-confirm-proceed");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect([...mutateAsync.mock.calls[0][0].playerIds].sort()).toEqual(["7", "8"]);
  });

  it("holds the send button while the check runs: a double tap opens one dialog", async () => {
    let resolveCheck: (v: { ineligible: typeof failingRita }) => void = () => {};
    checkEligibility.mockReturnValue(new Promise((r) => { resolveCheck = r; }));
    const ui = await renderNative(<NotifyModal open onClose={() => {}} event={event} existingPlayerIds={[]} />);
    await ui.changeText("class-notify-search", "R");
    await ui.press("notify-player-7");
    await ui.press("class-notify-send");
    // The second tap lands while the check is in flight: `checking` holds it (the harness does not
    // model `disabled`, so the guard in handleSend is what this pins).
    await ui.press("class-notify-send");
    resolveCheck({ ineligible: failingRita });
    await new Promise((r) => setTimeout(r, 0));
    expect(checkEligibility).toHaveBeenCalledTimes(1);
    expect(ui.byTestId("eligibility-confirm")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sends at once when nobody fails", async () => {
    checkEligibility.mockResolvedValue({ ineligible: [] });
    const ui = await openAndSend(["8"]);
    expect(ui.queryByTestId("eligibility-confirm")).toBeNull();
    expect(mutateAsync).toHaveBeenCalledWith({ model: "LessonInstance", originalId: "5", date: "2026-06-11", playerIds: ["8"] });
  });
});
