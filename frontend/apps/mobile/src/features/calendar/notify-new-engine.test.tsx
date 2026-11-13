/**
 * PAD-933 (notifications.manual NM2): on iOS a new-engine class has no Notificar, and the dashboard's
 * `notify=1` opens nothing; an old-engine class, or a payload without `engineVersion`, keeps both.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ClassNotifyAction, notifyState, shouldAutoOpenNotify } from "./notify-new-engine";

describe("Notificar on the iOS class screen (PAD-933)", () => {
  it("[NOTIFICATIONS-MANUAL-11] hides Notificar and ignores notify=1 on a new-engine class", async () => {
    // The state: the engine wins over the clock; an absent engineVersion reads as old.
    expect(notifyState("new", false)).toBe("engine");
    expect(notifyState("new", true)).toBe("engine");
    expect(notifyState("old", false)).toBe("open");
    expect(notifyState(undefined, false)).toBe("open");
    expect(notifyState(undefined, true)).toBe("started");

    // A new-engine class: neither the button nor the started warning.
    const onOpen = vi.fn();
    const engine = await renderNative(<ClassNotifyAction state={notifyState("new", false)} onOpen={onOpen} />);
    expect(engine.queryByTestId("class-notify")).toBeNull();
    expect(engine.queryByTestId("class-notify-closed")).toBeNull();
    engine.root.unmount();

    // An old-engine class keeps Notificar, and it opens the picker.
    const old = await renderNative(<ClassNotifyAction state={notifyState("old", false)} onOpen={onOpen} />);
    await old.press("class-notify");
    expect(onOpen).toHaveBeenCalledTimes(1);
    old.root.unmount();

    // notify=1 opens the picker once, only where Notificar is offered.
    expect(shouldAutoOpenNotify("1", true, notifyState("new", false), false)).toBe(false);
    expect(shouldAutoOpenNotify("1", true, notifyState("old", false), false)).toBe(true);
    expect(shouldAutoOpenNotify("1", true, notifyState(undefined, true), false)).toBe(false);
    expect(shouldAutoOpenNotify("1", true, notifyState("old", false), true)).toBe(false);
    expect(shouldAutoOpenNotify(undefined, true, notifyState("old", false), false)).toBe(false);
  });
});
