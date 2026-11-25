/**
 * PAD-929 (classes.class-requests rule 13b), the phone's half: when the private step's availability
 * answer for the request on screen leaves no start time, and the request has no invitees, the step
 * lists the coach's visible private lessons (`type=private`) under today's message, with the state in
 * the test id; each row's one action goes through the private-lesson warning (classes.join-requests
 * rule 22). Located by
 * test id, never by copy (`t` returns the key).
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ testID }: { testID: string }) => <View testID={testID} />,
}));
vi.mock("@levelup/api/src/resources/classRequests", () => ({ createClassRequest: vi.fn(), classRequestRefusal: () => null }));
const joinApi = vi.hoisted(() => ({ createClassJoinRequest: vi.fn(), joinClassWaitingList: vi.fn() }));
vi.mock("@levelup/api/src/resources/classJoinRequests", () => ({ createClassJoinRequest: joinApi.createClassJoinRequest }));
vi.mock("@levelup/api/src/resources/academyClasses", () => ({ joinClassWaitingList: joinApi.joinClassWaitingList }));
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children);
  const button = (p: { children?: React.ReactNode; testID?: string; onPress?: () => void }) =>
    React.createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children);
  return {
    AlertDialog: (p: { open: boolean; children?: React.ReactNode }) => (p.open ? React.createElement(View, null, p.children) : null),
    AlertDialogContent: box,
    AlertDialogHeader: box,
    AlertDialogFooter: box,
    AlertDialogDescription: box,
    AlertDialogCancel: button,
    AlertDialogAction: button,
  };
});

const availabilityApi = vi.hoisted(() => ({
  getRequestParticipants: vi.fn().mockResolvedValue([]),
  getCoachAvailability: vi.fn(),
}));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn() }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { PrivateClassStep } from "./PrivateClassStep";

const NO_TIME = { freeWindows: {}, workingHoursSource: "custom" };

function lesson(id: string, state: "open" | "full") {
  return {
    id, model: "LessonInstance", originalId: id, date: "2026-11-20", startTime: "18:00", endTime: "19:30",
    title: `Private ${id}`, club: { name: "Douro Padel" }, classType: "private", state,
    spotsLeft: state === "open" ? 1 : 0, myJoinRequest: null, onWaitingList: false,
  };
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

async function mount(): Promise<Native> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await renderNative(
    <QueryClientProvider client={client}>
      <PrivateClassStep coachId="ana-id" onDone={vi.fn()} />
    </QueryClientProvider>
  );
  await view.flush();
  await view.flush();
  return view;
}

afterEach(() => {
  joinApi.createClassJoinRequest.mockReset();
  joinApi.joinClassWaitingList.mockReset();
  availabilityApi.getCoachAvailability.mockReset();
  availabilityApi.getRequestParticipants.mockReset().mockResolvedValue([]);
  academyApi.listAcademyClasses.mockReset();
});

describe("no free time offers the coach's visible private lessons (rule 13b)", () => {
  it("[CLASSES-CLASS-REQUESTS-45] no free time lists the coach's visible private lessons", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open"), lesson("2", "full")] });

    const view = await mount();
    expect(view.byTestId("wizard-slots-empty")).toBeTruthy();
    expect(academyApi.listAcademyClasses).toHaveBeenCalledWith("ana-id", "private");
    expect(view.byTestId("wizard-private-lessons")).toBeTruthy();
    const open = textOf(view.byTestId("wizard-private-lesson-row-open"));
    expect(open).toContain("18:00–19:30");
    expect(open).toContain('classRequests.minutes:{"count":90}');
    expect(open).toContain("Douro Padel");
    expect(view.byTestId("wizard-private-lesson-row-full")).toBeTruthy();
    // Each row offers its one action: request when open, the waiting list when full.
    expect(view.queryByTestId("wizard-private-lesson-request")).not.toBeNull();
    expect(view.queryByTestId("wizard-private-lesson-waitlist")).not.toBeNull();

    // Weekly too.
    await view.press("wizard-recurrence-weekly");
    await view.press("wizard-weekday-2");
    await view.flush();
    await view.flush();
    expect(view.byTestId("wizard-slots-empty")).toBeTruthy();
    expect(view.byTestId("wizard-private-lesson-row-full")).toBeTruthy();
  });

  it("[CLASSES-CLASS-REQUESTS-45] with no private lesson, or a failed list read, only the message shows", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [] });
    let view = await mount();
    expect(academyApi.listAcademyClasses).toHaveBeenCalled();
    expect(view.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(textOf(view.byTestId("wizard-slots-empty"))).toContain("classRequests.noFreeBlocks");
    view.root.unmount();

    academyApi.listAcademyClasses.mockReset().mockRejectedValue(new Error("403"));
    view = await mount();
    expect(academyApi.listAcademyClasses).toHaveBeenCalled();
    expect(view.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(textOf(view.byTestId("wizard-slots-empty"))).toContain("classRequests.noFreeBlocks");
  });

  it("[CLASSES-CLASS-REQUESTS-45] never reads them while there are start times, or after a failed availability read", async () => {
    availabilityApi.getCoachAvailability.mockImplementation(async ({ from }: { from: string }) => ({
      freeWindows: { [from]: [{ startTime: "18:00", endTime: "19:00" }] },
      workingHoursSource: "custom",
    }));
    let view = await mount();
    expect(view.byTestId("wizard-slots-ready")).toBeTruthy();
    expect(academyApi.listAcademyClasses).not.toHaveBeenCalled();
    view.root.unmount();

    availabilityApi.getCoachAvailability.mockReset().mockRejectedValue(new Error("400"));
    view = await mount();
    expect(view.byTestId("wizard-slots-empty")).toBeTruthy();
    expect(academyApi.listAcademyClasses).not.toHaveBeenCalled();
    expect(view.queryByTestId("wizard-private-lessons")).toBeNull();
  });

  it("[CLASSES-CLASS-REQUESTS-45] never offers them for a request with invitees", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    availabilityApi.getRequestParticipants.mockResolvedValue([{ username: "carla", ok: true }]);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open")] });
    const view = await mount();
    expect(view.byTestId("wizard-private-lessons")).toBeTruthy();
    const readsAlone = academyApi.listAcademyClasses.mock.calls.length;

    await view.press("wizard-people-2");
    await view.changeText("wizard-invitee-0", "carla");
    await new Promise((r) => setTimeout(r, 450)); // the roster check's debounce
    await view.flush();
    await view.flush();
    await view.flush();
    expect(availabilityApi.getCoachAvailability).toHaveBeenCalledWith(expect.objectContaining({ participants: ["carla"] }));
    expect(view.byTestId("wizard-slots-empty")).toBeTruthy();
    expect(view.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(academyApi.listAcademyClasses.mock.calls.length).toBe(readsAlone);
  });
});

describe("a list row joins through the warning (classes.join-requests rule 22)", () => {
  it("[CLASSES-JOIN-REQUESTS-43] a list row joins through the warning", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open"), lesson("2", "full")] });
    joinApi.createClassJoinRequest.mockResolvedValue({ id: 9, status: "pending", side: "right" });
    joinApi.joinClassWaitingList.mockResolvedValue({ onWaitingList: true });
    const view = await mount();

    // Open row: NÃO sends nothing; SIM opens the side sheet and the request carries the confirmation.
    await view.press("wizard-private-lesson-request");
    expect(view.queryByTestId("private-lesson-warning")).not.toBeNull();
    await view.press("private-lesson-warning-no");
    expect(joinApi.createClassJoinRequest).not.toHaveBeenCalled();
    expect(view.queryByTestId("private-lesson-warning")).toBeNull();
    await view.press("wizard-private-lesson-request");
    await view.press("private-lesson-warning-yes");
    await view.press("class-side-right");
    await view.press("class-side-send");
    await view.flush();
    expect(joinApi.createClassJoinRequest).toHaveBeenCalledWith(expect.objectContaining({ originalId: "1" }), undefined, "right", true);

    // Full row: the waiting-list join goes through the same warning.
    await view.flush();
    await view.press("wizard-private-lesson-waitlist");
    await view.press("private-lesson-warning-yes");
    await view.press("class-side-left");
    await view.press("class-side-send");
    await view.flush();
    expect(joinApi.joinClassWaitingList).toHaveBeenCalledWith(expect.objectContaining({ originalId: "2" }), "left", undefined, true);
  });
});
