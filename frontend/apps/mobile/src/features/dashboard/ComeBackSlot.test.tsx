/**
 * attendance.confirm rule 32 on iOS: the dashboard's hero / schedule-row slot shows "Afinal vou" only
 * for the served `comeBack` `rejoin`; otherwise the plain spot-taken line (with the waiting-list join)
 * or the waiting-list state. Same test ids as web (`dashboard-come-back*`); `t` returns the key.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative, type Native } from "@/test/render-native";

const { api, toast } = vi.hoisted(() => ({
  api: {
    notificationEngineApi: { respondToReminder: vi.fn() },
    academyClassesApi: { joinClassWaitingList: vi.fn(() => Promise.resolve({ onWaitingList: true })) },
  },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@levelup/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  notificationEngineApi: api.notificationEngineApi,
  academyClassesApi: api.academyClassesApi,
}));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ComeBackSlot } from "./blocks";

const target = { model: "Lesson", originalId: 3, date: "2099-10-19" };
const item = (comeBack: "rejoin" | "waiting_list" | "on_waiting_list" | null) => ({
  lessonInstanceId: 7,
  attendanceState: "not_coming" as const,
  comeBack,
  declineTarget: target,
});
const mount = (el: ReturnType<typeof createElement>): Promise<Native> => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderNative(createElement(QueryClientProvider, { client }, el));
};
const shown = (r: Native) => ({
  button: !!r.queryByTestId("dashboard-come-back"),
  spotTaken: !!r.queryByTestId("dashboard-come-back-spot-taken"),
  join: !!r.queryByTestId("dashboard-come-back-waiting-list"),
  onList: !!r.queryByTestId("dashboard-come-back-on-waiting-list"),
});

beforeEach(() => {
  api.notificationEngineApi.respondToReminder.mockReset();
  api.academyClassesApi.joinClassWaitingList.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("the iOS dashboard slot follows the served comeBack (rule 32)", () => {
  it('[ATTENDANCE-CONFIRM-46] the dashboard slot offers "Afinal vou" only for rejoin', async () => {
    const cases = [
      ["rejoin", { button: true, spotTaken: false, join: false, onList: false }],
      ["waiting_list", { button: false, spotTaken: true, join: true, onList: false }],
      ["on_waiting_list", { button: false, spotTaken: false, join: false, onList: true }],
      [null, { button: false, spotTaken: false, join: false, onList: false }],
    ] as const;
    for (const [comeBack, expected] of cases) {
      const r = await mount(createElement(ComeBackSlot, { item: item(comeBack) }));
      expect({ comeBack, ...shown(r) }).toEqual({ comeBack, ...expected });
      r.root.unmount();
    }
  });

  it("[ATTENDANCE-CONFIRM-46] a tap answered spot_filled moves to the waiting-list line, as information, never an error", async () => {
    api.notificationEngineApi.respondToReminder.mockResolvedValue({ action: "spot_filled" });
    const r = await mount(createElement(ComeBackSlot, { item: item("rejoin") }));
    await r.press("dashboard-come-back");
    await r.flush();
    expect(api.notificationEngineApi.respondToReminder).toHaveBeenCalledWith(7, "yes");
    expect(shown(r)).toEqual({ button: false, spotTaken: true, join: true, onList: false });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
