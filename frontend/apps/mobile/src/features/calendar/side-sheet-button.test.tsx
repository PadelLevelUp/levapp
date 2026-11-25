/**
 * PAD-843 (classes.join-requests rule 20): the side sheets' action buttons keep the design system's
 * look on the phone. The fill and the label colour are resolved from the rendered element, active
 * and disabled, so a style that never reaches the Pressable (a `style` function, which NativeWind
 * drops on iOS) fails here. Located by test id.
 */
import { describe, expect, it, vi } from "vitest";
import { lightTheme } from "@levelup/config";
import { renderNative } from "@/test/render-native";

vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text };
});

import { SideSheetButton } from "./side-sheet-button";

const mount = (kind: "primary" | "outline" | "ghost", disabled = false) =>
  renderNative(<SideSheetButton testID="b" label="Enviar pedido" kind={kind} disabled={disabled} onPress={() => undefined} />);

const labelColor = (view: Awaited<ReturnType<typeof mount>>) => {
  const label = view.root.root.findAll((n) => n.props?.style?.color !== undefined && (n.type as unknown) === "Text")[0];
  return (label.props.style as { color: string }).color;
};

describe("the side sheets' action buttons", () => {
  it("[CLASSES-JOIN-REQUESTS-41] a primary button has the primary fill and white text, as a style object", async () => {
    const view = await mount("primary");
    const style = view.byTestId("b").props.style;
    expect(typeof style).toBe("object");
    expect(style.backgroundColor).toBe(lightTheme.primary);
    expect(style.height).toBe(48);
    expect(style.opacity).toBe(1);
    expect(labelColor(view)).toBe(lightTheme.primaryForeground);
  });

  it("[CLASSES-JOIN-REQUESTS-41] a disabled primary button keeps the fill, dimmed to half opacity, with white text", async () => {
    const view = await mount("primary", true);
    const style = view.byTestId("b").props.style;
    expect(style.backgroundColor).toBe(lightTheme.primary);
    expect(style.opacity).toBe(0.5);
    expect(view.byTestId("b").props.accessibilityState).toEqual({ disabled: true });
    expect(labelColor(view)).toBe(lightTheme.primaryForeground);
  });

  it("[CLASSES-JOIN-REQUESTS-41] the outline and ghost buttons have no fill and the foreground text", async () => {
    for (const kind of ["outline", "ghost"] as const) {
      const view = await mount(kind);
      const style = view.byTestId("b").props.style;
      expect(style.backgroundColor).toBe("transparent");
      expect(style.borderWidth).toBe(kind === "outline" ? 1 : 0);
      expect(labelColor(view)).toBe(lightTheme.foreground);
    }
  });

  it("[CLASSES-JOIN-REQUESTS-41] pressing dims the button through state, still as an object", async () => {
    const view = await mount("primary");
    const { act } = await import("react-test-renderer");
    await act(async () => { view.byTestId("b").props.onPressIn(); });
    expect(view.byTestId("b").props.style.opacity).toBe(0.85);
    await act(async () => { view.byTestId("b").props.onPressOut(); });
    expect(view.byTestId("b").props.style.opacity).toBe(1);
  });
});
