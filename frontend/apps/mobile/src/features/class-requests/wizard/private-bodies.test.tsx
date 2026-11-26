/**
 * classes.class-requests criterion 59 (rule 21), the recording half on the phone: what the OLD single-form private
 * step posts. The bodies are the fixed literals in `private-request-bodies.fixture`, the ones the three steps must also
 * send. This test passes on the single form; it is the baseline, not a test of new behaviour. `t` returns the key.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative, type Native } from "@/test/render-native";
import {
  PRIVATE_REQUEST_COACH,
  PRIVATE_REQUEST_FREE_WINDOW,
  PRIVATE_REQUEST_NOTE,
  SINGLE_WITH_INVITEE_BODY,
  WEEKLY_AFTER_3_CLASSES_BODY,
} from "@levelup/config/src/private-request-bodies.fixture";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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

import { PrivateClassStep } from "./PrivateClassStep";

async function mount(): Promise<Native> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await renderNative(
    <QueryClientProvider client={client}>
      <PrivateClassStep coachId={PRIVATE_REQUEST_COACH} onDone={vi.fn()} />
    </QueryClientProvider>
  );
  await view.flush();
  await view.flush();
  return view;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SLOT = `wizard-slot-${PRIVATE_REQUEST_FREE_WINDOW.startTime}`;

beforeEach(() => {
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ ...PRIVATE_REQUEST_FREE_WINDOW }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) =>
    names.map((username) => ({ username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});

describe("what the single form posts (the baseline of criterion 59)", () => {
  it("[CLASSES-CLASS-REQUESTS-59] a single request with an invitee posts the fixed body", async () => {
    const view = await mount();
    await view.press("wizard-people-2");
    await view.changeText("wizard-invitee-0", "carla");
    await wait(450); // the roster check's debounce
    await view.changeText("wizard-date", SINGLE_WITH_INVITEE_BODY.date);
    await view.changeText("wizard-note", PRIVATE_REQUEST_NOTE);
    await view.flush();
    await view.flush();
    await view.press(SLOT);
    await view.press("wizard-send");
    await view.flush();
    expect(requests.createClassRequest).toHaveBeenCalledTimes(1);
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(SINGLE_WITH_INVITEE_BODY);
  });

  it("[CLASSES-CLASS-REQUESTS-59] a weekly request ending after 3 classes posts the fixed body", async () => {
    const view = await mount();
    await view.press("wizard-recurrence-weekly");
    await view.press("wizard-weekday-2");
    await view.changeText("wizard-start-date", WEEKLY_AFTER_3_CLASSES_BODY.recurrence.startDate);
    await view.press("request-end-mode-count");
    await view.press("request-end-count-dec");
    await view.flush();
    await view.flush();
    await view.press(SLOT);
    await view.press("wizard-send");
    await view.flush();
    expect(requests.createClassRequest).toHaveBeenCalledTimes(1);
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(WEEKLY_AFTER_3_CLASSES_BODY);
  });
});
