/**
 * PAD-932 (notifications.manual NM2): on iOS a new-engine class shows Notificar again, and the
 * dashboard's `notify=1` opens the picker, as on an old-engine class; the send takes NM1's engine path.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ClassNotifyAction, notifyState, shouldAutoOpenNotify } from "./notify-new-engine";

describe("Notificar on the iOS class screen (PAD-932)", () => {
  it("[NOTIFICATIONS-MANUAL-11] shows Notificar and opens on notify=1 on a new-engine class", async () => {
    // The engine no longer decides it; only the clock does, on both engines.
    expect(notifyState("new", false)).toBe("open");
    expect(notifyState("new", true)).toBe("started");
    expect(notifyState("old", false)).toBe("open");
    expect(notifyState(undefined, false)).toBe("open");
    expect(notifyState(undefined, true)).toBe("started");

    // Both a new-engine and an old-engine class offer Notificar, and it opens the picker.
    for (const engineVersion of ["new", "old"]) {
      const onOpen = vi.fn();
      const r = await renderNative(<ClassNotifyAction state={notifyState(engineVersion, false)} onOpen={onOpen} />);
      expect(r.queryByTestId("class-notify-closed")).toBeNull();
      await r.press("class-notify");
      expect(onOpen).toHaveBeenCalledTimes(1);
      r.root.unmount();
    }

    // notify=1 opens the picker once on either engine, and not once the class has started.
    expect(shouldAutoOpenNotify("1", true, notifyState("new", false), false)).toBe(true);
    expect(shouldAutoOpenNotify("1", true, notifyState("old", false), false)).toBe(true);
    expect(shouldAutoOpenNotify("1", true, notifyState("new", true), false)).toBe(false);
    expect(shouldAutoOpenNotify("1", true, notifyState("new", false), true)).toBe(false);
    expect(shouldAutoOpenNotify(undefined, true, notifyState("new", false), false)).toBe(false);
  });
});
