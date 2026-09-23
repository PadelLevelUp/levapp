/**
 * PAD-393 (B-156) — the first mobile component test: a change of language never undoes
 * an unsaved edit in the working-hours editor (PAD-392, B-155), proven on iOS the way
 * the web test proves it, not by "same shape as web".
 *
 * The defect's mechanism is literally "`t` gets a new identity": the test hands the
 * mounted section a NEW `t` after an edit and asserts the edit is still there and the
 * week was loaded once. No timing, no simulator. Native modules the section renders
 * (icons, nativewind classNames, the Switch and Dialog primitives, the toast) are mocked
 * here, as the web tests mock Radix.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

const getCoachWorkingHours = vi.fn();
const putCoachWorkingHours = vi.fn();
vi.mock("@levelup/api", () => ({
  workingHoursApi: {
    getCoachWorkingHours: (...a: unknown[]) => getCoachWorkingHours(...a),
    putCoachWorkingHours: (...a: unknown[]) => putCoachWorkingHours(...a),
  },
}));

let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

// Native-only pieces the section renders, replaced by the host primitives of the stub.
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/switch", async () => {
  const { Switch } = await import("react-native");
  return { Switch };
});
vi.mock("@/components/ui/time-picker-input", async () => {
  const { TextInput } = await import("react-native");
  return { TimePickerInput: (p: { testID: string; value: string; onChange: (v: string) => void }) =>
    createElement(TextInput, { testID: p.testID, value: p.value, onChangeText: p.onChange }) };
});

import { WorkingHoursSection, weeksEqual } from "./working-hours-section";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";
import { WORKING_DAY_KEYS, DEFAULT_WORKING_WINDOW } from "@levelup/config";

beforeEach(() => {
  getCoachWorkingHours.mockReset().mockResolvedValue({ workingHours: null });
  putCoachWorkingHours.mockReset();
  settleLanguage();
});

const sundayState = (n: { queryByTestId: (id: string) => unknown }) =>
  n.queryByTestId("working-hours-day-sun-off") ? "off" : n.queryByTestId("working-hours-day-sun-working") ? "working" : "absent";

describe("working-hours-section (iOS) — a late load never undoes an edit (PAD-392)", () => {
  it("keeps a day switched off when the language settles afterwards", async () => {
    const n = await renderNative(<WorkingHoursSection />);
    await n.flush();
    expect(sundayState(n)).toBe("working");

    await n.toggle("working-hours-works-sun");
    expect(sundayState(n)).toBe("off");

    settleLanguage();
    await n.rerender(<WorkingHoursSection />);
    await n.flush();

    expect(sundayState(n)).toBe("off");
  });

  it("loads the week once, however often the language changes", async () => {
    const n = await renderNative(<WorkingHoursSection />);
    await n.flush();
    for (let i = 0; i < 3; i++) {
      settleLanguage();
      await n.rerender(<WorkingHoursSection />);
      await n.flush();
    }
    expect(getCoachWorkingHours).toHaveBeenCalledTimes(1);
  });

  it("still shows what the server holds when nothing was touched", async () => {
    getCoachWorkingHours.mockResolvedValue({ workingHours: { mon: [["09:00", "13:00"]], tue: [], wed: [["08:00", "22:00"]], thu: [["08:00", "22:00"]], fri: [["08:00", "22:00"]], sat: [["08:00", "22:00"]], sun: [] } });
    const n = await renderNative(<WorkingHoursSection />);
    await n.flush();
    expect(sundayState(n)).toBe("off");
    expect(n.queryByTestId("working-hours-set")).not.toBeNull();
  });
});

function defaultWeek() {
  const week: Record<string, { off: boolean; windows: [string, string][] }> = {};
  for (const key of WORKING_DAY_KEYS) {
    week[key] = { off: false, windows: [[DEFAULT_WORKING_WINDOW.startTime, DEFAULT_WORKING_WINDOW.endTime]] };
  }
  return week as Parameters<typeof weeksEqual>[0];
}

describe("weeksEqual (settings.unsaved-edits rule 2)", () => {
  it("is true for value-equal weeks, even with rebuilt (non-identical) arrays", () => {
    expect(weeksEqual(defaultWeek(), defaultWeek())).toBe(true);
  });

  it("is false the moment a day's off flag or windows differ", () => {
    const a = defaultWeek();
    const b = { ...defaultWeek(), sun: { off: true, windows: [] as [string, string][] } };
    expect(weeksEqual(a, b)).toBe(false);
  });

  it("is false when a window's start/end time differs", () => {
    const a = defaultWeek();
    const b = { ...defaultWeek(), mon: { off: false, windows: [["07:00", "22:00"]] as [string, string][] } };
    expect(weeksEqual(a, b)).toBe(false);
  });
});

describe("WorkingHoursSection registers its unsaved state (PAD-394)", () => {
  it("toggling a day -> unsaved; toggling back -> clean; a successful save -> clean", async () => {
    putCoachWorkingHours.mockImplementation((value: unknown) =>
      Promise.resolve({ workingHours: value })
    );
    let registry!: ReturnType<typeof useUnsavedRegistry>;
    function Capture() {
      registry = useUnsavedRegistry();
      return null;
    }
    const n = await renderNative(
      <UnsavedRegistryProvider>
        <Capture />
        <WorkingHoursSection />
      </UnsavedRegistryProvider>
    );
    await n.flush();
    expect(registry.hasUnsaved()).toBe(false);

    await n.toggle("working-hours-works-sun");
    expect(registry.hasUnsaved()).toBe(true);

    await n.toggle("working-hours-works-sun");
    expect(registry.hasUnsaved()).toBe(false);

    await n.toggle("working-hours-works-sun");
    expect(registry.hasUnsaved()).toBe(true);
    await n.press("working-hours-save");
    await n.flush();
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a failed save leaves the section unsaved", async () => {
    putCoachWorkingHours.mockRejectedValue(new Error("network"));
    let registry!: ReturnType<typeof useUnsavedRegistry>;
    function Capture() {
      registry = useUnsavedRegistry();
      return null;
    }
    const n = await renderNative(
      <UnsavedRegistryProvider>
        <Capture />
        <WorkingHoursSection />
      </UnsavedRegistryProvider>
    );
    await n.flush();

    await n.toggle("working-hours-works-sun");
    await n.press("working-hours-save");
    await n.flush();
    expect(registry.hasUnsaved()).toBe(true);
  });
});
