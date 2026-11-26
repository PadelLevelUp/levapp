/**
 * classes.class-requests rule 21 on the phone: the private class is asked in three steps (people, when, time) under one
 * pinned foot, on the real wizard screen. The coaches, requests and availability are mocked; `t` returns the key, so
 * everything is found by test id. The clock is pinned (Date only) and moved by hand for the 400 ms lock.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative, type Native } from "@/test/render-native";
import {
  PRIVATE_REQUEST_FREE_WINDOW,
  PRIVATE_REQUEST_NOTE,
  SINGLE_WITH_INVITEE_BODY,
  WEEKLY_AFTER_3_CLASSES_BODY,
} from "@levelup/config/src/private-request-bodies.fixture";
// The aliased stub of react-native: test-only hooks (hardware back, accessibility focus, scrollTo calls, Platform).
import * as RN from "react-native";

const stub = RN as unknown as {
  Platform: { OS: string };
  __emitHardwareBack: () => boolean;
  __accessibilityFocusCount: () => number;
  __scrollToCalls: () => unknown[];
  __resetReactNativeMock: () => void;
};

vi.mock("@/lib/keyboard-avoiding", () => ({ keyboardAvoidingBehavior: () => "padding" }));
vi.mock("@/lib/native-header-offset", () => ({ useNativeHeaderKeyboardOffset: () => 0 }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ testID, onChange }: { testID: string; onChange: (v: string) => void }) => (
    <View testID={testID} {...({ onChangeText: onChange } as object)} />
  ),
}));
vi.mock("@/features/class-requests/wizard/AcademyClassStep", () => ({ AcademyClassStep: () => null }));
const requests = vi.hoisted(() => ({ createClassRequest: vi.fn(), listClassRequestCoaches: vi.fn() }));
vi.mock("@levelup/api/src/resources/classRequests", () => ({
  createClassRequest: requests.createClassRequest,
  listClassRequestCoaches: requests.listClassRequestCoaches,
  classRequestRefusal: () => null,
}));
const availabilityApi = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn().mockResolvedValue({ classes: [] }) }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import ClassRequestWizardScreen from "../../../../app/class-request-wizard";

const T0 = new Date("2026-10-01T10:00:00Z").getTime();
let now = T0;
const setNow = (ms: number) => {
  now = ms;
  vi.setSystemTime(now);
};
/** Moves the clock past the 400 ms lock of the step that just showed. */
const passLock = () => setNow(now + 401);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COACHES = [
  { id: "ana-id", name: "Ana" },
  { id: "bia-id", name: "Bia" },
];
let mounted: Native[] = [];

async function mount(): Promise<Native> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const view = await renderNative(
    <QueryClientProvider client={client}>
      <ClassRequestWizardScreen />
    </QueryClientProvider>
  );
  mounted.push(view);
  await view.flush();
  await view.flush();
  return view;
}
const privateStep = (v: Native) => ["people", "when", "time"].find((s) => v.queryByTestId(`class-request-wizard-private-${s}`)) ?? null;
const cont = (v: Native) => v.byTestId("wizard-continue").props.disabled as boolean;
async function toPrivate(coaches = [COACHES[0]]): Promise<Native> {
  requests.listClassRequestCoaches.mockResolvedValue(coaches);
  const v = await mount();
  if (coaches.length > 1) {
    await v.press(`wizard-coach-${coaches[0].id}`);
    await v.flush();
  }
  await v.press("wizard-kind-private");
  await v.flush();
  expect(privateStep(v)).toBe("people");
  return v;
}
async function next(v: Native, to: string) {
  passLock();
  await v.press("wizard-continue");
  await v.flush();
  await v.flush();
  expect(privateStep(v)).toBe(to);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(T0);
  mounted = [];
  stub.__resetReactNativeMock();
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ ...PRIVATE_REQUEST_FREE_WINDOW }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) =>
    names.map((username) => (username === "nobody" ? { username, ok: false, code: "NOT_ON_ROSTER" } : { username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});
afterEach(() => {
  for (const v of mounted) v.root.unmount();
  vi.useRealTimers();
  stub.__resetReactNativeMock();
});

const ancestors = (n: { parent: unknown }) => {
  const out: Array<{ type: unknown }> = [];
  let p = n.parent as { type: unknown; parent: unknown } | null;
  while (p) {
    out.push(p);
    p = p.parent as typeof p;
  }
  return out;
};

describe("three steps that keep their answers (criterion 58)", () => {
  it("[CLASSES-CLASS-REQUESTS-58] three steps that keep their answers: back, the kind, the same coach, and a new screen", async () => {
    const v = await toPrivate();
    expect(v.queryByTestId("wizard-recurrence-weekly")).toBeNull();
    expect(v.queryByTestId("wizard-slots-ready")).toBeNull();
    expect(cont(v)).toBe(false);

    await v.press("wizard-people-2");
    expect(cont(v)).toBe(true);
    await v.changeText("wizard-invitee-0", "carla");
    await wait(450);
    await v.flush();
    expect(cont(v)).toBe(false);
    await next(v, "when");
    await v.changeText("wizard-date", "2026-10-06");
    await next(v, "time");
    expect(v.byTestId("wizard-summary").props.children).toContain("carla");

    await v.press("wizard-back");
    expect(privateStep(v)).toBe("when");
    await v.press("wizard-back");
    expect(privateStep(v)).toBe("people");
    expect(v.byTestId("wizard-people-2").props.accessibilityState.selected).toBe(true);
    expect(v.byTestId("wizard-invitee-0").props.value).toBe("carla");
    await v.press("wizard-back");
    expect(v.queryByTestId("wizard-kind-private")).not.toBeNull();
    await v.press("wizard-kind-private");
    expect(v.byTestId("wizard-people-2").props.accessibilityState.selected).toBe(true);

    // A new screen starts with an empty draft.
    const again = await toPrivate();
    expect(again.byTestId("wizard-people-1").props.accessibilityState.selected).toBe(true);
  });

  it("[CLASSES-CLASS-REQUESTS-58] three steps that keep their answers: another coach starts clean, and so does coach A after B", async () => {
    const v = await toPrivate(COACHES);
    await v.press("wizard-people-3");
    await v.press("wizard-back");
    await v.press("wizard-back");
    await v.press("wizard-coach-bia-id");
    await v.press("wizard-kind-private");
    expect(v.byTestId("wizard-people-1").props.accessibilityState.selected).toBe(true);
    await v.press("wizard-people-4");
    await v.press("wizard-back");
    await v.press("wizard-back");
    await v.press("wizard-coach-ana-id");
    await v.press("wizard-kind-private");
    expect(v.byTestId("wizard-people-1").props.accessibilityState.selected).toBe(true);
  });

  it("[CLASSES-CLASS-REQUESTS-58] the foot and wizard-back sit outside the ScrollView, in the keyboard view, with the bottom inset, and are 44 high", async () => {
    const v = await toPrivate();
    for (const id of ["wizard-continue", "wizard-back", "wizard-foot"]) {
      const types = ancestors(v.byTestId(id)).map((a) => String(a.type));
      expect(types, id).not.toContain("ScrollView");
      expect(types, id).toContain("KeyboardAvoidingView");
    }
    expect(String(v.byTestId("wizard-continue").props.className)).toContain("min-h-11");
    expect(String(v.byTestId("wizard-back").props.className)).toMatch(/h-11 w-11/);
    expect(v.byTestId("wizard-foot").props.style.paddingBottom).toBe(34);
    // The scrolled body holds the step.
    expect(ancestors(v.byTestId("class-request-wizard-private-people")).map((a) => String(a.type))).toContain("ScrollView");
    expect(String(v.byTestId("wizard-people-2").props.className)).toMatch(/h-11 w-11/);
    await next(v, "when");
    expect(String(v.byTestId("wizard-recurrence-weekly").props.className)).toContain("min-h-11");
    await v.press("wizard-recurrence-weekly");
    expect(String(v.byTestId("wizard-weekday-2").props.className)).toMatch(/h-11 w-11/);
    expect(String(v.byTestId("request-end-mode-date").props.className)).toContain("h-11");
    await v.press("request-end-mode-count");
    expect(String(v.byTestId("request-end-count-dec").props.className)).toMatch(/h-11 w-11/);
    await v.press("wizard-recurrence-single");
    await next(v, "time");
    expect(String(v.byTestId("wizard-duration-60").props.className)).toContain("min-h-11");
    expect(String(v.byTestId("wizard-send").props.className)).toContain("min-h-11");
  });

  it("[CLASSES-CLASS-REQUESTS-58] each new step scrolls the ScrollView to its top", async () => {
    const v = await toPrivate();
    const before = stub.__scrollToCalls().length;
    await next(v, "when");
    await next(v, "time");
    await v.press("wizard-back");
    expect(stub.__scrollToCalls().length).toBeGreaterThanOrEqual(before + 3);
    expect(stub.__scrollToCalls().every((c) => (c as { y: number }).y === 0)).toBe(true);
  });
});

describe("what is sent is what the steps show (criterion 59)", () => {
  it("[CLASSES-CLASS-REQUESTS-59] what is sent is what the steps show: a single request with an invitee", async () => {
    const v = await toPrivate();
    await v.press("wizard-people-2");
    await v.changeText("wizard-invitee-0", "carla");
    await wait(450);
    await v.flush();
    await next(v, "when");
    await v.changeText("wizard-date", SINGLE_WITH_INVITEE_BODY.date);
    await next(v, "time");
    await v.changeText("wizard-note", PRIVATE_REQUEST_NOTE);
    await v.flush();
    await v.flush();
    await v.press(`wizard-slot-${PRIVATE_REQUEST_FREE_WINDOW.startTime}`);
    await v.press("wizard-send");
    await v.flush();
    expect(requests.createClassRequest).toHaveBeenCalledTimes(1);
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(SINGLE_WITH_INVITEE_BODY);
  });

  it("[CLASSES-CLASS-REQUESTS-59] what is sent is what the steps show: a weekly request ending after 3 classes", async () => {
    const v = await toPrivate();
    await next(v, "when");
    await v.press("wizard-recurrence-weekly");
    await v.press("wizard-weekday-2");
    await v.changeText("wizard-start-date", WEEKLY_AFTER_3_CLASSES_BODY.recurrence.startDate);
    await v.press("request-end-mode-count");
    await v.press("request-end-count-dec");
    await next(v, "time");
    await v.flush();
    await v.flush();
    await v.press(`wizard-slot-${PRIVATE_REQUEST_FREE_WINDOW.startTime}`);
    await v.press("wizard-send");
    await v.flush();
    expect(requests.createClassRequest).toHaveBeenCalledTimes(1);
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(WEEKLY_AFTER_3_CLASSES_BODY);
  });
});

describe("invalid answers never pass a step (criterion 61)", () => {
  it("[CLASSES-CLASS-REQUESTS-61] invalid answers never pass a step: a refused or repeated username", async () => {
    const v = await toPrivate();
    await v.press("wizard-people-3");
    await v.changeText("wizard-invitee-0", "nobody");
    await v.changeText("wizard-invitee-1", "carla");
    await wait(450);
    await v.flush();
    expect(cont(v)).toBe(true);
    await v.changeText("wizard-invitee-0", "carla");
    await v.changeText("wizard-invitee-1", " Carla ");
    await wait(450);
    await v.flush();
    expect(cont(v)).toBe(true);
    passLock();
    await v.press("wizard-continue").catch(() => undefined);
    expect(privateStep(v)).toBe("people");
  });

  it("[CLASSES-CLASS-REQUESTS-61] invalid answers never pass a step: an empty and a past date, and a cleared weekly start", async () => {
    const v = await toPrivate();
    await next(v, "when");
    await v.changeText("wizard-date", "");
    expect(cont(v)).toBe(true);
    await v.changeText("wizard-date", "2026-09-30");
    expect(cont(v)).toBe(true);
    await v.changeText("wizard-date", "2026-10-01");
    expect(cont(v)).toBe(false);
    await v.press("wizard-recurrence-weekly");
    await v.press("wizard-weekday-2");
    for (const mode of ["date", "count"]) {
      await v.press(`request-end-mode-${mode}`);
      await v.changeText("wizard-start-date", "");
      expect(cont(v)).toBe(true);
      await v.changeText("wizard-start-date", "2026-10-06");
      expect(cont(v)).toBe(false);
    }
  });
});

describe("the lock and the double tap (criterion 66)", () => {
  it("[CLASSES-CLASS-REQUESTS-66] the lock and the double tap: under 400 ms nothing, at 401 one step", async () => {
    const v = await toPrivate();
    setNow(now + 399);
    await v.press("wizard-continue");
    expect(privateStep(v)).toBe("people");
    setNow(now + 2);
    await v.press("wizard-continue");
    await v.flush();
    expect(privateStep(v)).toBe("when");
  });

  it("[CLASSES-CLASS-REQUESTS-66] the lock and the double tap: two presses 100 ms apart move one step, not two", async () => {
    const v = await toPrivate();
    passLock();
    await v.press("wizard-continue");
    setNow(now + 100);
    await v.press("wizard-continue");
    await v.flush();
    expect(privateStep(v)).toBe("when");
  });
});

describe("a step change is announced (criterion 62)", () => {
  it("[CLASSES-CLASS-REQUESTS-62] the step's title takes the focus", async () => {
    const v = await toPrivate();
    const title = () => v.byTestId("wizard-step-title");
    expect(title().props.accessibilityRole).toBe("header");
    const text = () => (title().findAllByType("Text" as never)[0]?.props.children as string);
    expect(text()).toBe("classRequestWizard.steps.people");
    const first = stub.__accessibilityFocusCount();
    expect(first).toBeGreaterThan(0);
    await next(v, "when");
    expect(text()).toBe("classRequestWizard.steps.when");
    expect(stub.__accessibilityFocusCount()).toBe(first + 1);
    await next(v, "time");
    expect(stub.__accessibilityFocusCount()).toBe(first + 2);
    await v.press("wizard-back");
    expect(text()).toBe("classRequestWizard.steps.when");
    expect(stub.__accessibilityFocusCount()).toBe(first + 3);
  });
});

describe("Android's back goes one step back, then leaves (criterion 65)", () => {
  it("[CLASSES-CLASS-REQUESTS-65] Android's back goes one step back through time, when, people, the kind, the coach, then the navigator", async () => {
    stub.Platform.OS = "android";
    const v = await toPrivate(COACHES);
    await next(v, "when");
    await next(v, "time");
    const back = async () => {
      expect(stub.__emitHardwareBack()).toBe(true);
      await v.flush();
    };
    await back();
    expect(privateStep(v)).toBe("when");
    await back();
    expect(privateStep(v)).toBe("people");
    await back();
    expect(v.queryByTestId("wizard-kind-private")).not.toBeNull();
    await back();
    expect(v.queryByTestId("wizard-coach-ana-id")).not.toBeNull();
    // The first screen: the registry has nothing, so the navigator gets the press.
    expect(stub.__emitHardwareBack()).toBe(false);
  });

  it("[CLASSES-CLASS-REQUESTS-65] the academy step and the kind step go back too, and with one coach the kind is the first screen", async () => {
    stub.Platform.OS = "android";
    requests.listClassRequestCoaches.mockResolvedValue([COACHES[0]]);
    const v = await mount();
    expect(stub.__emitHardwareBack()).toBe(false);
    await v.press("wizard-kind-academy");
    await v.flush();
    expect(stub.__emitHardwareBack()).toBe(true);
    await v.flush();
    expect(v.queryByTestId("wizard-kind-private")).not.toBeNull();
    expect(stub.__emitHardwareBack()).toBe(false);
  });

  it("[CLASSES-CLASS-REQUESTS-65] on iOS the registry is inert", async () => {
    stub.Platform.OS = "ios";
    const v = await toPrivate();
    await next(v, "when");
    expect(stub.__emitHardwareBack()).toBe(false);
    expect(privateStep(v)).toBe("when");
  });
});
