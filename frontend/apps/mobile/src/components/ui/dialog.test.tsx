/**
 * PAD-496 (review of #515): the shared DialogContent really applies the window bound. Without
 * this, deleting the style from dialog.tsx left every test green: `dialogMaxHeight` was tested
 * as arithmetic, and the Maestro flow passes on the unbounded layout of a tall phone.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

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
import { renderNative } from "@/test/render-native";
import { Dialog, DialogContent } from "./dialog";

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));

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
});
