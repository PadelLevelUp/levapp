/**
 * PAD-837c (attendance.validation rule 17g; criteria 67, 70, 72) — the period control on iOS:
 * a shortcut chip hands over the shortcut, a custom range goes through the shared check, the
 * label is whatever the screen was told the server echoed, and "make this my default" is offered
 * only for a shortcut that is not the default.
 */
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/button", async () => {
  const { Pressable } = await import("react-native");
  return { Button: (p: Record<string, unknown>) => createElement(Pressable, p) };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: (p: Record<string, unknown>) => createElement(Text, p) };
});
vi.mock("@/components/ui/skeleton", async () => {
  const { View } = await import("react-native");
  return { Skeleton: (p: Record<string, unknown>) => createElement(View, { ...p, testID: "skeleton" }) };
});
// The native picker as a text field: the control only needs `value`/`onChange` with ISO dates.
vi.mock("@/components/ui/date-picker-input", async () => {
  const { TextInput } = await import("react-native");
  return {
    DatePickerInput: (p: { testID: string; value: string; onChange: (v: string) => void; children?: ReactNode }) =>
      createElement(TextInput, { testID: p.testID, value: p.value, onChangeText: p.onChange }),
  };
});

import { PresencePeriodControl } from "./PresencePeriodControl";
import { shortcutChoice } from "./presences-period";

describe("PresencePeriodControl (PAD-837c)", () => {
  it("[ATTENDANCE-VALIDATION-70] a shortcut chip hands over that shortcut; the chips are the shared list", async () => {
    const onChoose = vi.fn();
    const ui = await renderNative(
      <PresencePeriodControl
        choice={shortcutChoice("thisMonth")}
        defaultPeriod="thisMonth"
        label="01/11/2026 – 15/11/2026"
        onChoose={onChoose}
        onMakeDefault={() => {}}
      />
    );
    for (const shortcut of ["thisWeek", "thisMonth", "lastMonth"]) ui.byTestId(`presences-period-${shortcut}`);
    expect(ui.queryByTestId("presences-period-season")).toBeNull();
    expect(ui.byTestId("presences-period-thisMonth").props.accessibilityState).toMatchObject({ selected: true });
    await ui.press("presences-period-lastMonth");
    expect(onChoose).toHaveBeenCalledWith(shortcutChoice("lastMonth"));
  });

  it("[ATTENDANCE-VALIDATION-67] shows the label it was given (the echoed bounds), and a placeholder without one", async () => {
    const ui = await renderNative(
      <PresencePeriodControl
        choice={shortcutChoice("thisMonth")}
        defaultPeriod="thisMonth"
        label={null}
        onChoose={() => {}}
        onMakeDefault={() => {}}
      />
    );
    expect(ui.queryByTestId("presences-period-label")).toBeNull();
    ui.byTestId("skeleton");
    await ui.rerender(
      <PresencePeriodControl
        choice={shortcutChoice("thisMonth")}
        defaultPeriod="thisMonth"
        label="01/11/2026 – 15/11/2026"
        onChoose={() => {}}
        onMakeDefault={() => {}}
      />
    );
    expect(ui.byTestId("presences-period-label").props.accessibilityValue).toEqual({ text: "01/11/2026 – 15/11/2026" });
  });

  it("[ATTENDANCE-VALIDATION-70] a custom range is applied only when the shared check accepts it", async () => {
    const onChoose = vi.fn();
    const ui = await renderNative(
      <PresencePeriodControl
        choice={shortcutChoice("thisMonth")}
        defaultPeriod="thisMonth"
        label="x"
        onChoose={onChoose}
        onMakeDefault={() => {}}
      />
    );
    expect(ui.queryByTestId("presences-period-fields")).toBeNull();
    await ui.press("presences-period-custom");
    await ui.changeText("presences-period-from", "2026-10-01");
    await ui.changeText("presences-period-to", "2026-09-01");
    await ui.press("presences-period-apply");
    expect(onChoose).not.toHaveBeenCalled();
    expect(ui.byTestId("presences-period-invalid").props.role).toBe("alert");
    await ui.changeText("presences-period-to", "2026-10-31");
    await ui.press("presences-period-apply");
    expect(onChoose).toHaveBeenCalledWith({ kind: "custom", from: "2026-10-01", to: "2026-10-31" });
    expect(ui.queryByTestId("presences-period-invalid")).toBeNull();
  });

  it("[ATTENDANCE-VALIDATION-72] offers 'make this my default' for a shortcut that is not the default, and for nothing else", async () => {
    const onMakeDefault = vi.fn();
    const ui = await renderNative(
      <PresencePeriodControl
        choice={shortcutChoice("lastMonth")}
        defaultPeriod="thisMonth"
        label="x"
        onChoose={() => {}}
        onMakeDefault={onMakeDefault}
      />
    );
    await ui.press("presences-period-make-default");
    expect(onMakeDefault).toHaveBeenCalledWith("lastMonth");

    await ui.rerender(
      <PresencePeriodControl
        choice={shortcutChoice("thisMonth")}
        defaultPeriod="thisMonth"
        label="x"
        onChoose={() => {}}
        onMakeDefault={onMakeDefault}
      />
    );
    expect(ui.queryByTestId("presences-period-make-default")).toBeNull();
    ui.byTestId("presences-period-default-note");

    await ui.rerender(
      <PresencePeriodControl
        choice={{ kind: "custom", from: "2026-10-01", to: "2026-10-31" }}
        defaultPeriod="thisMonth"
        label="x"
        onChoose={() => {}}
        onMakeDefault={onMakeDefault}
      />
    );
    expect(ui.queryByTestId("presences-period-make-default")).toBeNull();
    expect(ui.queryByTestId("presences-period-default-note")).toBeNull();
  });
});
