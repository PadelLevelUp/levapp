/**
 * PAD-496 (review of #515): the shared DialogContent really applies the window bound. Without
 * this, deleting the style from dialog.tsx left every test green: `dialogMaxHeight` was tested
 * as arithmetic, and the Maestro flow passes on the unbounded layout of a tall phone.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/lib/font-class", () => ({ resolveFontClass: (c: string) => c }));
vi.mock("@/lib/dialog-motion", () => ({ dialogEntering: () => undefined, dialogExiting: () => undefined }));
vi.mock("@rn-primitives/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, accessibilityLabel: (props.accessibilityLabel as string) ?? name });
  return {
    Root: ({ children }: { children: React.ReactNode }) => children,
    Trigger: pass("Trigger"),
    Portal: ({ children }: { children: React.ReactNode }) => children,
    Close: pass("Close"),
    Overlay: pass("Overlay"),
    Content: pass("Content"),
    Title: pass("Title"),
    Description: pass("Description"),
    useRootContext: () => ({ open: true, onOpenChange: () => undefined }),
  };
});

import { DIALOG_WINDOW_MARGIN } from "@/lib/dialog-size";
import { Platform, __emitKeyboardEvent, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { Dialog, DialogContent } from "./dialog";

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));

/** The test window is 844 pt tall; a keyboard covering `cover` pt of it shows (iOS `will` event). */
const showKeyboard = (cover: number) =>
  act(() => __emitKeyboardEvent("keyboardWillShow", { endCoordinates: { screenY: 844 - cover, height: cover } }));

/** The overlay host above the panel (the mocked primitive labels itself "Overlay"). */
const overlayOf = (node: { parent: unknown; props: Record<string, unknown> } | null) => {
  let n = node;
  while (n && !(n.props.accessibilityLabel === "Overlay" && typeof (n as { type?: unknown }).type === "string"))
    n = n.parent as typeof n;
  if (!n) throw new Error("no overlay above the dialog");
  return n;
};

afterEach(() => {
  __resetReactNativeMock();
  Platform.OS = "ios";
});

describe("DialogContent", () => {
  it("is never taller than the window between its safe areas", async () => {
    const ui = await renderNative(
      <Dialog open>
        <DialogContent testID="some-dialog" />
      </Dialog>,
    );
    // The test window is 844 pt tall (react-native stub); the insets are mocked above.
    expect(flat(ui.byTestId("some-dialog").props.style).maxHeight).toBe(844 - 2 * 62 - DIALOG_WINDOW_MARGIN);
  });

  it("a caller's own style is kept, and can still set a smaller height", async () => {
    const ui = await renderNative(
      <Dialog open>
        <DialogContent testID="some-dialog" style={{ maxHeight: 300, opacity: 0.5 }} />
      </Dialog>,
    );
    const style = flat(ui.byTestId("some-dialog").props.style);
    expect(style.maxHeight).toBe(300);
    expect(style.opacity).toBe(0.5);
  });

  it("[MOBILE-ANDROID-RUNTIME-21] sits above the keyboard and fits the space left there", async () => {
    const ui = await renderNative(
      <Dialog open>
        <DialogContent testID="some-dialog" />
      </Dialog>,
    );
    await showKeyboard(300);
    // 844 window, 300 keyboard, the 62 pt top inset kept at both ends, the margin.
    expect(flat(ui.byTestId("some-dialog").props.style).maxHeight).toBe(844 - 300 - 2 * 62 - DIALOG_WINDOW_MARGIN);
    expect(flat(overlayOf(ui.byTestId("some-dialog")).props.style).paddingBottom).toBe(300);

    await act(() => __emitKeyboardEvent("keyboardWillHide", { endCoordinates: { screenY: 844, height: 0 } }));
    expect(flat(ui.byTestId("some-dialog").props.style).maxHeight).toBe(844 - 2 * 62 - DIALOG_WINDOW_MARGIN);
    expect(flat(overlayOf(ui.byTestId("some-dialog")).props.style).paddingBottom).toBeUndefined();
  });

  it("[MOBILE-ANDROID-RUNTIME-21] a caller's own height gives way to the keyboard, and only to it", async () => {
    const ui = await renderNative(
      <Dialog open>
        <DialogContent testID="tall" style={{ maxHeight: 717 }} />
      </Dialog>,
    );
    expect(flat(ui.byTestId("tall").props.style).maxHeight).toBe(717);
    await showKeyboard(300);
    expect(flat(ui.byTestId("tall").props.style).maxHeight).toBe(844 - 300 - 2 * 62 - DIALOG_WINDOW_MARGIN);

    // A caller smaller than the space above the keyboard keeps its own.
    const small = await renderNative(
      <Dialog open>
        <DialogContent testID="small" style={{ maxHeight: 200 }} />
      </Dialog>,
    );
    await showKeyboard(300);
    expect(flat(small.byTestId("small").props.style).maxHeight).toBe(200);
  });

  it("[MOBILE-ANDROID-RUNTIME-21] follows a keyboard that changes height, and Android's did events", async () => {
    const ui = await renderNative(
      <Dialog open>
        <DialogContent testID="some-dialog" />
      </Dialog>,
    );
    await showKeyboard(260);
    // The predictive bar appears: no new show event on iOS, only a frame change.
    await act(() =>
      __emitKeyboardEvent("keyboardWillChangeFrame", { endCoordinates: { screenY: 844 - 304, height: 304 } }),
    );
    expect(flat(overlayOf(ui.byTestId("some-dialog")).props.style).paddingBottom).toBe(304);

    Platform.OS = "android";
    const android = await renderNative(
      <Dialog open>
        <DialogContent testID="android-dialog" />
      </Dialog>,
    );
    await act(() => __emitKeyboardEvent("keyboardDidShow", { endCoordinates: { screenY: 844 - 280, height: 280 } }));
    expect(flat(overlayOf(android.byTestId("android-dialog")).props.style).paddingBottom).toBe(280);
  });
});
