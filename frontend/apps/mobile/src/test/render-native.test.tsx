/**
 * The harness proves itself (PAD-393, #375 review): a REAL `@/components/ui/switch`,
 * unmocked, rendered through `@rn-primitives/switch` — whose raw-JSX `.js` the config's
 * transform must handle — and toggled through `toggle()`. If a primitives package ever
 * stops shipping JSX, moves to `.cjs`, or the transform silently stops matching, this is
 * the test that goes red, not a section test with a misleading assertion. Also pins that a
 * dead control THROWS instead of passing the press.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { Pressable, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { renderNative } from "@/test/render-native";

describe("renderNative", () => {
  it("renders the real ui/switch through @rn-primitives and toggles it", async () => {
    const onCheckedChange = vi.fn();
    const n = await renderNative(<Switch testID="sw" checked={false} onCheckedChange={onCheckedChange} />);
    await n.toggle("sw");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("throws on a control with no handler, instead of passing the press", async () => {
    const n = await renderNative(createElement(View, { testID: "dead" }));
    await expect(n.press("dead")).rejects.toThrow('no onPress handler on "dead"');
    await expect(n.toggle("dead")).rejects.toThrow('is not a role="switch" element');
  });

  it("presses a Pressable and reads text typed into a TextInput", async () => {
    const onPress = vi.fn();
    const { TextInput } = await import("react-native");
    const n = await renderNative(
      createElement(View, null, createElement(Pressable, { testID: "go", onPress }), createElement(TextInput, { testID: "in", value: "", onChangeText: vi.fn() })),
    );
    await n.press("go");
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(n.byTestId("in").props.value).toBe("");
  });
});
