/**
 * PAD-358 flow 66 on the real wizard screen, academy kind: the screen's private-class draft reads nothing here (rule 21:
 * the private class's reads are for the private class), and "Leave the waiting list" reaches the leave endpoint.
 * `t` returns the key, so everything is found by test id.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative, type Native } from "@/test/render-native";
import * as RN from "react-native";

const stub = RN as unknown as { __resetReactNativeMock: () => void };

vi.mock("@/lib/keyboard-avoiding", () => ({ keyboardAvoidingBehavior: () => "padding" }));
vi.mock("@/lib/native-header-offset", () => ({ useNativeHeaderKeyboardOffset: () => 0 }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/features/calendar/ClassSideSheet", () => ({ ClassSideSheet: () => null }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
const requests = vi.hoisted(() => ({ listClassRequestCoaches: vi.fn() }));
vi.mock("@levelup/api/src/resources/classRequests", () => ({
  listClassRequestCoaches: requests.listClassRequestCoaches,
  createClassRequest: vi.fn(),
  classRequestRefusal: () => null,
}));
const availabilityApi = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn(), leaveClassWaitingList: vi.fn() }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import ClassRequestWizardScreen from "../../../../app/class-request-wizard";

const WAITING = {
  id: "c1",
  originalId: "41",
  title: "Full class",
  date: "2026-10-04",
  startTime: "18:00",
  endTime: "19:00",
  state: "full",
  spotsLeft: 0,
  club: null,
  myJoinRequest: null,
  onWaitingList: true,
};
let mounted: Native[] = [];

async function toAcademy(): Promise<Native> {
  requests.listClassRequestCoaches.mockResolvedValue([{ id: "ana-id", name: "Ana" }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const v = await renderNative(
    <QueryClientProvider client={client}>
      <ClassRequestWizardScreen />
    </QueryClientProvider>
  );
  mounted.push(v);
  await v.flush();
  await v.flush();
  await v.press("wizard-kind-academy");
  await v.flush();
  await v.flush();
  return v;
}

beforeEach(() => {
  mounted = [];
  stub.__resetReactNativeMock();
  availabilityApi.getCoachAvailability.mockReset().mockResolvedValue({ freeWindows: {}, workingHoursSource: "custom" });
  availabilityApi.getRequestParticipants.mockReset().mockResolvedValue([]);
  academyApi.listAcademyClasses.mockReset().mockResolvedValue({ classes: [WAITING], openSpotsVisible: true });
  academyApi.leaveClassWaitingList.mockReset().mockResolvedValue({});
});
afterEach(() => {
  for (const v of mounted) v.root.unmount();
  stub.__resetReactNativeMock();
});

describe("the academy kind on the wizard screen (flow 66)", () => {
  it("[CLASSES-CLASS-REQUESTS-57] the academy kind makes no availability or roster read: those belong to the private class", async () => {
    const v = await toAcademy();
    expect(v.queryByTestId("academy-class-list")).not.toBeNull();
    await v.flush();
    expect(availabilityApi.getCoachAvailability).not.toHaveBeenCalled();
    expect(availabilityApi.getRequestParticipants).not.toHaveBeenCalled();
  });

  it("[CLASSES-CLASS-REQUESTS-57] pressing Leave on a waiting-list row calls the leave endpoint with the class's original id", async () => {
    const v = await toAcademy();
    expect(v.queryByTestId("academy-class-status-waitlist")).not.toBeNull();
    await v.press("academy-class-leave-waitlist");
    await v.flush();
    expect(academyApi.leaveClassWaitingList).toHaveBeenCalledTimes(1);
    expect(academyApi.leaveClassWaitingList).toHaveBeenCalledWith(41);
  });
});
