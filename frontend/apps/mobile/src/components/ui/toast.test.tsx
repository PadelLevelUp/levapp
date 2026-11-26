/**
 * The toast item has a test id, so a Maestro flow can wait for it to be gone: it is a Pressable over the bottom of the
 * screen and swallows a tap on whatever is under it (flow 66: "Leave the waiting list" under "You joined the waiting list").
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@rn-primitives/portal", () => ({ Portal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { toast, ToastHost } from "./toast";

afterEach(() => vi.useRealTimers());

describe("toast item id", () => {
  it("a shown toast carries testID toast-item, and no id is left once it is gone", async () => {
    const ui = await renderNative(<ToastHost />);
    expect(ui.queryByTestId("toast-item")).toBeNull();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    toast.success("You joined the waiting list");
    await vi.advanceTimersByTimeAsync(50);
    expect(ui.queryByTestId("toast-item")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(4500);
    expect(ui.queryByTestId("toast-item")).toBeNull();
    ui.root.unmount();
  });
});
