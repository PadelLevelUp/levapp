/**
 * PAD-419 (mobile.status-bar rules 2–3). A `Screen` that owns the top edge paints the status-bar
 * area with the light background, so it must ask for dark status-bar content; a `Screen` that
 * doesn't (every tab screen, under the navy navigator header) renders none and the root's
 * "light" applies. `expo-status-bar` is stubbed as a View whose testID names the style, and
 * `react-native-safe-area-context` as a plain View (the real one does not parse under vitest).
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderNative } from "@/test/render-native";

vi.mock("expo-status-bar", async () => {
  const { View } = await import("react-native");
  const { createElement: h } = await import("react");
  return { StatusBar: ({ style }: { style?: string }) => h(View, { testID: `status-bar-${style}` }) };
});
vi.mock("react-native-safe-area-context", async () => {
  const { View } = await import("react-native");
  const { createElement: h } = await import("react");
  return { SafeAreaView: ({ children, ...rest }: { children?: ReactNode }) => h(View, rest, children) };
});

import { Screen } from "./screen";

describe("Screen and the status bar (PAD-419)", () => {
  it("a Screen that owns the top edge asks for dark status-bar content (rule 2)", async () => {
    const n = await renderNative(createElement(Screen, { edges: ["top"], testID: "s" }));
    expect(n.queryByTestId("status-bar-dark")).not.toBeNull();
  });

  it("a Screen with a title owns the top edge too, so it asks for dark content", async () => {
    const n = await renderNative(createElement(Screen, { title: "Aula", testID: "s" }));
    expect(n.queryByTestId("status-bar-dark")).not.toBeNull();
  });

  it("a tab Screen (no top edge) renders no status bar of its own; the root's light applies", async () => {
    const n = await renderNative(createElement(Screen, { testID: "s" }));
    expect(n.queryByTestId("status-bar-dark")).toBeNull();
    expect(n.queryByTestId("status-bar-light")).toBeNull();
  });
});
