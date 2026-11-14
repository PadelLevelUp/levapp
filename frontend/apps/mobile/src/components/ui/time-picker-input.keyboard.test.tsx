/**
 * PAD-838 (mobile.android-runtime rule 15): the iOS time picker's native wheel cannot shrink, and
 * with it the dialog does not fit above the keyboard on a small iPhone. While the typed field has
 * the keyboard the wheel steps aside, and it comes back when the keyboard goes.
 */
import { createElement, type ReactNode } from "react";
import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@react-native-community/datetimepicker", async () => {
  const { View } = await import("react-native");
  return {
    default: (p: { testID?: string }) => createElement(View, { testID: p.testID }),
    DateTimePickerAndroid: { open: vi.fn() },
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (p: { children?: ReactNode; open?: boolean }) =>
    p.open === false ? null : createElement(View, null, p.children);
  return { Dialog: pass, DialogContent: pass, DialogFooter: pass, DialogHeader: pass, DialogTitle: pass };
});

import { Platform, __emitKeyboardEvent, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { TimePickerInput } from "./time-picker-input";

afterEach(() => {
  __resetReactNativeMock();
  Platform.OS = "ios";
});

describe("TimePickerInput: the keyboard", () => {
  it("[MOBILE-ANDROID-RUNTIME-22] the wheel steps aside while the keyboard is up, and comes back", async () => {
    Platform.OS = "ios";
    const ui = await renderNative(<TimePickerInput testID="start" value="18:30" onChange={() => {}} />);
    await ui.press("start");
    expect(ui.queryByTestId("start-wheel")).not.toBeNull();

    await act(() => __emitKeyboardEvent("keyboardWillShow"));
    expect(ui.queryByTestId("start-wheel")).toBeNull();
    expect(ui.queryByTestId("start-typed")).not.toBeNull();

    await act(() => __emitKeyboardEvent("keyboardWillHide"));
    expect(ui.queryByTestId("start-wheel")).not.toBeNull();
  });
});
