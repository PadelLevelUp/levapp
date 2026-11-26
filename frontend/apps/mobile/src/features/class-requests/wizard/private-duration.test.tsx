/**
 * Private step bugs reported by ui-inspiration's reviewer (no ticket), the phone's half: a length change
 * after picking a time kept the old end (rule 13), a cleared weekly start date threw at render (rule
 * 14a), and the same username twice passed on the client (rule 12). Located by test id; `t` returns the key.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The picker's value reaches the step through `onChange`; the stub exposes it as onChangeText.
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ testID, onChange }: { testID: string; onChange: (v: string) => void }) => (
    <View testID={testID} {...({ onChangeText: onChange } as object)} />
  ),
}));
const requests = vi.hoisted(() => ({ createClassRequest: vi.fn() }));
vi.mock("@levelup/api/src/resources/classRequests", () => ({ createClassRequest: requests.createClassRequest, classRequestRefusal: () => null }));
const availabilityApi = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn().mockResolvedValue({ classes: [] }) }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { PrivateStepHost, type PrivateStepName } from "@/test/privateStepHost";

// One real step at a time over a draft the real hook builds (rule 21); `show` switches the step over the SAME draft.
async function mount(step: PrivateStepName = "time"): Promise<Native & { show: (s: PrivateStepName) => Promise<void> }> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = (s: PrivateStepName) => (
    <QueryClientProvider client={client}>
      <PrivateStepHost step={s} coachId="ana-id" onDone={vi.fn()} />
    </QueryClientProvider>
  );
  const view = await renderNative(el(step));
  await view.flush();
  await view.flush();
  return { ...view, show: async (s) => { await view.rerender(el(s)); await view.flush(); } };
}


// Inside the default 28-day end of the "until a date" ending.
const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slotIds = (v: Native) =>
  ["wizard-slot-09:00", "wizard-slot-09:30", "wizard-slot-10:00", "wizard-slot-11:30", "wizard-slot-12:00"].filter((id) => v.queryByTestId(id));
const selected = (v: Native) => slotIds(v).filter((id) => v.byTestId(id).props.accessibilityState?.selected);
const slotsState = (v: Native) =>
  ["waiting", "loading", "ready", "empty"].find((s) => v.queryByTestId(`wizard-slots-${s}`)) ?? null;

beforeEach(() => {
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ startTime: "09:00", endTime: "13:00" }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) =>
    names.map((username) => ({ username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});

afterEach(() => {
  availabilityApi.getCoachAvailability.mockReset();
  availabilityApi.getRequestParticipants.mockReset();
});

describe("a length change after picking a time (rule 13)", () => {
  it("[CLASSES-CLASS-REQUESTS-54] a length change clears the picked time", async () => {
    const view = await mount();
    expect(slotsState(view)).toBe("ready");
    await view.press("wizard-slot-10:00");
    expect(selected(view)).toEqual(["wizard-slot-10:00"]);
    expect(view.byTestId("wizard-send").props.disabled).toBe(false);

    await view.press("wizard-duration-90");
    await view.flush();
    await view.flush();
    expect(selected(view)).toEqual([]);
    expect(view.byTestId("wizard-send").props.disabled).toBe(true);
    expect(view.queryByTestId("wizard-slot-12:00")).toBeNull();
    expect(view.queryByTestId("wizard-slot-11:30")).not.toBeNull();

    await view.press("wizard-slot-10:00");
    await view.press("wizard-send");
    await view.flush();
    expect(requests.createClassRequest).toHaveBeenCalledWith(expect.objectContaining({ startTime: "10:00", endTime: "11:30" }));
  });
});

describe("a cleared weekly start date (rule 14a)", () => {
  it.each(["date", "count"] as const)("[CLASSES-CLASS-REQUESTS-55] a cleared weekly start date waits (%s ending)", async (ending) => {
    const view = await mount("when");
    await view.press("wizard-recurrence-weekly");
    await view.press("wizard-weekday-2");
    await view.press(`request-end-mode-${ending}`);
    await view.show("time");
    await view.flush();
    expect(slotsState(view)).toBe("ready");

    const calls = availabilityApi.getCoachAvailability.mock.calls.length;
    await view.show("when");
    await view.changeText("wizard-start-date", "");
    await view.show("time");
    expect(slotsState(view)).toBe("waiting");
    expect(slotIds(view)).toEqual([]);
    await wait(30);
    expect(availabilityApi.getCoachAvailability.mock.calls.length).toBe(calls);

    await view.show("when");
    await view.changeText("wizard-start-date", soon);
    await view.show("time");
    await view.flush();
    expect(availabilityApi.getCoachAvailability).toHaveBeenCalledWith(expect.objectContaining({ from: soon }));
  });
});

describe("a repeated username (rule 12)", () => {
  it("[CLASSES-CLASS-REQUESTS-56] a repeated username is refused on the field", async () => {
    const view = await mount("people");
    await view.press("wizard-people-3");
    await view.changeText("wizard-invitee-0", "carla");
    await view.changeText("wizard-invitee-1", " Carla ");
    await wait(450); // the roster check's debounce
    await view.flush();
    await view.flush();
    expect(view.byTestId("wizard-invitee-0").props.accessibilityValue.text).toBe("ok");
    expect(view.byTestId("wizard-invitee-1").props.accessibilityValue.text).toBe("DUPLICATE_INVITEE");
    expect(view.queryByTestId("wizard-invitee-1-error-DUPLICATE_INVITEE")).not.toBeNull();
    await view.show("time");
    expect(slotsState(view)).toBe("waiting");
    await view.show("people");
    const asked = availabilityApi.getRequestParticipants.mock.calls.flatMap((c) => c[1] as string[]);
    expect(asked.map((n) => n.trim().toLowerCase())).toEqual(["carla"]);

    await view.changeText("wizard-invitee-1", "dana");
    await wait(450);
    await view.flush();
    await view.flush();
    expect(view.byTestId("wizard-invitee-1").props.accessibilityValue.text).toBe("ok");
    await view.show("time");
    expect(slotsState(view)).toBe("ready");
  });
});
