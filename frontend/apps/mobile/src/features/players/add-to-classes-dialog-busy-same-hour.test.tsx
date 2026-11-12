/**
 * PAD-920 (classes.instance-enrollment rule 15), the iOS half: a coach's add that would put the
 * student in two classes at the same hour answers `409 busy_same_hour`. The add-to-classes dialog
 * saves the other classes and lists each refused one with the shared helper's line per clash, never
 * the generic failure toast. The class screen's `finalizeEdit` (app/class/[id].tsx mounts native
 * pieces the unit harness cannot) is checked by reading its source, as class-side-sheet-render does.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
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
    expect(toast.success).toHaveBeenCalledWith("players.addedToClasses");
    // The refused class is listed with the shared helper's line, never the generic toast.
    expect(ui.byTestId("add-to-classes-busy-same-hour")).toBeTruthy();
    expect(ui.byTestId("add-to-classes-busy-same-hour-c1")).toBeTruthy();
    expect(ui.byTestId("add-to-classes-busy-same-hour-line-c1-0")).toBeTruthy();
    expect(ui.queryByTestId("add-to-classes-busy-same-hour-c2")).toBeNull();
    const text = ui.byTestId("add-to-classes-busy-same-hour-line-c1-0").props.children;
    expect(text).toBe("calendar.busySameHour.line");
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

describe("the class screen's finalizeEdit", () => {
  const SCREEN = readFileSync(resolve(__dirname, "../../../app/class/[id].tsx"), "utf8");
  const body = SCREEN.slice(SCREEN.indexOf("const finalizeEdit = async"), SCREEN.indexOf("const commitEdit = async"));

  it("[CLASSES-INSTANCE-ENROLLMENT-33] shows each clash and saves the classes that did not refuse", () => {
    expect(body.length).toBeGreaterThan(0);
    // Reads the refusal's body and shows one shared line per clash...
    expect(body).toContain("busySameHourClashes(err)");
    expect(body).toMatch(/busySameHourLines\(clashes, i18n\.language\)\) toast\.error\(t\(line\.key, line\.params\)\)/);
    // ...gives the coach the form back with their draft kept...
    expect(body).toContain("setIsEditing(true)");
    expect(body).toContain("if (!keepDraft) setDraft(null)");
    // ...and keeps the generic toast for any other failure only.
    expect(body.indexOf('t("calendar.page.updateFailed")')).toBeGreaterThan(body.indexOf("if (clashes)"));
  });
});
