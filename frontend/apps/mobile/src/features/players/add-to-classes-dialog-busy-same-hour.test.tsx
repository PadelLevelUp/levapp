/**
 * PAD-920 (classes.instance-enrollment rule 15), the iOS half: a coach's add that would put the
 * student in two classes at the same hour answers `409 busy_same_hour`. The add-to-classes dialog
 * saves the other classes and lists each refused one with the shared helper's line per clash, never
 * the generic failure toast. The class screen's edit (and a coach's join-request accept) reads the
 * refusal through `busySameHourToast`, unit-tested below: one toast whatever the number of clashes.
 */
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const interpolate = vi.hoisted(
  () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(" ")}` : key
);
vi.mock("react-i18next", () => ({
  // Interpolates its params, so a line is checked for the student, the class and the time it names.
  useTranslation: () => ({ t: interpolate, i18n: { language: "pt" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (p: { children?: ReactNode; testID?: string }) => createElement(View, { testID: p.testID }, p.children);
  return {
    Dialog: (p: { open: boolean; children?: ReactNode }) => (p.open ? createElement(View, null, p.children) : null),
    DialogContent: pass, DialogDescription: pass, DialogFooter: pass, DialogHeader: pass, DialogTitle: pass,
  };
});
vi.mock("@/components/ui/button", async () => {
  const { Pressable } = await import("react-native");
  return {
    Button: (p: { children?: ReactNode; testID?: string; onPress?: () => void; disabled?: boolean }) =>
      createElement(Pressable, { testID: p.testID, onPress: p.onPress, disabled: p.disabled }, p.children),
  };
});
vi.mock("@/components/ui/badge", async () => {
  const { View } = await import("react-native");
  return { Badge: (p: { children?: ReactNode }) => createElement(View, null, p.children) };
});
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/features/calendar/eligibility-confirm-dialog", () => ({ EligibilityConfirmDialog: () => null }));
vi.mock("@/features/calendar/unavailable-student-dialog", () => ({ UnavailableStudentDialog: () => null }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const mutateAsync = vi.hoisted(() => vi.fn());
const weekClasses = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/features/calendar/hooks", () => ({ useEditClass: () => ({ mutateAsync }) }));
vi.mock("./hooks", () => ({ useClassInstancesForWeek: () => ({ data: weekClasses.list, isPending: false }) }));
vi.mock("@levelup/api", () => ({
  notificationEngineApi: {
    checkAvailabilityConflicts: vi.fn().mockResolvedValue([]),
    checkEligibility: vi.fn().mockResolvedValue({ ineligible: [] }),
  },
}));

import { toast } from "@/components/ui/toast";
import { busySameHourToast } from "@/features/calendar/busy-same-hour-toast";
import { AddToClassesDialog } from "./add-to-classes-dialog";

// The clock is pinned to a Wednesday morning (Date only, so the harness's setTimeout still runs):
// the picker offers only classes that have not started, in the shown week.
const date = "2026-11-12";
const cls = (id: string, title: string) =>
  ({
    id, title, date, startTime: "19:00", endTime: "20:00", model: "LessonInstance", originalId: id,
    status: "scheduled", maxPlayers: 4, participantCount: 1, color: null,
  }) as unknown as CalendarEvent;

const refusal = {
  response: {
    status: 409,
    data: {
      code: "busy_same_hour",
      clashes: [{ playerId: 7, playerName: "Rita", lessonInstanceId: 99, title: "Outra aula", start: `${date}T19:00:00` }],
    },
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 11, 10, 0));
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  mutateAsync.mockReset();
  weekClasses.list = [cls("c1", "Aula A"), cls("c2", "Aula B")];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AddToClassesDialog: an add refused at the same hour", () => {
  it("[CLASSES-INSTANCE-ENROLLMENT-33] shows each clash and saves the classes that did not refuse", async () => {
    mutateAsync.mockImplementation(async ({ event }: { event: CalendarEvent }) => {
      if (event.id === "c1") throw refusal;
      return {};
    });
    const onClose = vi.fn();
    const ui = await renderNative(
      <AddToClassesDialog open onClose={onClose} playerId="7" playerName="Rita" />
    );
    await ui.press("add-to-classes-class-c1");
    await ui.press("add-to-classes-class-c2");
    await ui.press("add-to-classes-save");
    await ui.flush();

    // Both were tried; the second was saved although the first refused.
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls.map((c) => c[0].event.id)).toEqual(["c1", "c2"]);
    expect(toast.success).toHaveBeenCalledWith("players.addedToClasses name=Rita count=1");
    // The refused class is listed with the shared helper's line, never the generic toast.
    expect(ui.byTestId("add-to-classes-busy-same-hour")).toBeTruthy();
    expect(ui.byTestId("add-to-classes-busy-same-hour-c1")).toBeTruthy();
    expect(ui.byTestId("add-to-classes-busy-same-hour-line-c1-0")).toBeTruthy();
    expect(ui.queryByTestId("add-to-classes-busy-same-hour-c2")).toBeNull();
    const text = ui.byTestId("add-to-classes-busy-same-hour-line-c1-0").props.children;
    expect(text).toMatch(/^calendar\.busySameHour\.line /);
    expect(text).toContain("name=Rita");
    expect(text).toContain("title=Outra aula");
    expect(text).toContain("time=19:00");
    expect(toast.error).not.toHaveBeenCalledWith("common.somethingWentWrong");
    // The dialog stays open so the line can be read.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[CLASSES-INSTANCE-ENROLLMENT-33] any other failure keeps today's generic toast", async () => {
    weekClasses.list = [cls("c1", "Aula A")];
    mutateAsync.mockRejectedValue({ response: { status: 500, data: {} } });
    const ui = await renderNative(<AddToClassesDialog open onClose={() => {}} playerId="7" playerName="Rita" />);
    await ui.press("add-to-classes-class-c1");
    await ui.press("add-to-classes-save");
    await ui.flush();
    expect(toast.error).toHaveBeenCalledWith("common.somethingWentWrong");
    expect(ui.queryByTestId("add-to-classes-busy-same-hour")).toBeNull();
  });
});

describe("busySameHourToast: the class edit's and the join-request accept's one toast", () => {
  const clash = refusal.response.data.clashes[0];
  const busy = (clashes: unknown[]) => ({ response: { status: 409, data: { code: "busy_same_hour", clashes } } });

  it("[CLASSES-INSTANCE-ENROLLMENT-33] the class edit reads the refusal's clashes", () => {
    // One clash: the title is its line, nothing below it.
    const one = busySameHourToast(busy([clash]), "pt")!;
    expect(one.title.key).toBe("calendar.busySameHour.line");
    expect(one.title.params).toMatchObject({ name: "Rita", title: "Outra aula", time: "19:00" });
    expect(one.description).toEqual([]);

    // Two clashes: still ONE toast, the second clash in its description.
    const two = busySameHourToast(busy([clash, { ...clash, playerName: "Rui", title: "Aula C" }]), "pt")!;
    expect(two.title.params).toMatchObject({ name: "Rita" });
    expect(two.description).toHaveLength(1);
    expect(two.description[0].params).toMatchObject({ name: "Rui", title: "Aula C", time: "19:00" });

    // Any other failure is not this refusal: the screen keeps its generic toast.
    expect(busySameHourToast({ response: { status: 500, data: {} } }, "pt")).toBeNull();
    expect(busySameHourToast({ response: { status: 409, data: { code: "side_full" } } }, "pt")).toBeNull();
    expect(busySameHourToast(new Error("network"), "pt")).toBeNull();
  });
});
