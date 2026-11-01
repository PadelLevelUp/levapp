/**
 * PAD-798 (notifications.manual rule 10), the iOS twin of web's
 * ManualNotificationModal.classStarted.test.tsx: a picker left open across the class's start sends,
 * the server answers 409 CLASS_STARTED, and the coach reads "invitations are closed" (not the
 * generic failure) as the picker closes.
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
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const groups = [
  { id: "all_students", label: "All students", players: [{ id: "8", name: "Rui Fine", levelCode: "B2", levelId: "2" }] },
] as unknown as StudentGroup[];
const roster = [
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Fine", email: "", isActive: true },
] as unknown as CoachPlayer[];

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("./hooks", () => ({
  useNotificationGroups: () => ({ data: groups, isPending: false }),
  useSendManualNotifications: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: roster }) }));
vi.mock("@levelup/api", () => ({
  playersApi: { getCoachPlayers: vi.fn() },
  notificationEngineApi: { checkEligibility: vi.fn().mockResolvedValue({ ineligible: [] }) },
}));

import { NotifyModal } from "./notify-modal";

const event = { model: "LessonInstance", originalId: "5", date: "2027-07-13" } as unknown as CalendarEvent;
const refusal = (status: number, code?: string) =>
  Object.assign(new Error("refused"), { response: { status, data: { error: code, code } } });

async function send(onClose: () => void) {
  const ui = await renderNative(createElement(NotifyModal, { open: true, onClose, event, existingPlayerIds: [] }));
  await ui.changeText("class-notify-search", "R");
  await ui.press("notify-player-8");
  await ui.press("class-notify-send");
  return ui;
}

beforeEach(() => {
  mutateAsync.mockReset();
  toast.error.mockReset();
});

describe("NotifyModal: the class started while the picker was open (PAD-798)", () => {
  it("409 CLASS_STARTED reads 'invitations are closed' and closes the picker", async () => {
    mutateAsync.mockRejectedValue(refusal(409, "CLASS_STARTED"));
    const onClose = vi.fn();
    await send(onClose);
    expect(toast.error).toHaveBeenCalledWith("calendar.notify.classStarted");
    expect(toast.error).not.toHaveBeenCalledWith("calendar.notify.failedSendInvitations");
    expect(onClose).toHaveBeenCalled();
  });

  it("any other failure keeps the generic message", async () => {
    mutateAsync.mockRejectedValue(refusal(500));
    await send(vi.fn());
    expect(toast.error).toHaveBeenCalledWith("calendar.notify.failedSendInvitations");
  });
});
